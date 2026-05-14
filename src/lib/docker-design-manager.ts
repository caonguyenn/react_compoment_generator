import { execFile } from 'child_process';
import { promisify } from 'util';
import http from 'http';
import { PortPool } from './port-pool';
import { designService } from './design-service';
import {
  DOCKER_ENABLED,
  DOCKER_PORT_START,
  DOCKER_PORT_END,
  MAX_DOCKER_STACKS,
  DOCKER_IDLE_TIMEOUT,
  DOCKER_STARTUP_TIMEOUT,
} from './design-constants';

const exec = promisify(execFile);

export interface StackInfo {
  designId: string;
  projectName: string;
  port: number;
  status: 'starting' | 'ready' | 'error' | 'stopping';
  startedAt: number;
  lastAccess: number;
  url: string;
}

/**
 * DooD (Docker-out-of-Docker) stack manager using Docker Compose for dynamic designs.
 * Each design gets its own docker-compose.yml with Next.js app + Postgres.
 */
class DockerDesignManager {
  private stacks = new Map<string, StackInfo>();
  private pending = new Map<string, Promise<StackInfo>>();
  private portPool: PortPool;
  private idleCheckInterval?: NodeJS.Timeout;

  constructor() {
    this.portPool = new PortPool(DOCKER_PORT_START, DOCKER_PORT_END);

    if (!DOCKER_ENABLED) {
      console.warn('[DockerDesignManager] Docker support disabled (DOCKER_ENABLED=false)');
      return;
    }

    this.startIdleChecker();
    this.registerCleanupHandlers();

    // Cleanup orphaned compose stacks on startup
    this.cleanupOrphans().catch(err => {
      console.error('[DockerDesignManager] Orphan cleanup failed:', err);
    });
  }

  /**
   * Validate design ID format (nanoid 12 chars)
   */
  private validateDesignId(id: string): void {
    if (!/^[A-Za-z0-9_-]{12}$/.test(id)) {
      throw new Error('Invalid design ID format');
    }
  }

  /**
   * Get project name for docker compose (must be valid compose project name)
   */
  private getProjectName(designId: string): string {
    // Docker Compose project names must be lowercase alphanumeric + hyphens
    return `design-${designId.toLowerCase()}`;
  }

  /**
   * Ensure a Docker stack is running for the design.
   * Starts if not running, returns info if already started.
   * Thread-safe: concurrent calls for same ID return same Promise.
   */
  async ensureStack(designId: string): Promise<StackInfo> {
    this.validateDesignId(designId);

    if (!DOCKER_ENABLED) {
      throw new Error('Docker support is disabled');
    }

    // Return existing stack if ready
    const existing = this.stacks.get(designId);
    if (existing && (existing.status === 'ready' || existing.status === 'starting')) {
      this.recordAccess(designId);

      // If starting, wait for it
      if (existing.status === 'starting' && this.pending.has(designId)) {
        return this.pending.get(designId)!;
      }

      return existing;
    }

    // If already starting, return pending promise
    if (this.pending.has(designId)) {
      return this.pending.get(designId)!;
    }

    // Start new stack
    const promise = (async () => {
      try {
        return await this.doStartStack(designId);
      } catch (error) {
        this.pending.delete(designId);
        throw error;
      }
    })();

    this.pending.set(designId, promise);

    try {
      return await promise;
    } finally {
      this.pending.delete(designId);
    }
  }

  /**
   * Internal: Start Docker Compose stack
   */
  private async doStartStack(designId: string): Promise<StackInfo> {
    // Verify design exists
    const designPath = designService.getDesignPath(designId);
    try {
      const fs = await import('fs/promises');
      await fs.access(designPath);
      // Verify docker-compose.yml exists
      await fs.access(`${designPath}/docker-compose.yml`);
    } catch {
      throw new Error(`Design or docker-compose.yml not found: ${designId}`);
    }

    // LRU eviction if at capacity
    if (this.stacks.size >= MAX_DOCKER_STACKS) {
      await this.evictLRU();
    }

    // Allocate port
    const port = this.portPool.allocate(designId);

    const now = Date.now();
    const projectName = this.getProjectName(designId);
    const stackInfo: StackInfo = {
      designId,
      projectName,
      port,
      status: 'starting',
      startedAt: now,
      lastAccess: now,
      url: `/api/designs/${designId}/preview/proxy/`,
    };

    this.stacks.set(designId, stackInfo);

    try {
      // Update docker-compose.yml with allocated port
      await this.updateComposePort(designPath, port);

      // Start docker compose (cwd = designPath, so docker-compose.yml is found automatically)
      await exec('docker', [
        'compose',
        '-p', projectName,
        'up', '-d',
        '--build',
        '--remove-orphans',
      ], {
        cwd: designPath,
      });

      // Give the container time to start npm install before polling
      console.log(`[DockerDesignManager] Waiting for container to start npm install...`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second grace period

      // Wait for HTTP ready
      await this.waitForHTTP(port);

      // Update status
      stackInfo.status = 'ready';
      console.log(`[DockerDesignManager] Stack started for design ${designId} on port ${port}`);

      return stackInfo;
    } catch (error) {
      // Cleanup on failure
      stackInfo.status = 'error';
      await this.destroyStack(designId, true);
      throw error;
    }
  }

  /**
   * Update port in docker-compose.yml
   */
  private async updateComposePort(designPath: string, port: number): Promise<void> {
    const fs = await import('fs/promises');
    const composePath = `${designPath}/docker-compose.yml`;
    let content = await fs.readFile(composePath, 'utf-8');

    // Replace port binding in app service (handles both "3000:3000" and "0.0.0.0:3000:3000" formats)
    content = content.replace(
      /ports:\s*\n\s*-\s*["']?(?:0\.0\.0\.0:)?(?:\d+):3000["']?/,
      `ports:\n      - "0.0.0.0:${port}:3000"`
    );

    await fs.writeFile(composePath, content, 'utf-8');
  }

  /**
   * Re-run prisma generate + migrate inside a running stack's app container.
   * Called after schema.prisma is updated on disk so the Prisma client is regenerated
   * before Next.js HMR reloads the code that imports it.
   */
  async regeneratePrisma(designId: string): Promise<void> {
    const stack = this.stacks.get(designId);
    if (!stack || stack.status !== 'ready') {
      // Stack not running — the next `docker compose up` will run prisma generate at startup
      return;
    }

    const projectName = this.getProjectName(designId);
    const designPath = designService.getDesignPath(designId);

    try {
      await exec('docker', [
        'compose', '-p', projectName,
        'exec', '-T', 'app',
        'sh', '-c',
        'npx prisma generate && npx prisma migrate deploy 2>/dev/null || npx prisma db push --accept-data-loss',
      ], { cwd: designPath });
      console.log(`[DockerDesignManager] Prisma regenerated for design ${designId}`);
    } catch (error) {
      console.error(`[DockerDesignManager] Prisma regen failed for ${designId}:`, error);
      // Non-fatal — app will show an error but won't crash the host
    }
  }

  /**
   * Stop Docker Compose stack
   */
  async stopStack(designId: string): Promise<void> {
    const stack = this.stacks.get(designId);
    if (!stack) return;

    stack.status = 'stopping';

    try {
      const designPath = designService.getDesignPath(designId);
      await exec('docker', [
        'compose',
        '-p', stack.projectName,
        'down',
      ], {
        cwd: designPath,
      });

      this.portPool.release(designId);
      this.stacks.delete(designId);
      console.log(`[DockerDesignManager] Stack stopped for design ${designId}`);
    } catch (error) {
      console.error(`[DockerDesignManager] Error stopping stack ${designId}:`, error);
      this.portPool.release(designId);
      this.stacks.delete(designId);
      throw error;
    }
  }

  /**
   * Destroy entire stack including volumes
   */
  async destroyStack(designId: string, force = false): Promise<void> {
    const stack = this.stacks.get(designId);
    const projectName = stack?.projectName || this.getProjectName(designId);

    try {
      const designPath = designService.getDesignPath(designId);

      // Try with compose file first (if design folder still exists)
      try {
        const fs = await import('fs/promises');
        await fs.access(`${designPath}/docker-compose.yml`);

        await exec('docker', [
          'compose',
          '-p', projectName,
          'down',
          '-v',
        ], {
          cwd: designPath,
        });
      } catch {
        // Compose file doesn't exist, try project name only
        // This works if containers are still running
        console.warn(`[DockerDesignManager] Compose file not found, using project name fallback for ${designId}`);

        // Stop containers by project label
        const { stdout: containerIds } = await exec('docker', [
          'ps', '-aq',
          '--filter', `label=com.docker.compose.project=${projectName}`,
        ]).catch(() => ({ stdout: '' }));

        if (containerIds.trim()) {
          const ids = containerIds.trim().split('\n');
          await exec('docker', ['rm', '-f', ...ids]).catch(() => {});
        }

        // Remove project volumes
        const { stdout: volumes } = await exec('docker', [
          'volume', 'ls', '-q',
          '--filter', `label=com.docker.compose.project=${projectName}`,
        ]).catch(() => ({ stdout: '' }));

        if (volumes.trim()) {
          const volList = volumes.trim().split('\n');
          await exec('docker', ['volume', 'rm', ...volList]).catch(() => {});
        }

        // Remove project network
        const { stdout: networks } = await exec('docker', [
          'network', 'ls', '-q',
          '--filter', `label=com.docker.compose.project=${projectName}`,
        ]).catch(() => ({ stdout: '' }));

        if (networks.trim()) {
          const netList = networks.trim().split('\n');
          await exec('docker', ['network', 'rm', ...netList]).catch(() => {});
        }
      }

      if (stack) {
        this.portPool.release(designId);
        this.stacks.delete(designId);
      }

      console.log(`[DockerDesignManager] Stack destroyed for design ${designId}`);
    } catch (error) {
      console.error(`[DockerDesignManager] Error destroying stack ${designId}:`, error);
      if (!force) throw error;
    }
  }

  /**
   * Get stack info (or null if not running)
   */
  getStack(designId: string): StackInfo | null {
    return this.stacks.get(designId) || null;
  }

  /**
   * Evict LRU stack to free capacity
   */
  private async evictLRU(): Promise<void> {
    let oldestId: string | null = null;
    let oldestAccess = Infinity;

    this.stacks.forEach((stack, id) => {
      if (stack.status === 'ready' && stack.lastAccess < oldestAccess) {
        oldestAccess = stack.lastAccess;
        oldestId = id;
      }
    });

    if (oldestId) {
      console.log(`[DockerDesignManager] LRU evicting design ${oldestId}`);
      await this.stopStack(oldestId);
    }
  }

  /**
   * Record access for LRU tracking
   */
  private recordAccess(designId: string): void {
    const stack = this.stacks.get(designId);
    if (stack) {
      stack.lastAccess = Date.now();
    }
  }

  /**
   * Background idle checker (every 60s)
   */
  private startIdleChecker(): void {
    this.idleCheckInterval = setInterval(() => {
      this.checkIdle().catch(err => {
        console.error('[DockerDesignManager] Idle check failed:', err);
      });
    }, 60000);
  }

  /**
   * Stop stacks idle for > DOCKER_IDLE_TIMEOUT
   */
  private async checkIdle(): Promise<void> {
    const now = Date.now();
    const toStop: string[] = [];

    this.stacks.forEach((stack, id) => {
      if (stack.status === 'ready' && now - stack.lastAccess > DOCKER_IDLE_TIMEOUT) {
        toStop.push(id);
      }
    });

    for (const id of toStop) {
      console.log(`[DockerDesignManager] Stopping idle stack ${id}`);
      await this.stopStack(id).catch(err => {
        console.error(`[DockerDesignManager] Error stopping idle stack ${id}:`, err);
      });
    }
  }

  /**
   * Cleanup orphaned compose projects on startup
   */
  private async cleanupOrphans(): Promise<void> {
    try {
      // List all containers with compose project labels starting with "design-"
      const { stdout: containerIds } = await exec('docker', [
        'ps', '-aq',
        '--filter', 'label=com.docker.compose.project',
      ]).catch(() => ({ stdout: '' }));

      if (!containerIds.trim()) return;

      // Get project names from containers
      const projectNames = new Set<string>();
      const ids = containerIds.trim().split('\n');

      for (const id of ids) {
        const { stdout } = await exec('docker', [
          'inspect',
          '--format', '{{index .Config.Labels "com.docker.compose.project"}}',
          id,
        ]).catch(() => ({ stdout: '' }));

        const projectName = stdout.trim();
        if (projectName.startsWith('design-')) {
          projectNames.add(projectName);
        }
      }

      // Cleanup each orphaned design project
      for (const projectName of Array.from(projectNames)) {
        // Check if container is stopped
        const { stdout: status } = await exec('docker', [
          'ps', '-a',
          '--filter', `label=com.docker.compose.project=${projectName}`,
          '--filter', 'status=exited',
          '--format', '{{.ID}}',
        ]).catch(() => ({ stdout: '' }));

        if (status.trim()) {
          // Remove stopped containers
          const stoppedIds = status.trim().split('\n');
          await exec('docker', ['rm', '-f', ...stoppedIds]).catch(() => {});

          // Remove volumes
          const { stdout: volumes } = await exec('docker', [
            'volume', 'ls', '-q',
            '--filter', `label=com.docker.compose.project=${projectName}`,
          ]).catch(() => ({ stdout: '' }));

          if (volumes.trim()) {
            const volList = volumes.trim().split('\n');
            await exec('docker', ['volume', 'rm', ...volList]).catch(() => {});
          }

          // Remove networks
          const { stdout: networks } = await exec('docker', [
            'network', 'ls', '-q',
            '--filter', `label=com.docker.compose.project=${projectName}`,
          ]).catch(() => ({ stdout: '' }));

          if (networks.trim()) {
            const netList = networks.trim().split('\n');
            await exec('docker', ['network', 'rm', ...netList]).catch(() => {});
          }

          console.log(`[DockerDesignManager] Cleaned orphaned project ${projectName}`);
        }
      }
    } catch (error) {
      console.error('[DockerDesignManager] Orphan cleanup error:', error);
    }
  }

  /**
   * Get Docker host IP for accessing host ports from within containers
   */
  private async getDockerHostIP(): Promise<string> {
    try {
      // Try to get the default bridge gateway IP
      const { stdout } = await exec('docker', [
        'network', 'inspect', 'bridge',
        '--format', '{{(index .IPAM.Config 0).Gateway}}'
      ]);
      return stdout.trim() || '172.17.0.1'; // Fallback to default bridge gateway
    } catch {
      return '172.17.0.1'; // Default Docker bridge gateway on Linux
    }
  }

  /**
   * Wait for HTTP server to be ready
   */
  private async waitForHTTP(port: number): Promise<void> {
    const maxRetries = 60;
    const retryDelay = 1000;
    const startTime = Date.now();

    // Get Docker host IP (bridge gateway) to access host ports from container
    const hostIP = await this.getDockerHostIP();
    console.log(`[DockerDesignManager] Using Docker host IP: ${hostIP} for HTTP checks`);

    for (let i = 0; i < maxRetries; i++) {
      try {
        const timeRemaining = DOCKER_STARTUP_TIMEOUT - (Date.now() - startTime);
        if (timeRemaining <= 0) {
          throw new Error(`App failed to start within ${DOCKER_STARTUP_TIMEOUT / 1000}s`);
        }

        await new Promise<void>((resolve, reject) => {
          const timeout = Math.min(5000, timeRemaining); // Increase from 2s to 5s
          // Use Docker bridge gateway IP to access ports bound on the Docker host
          const req = http.get(`http://${hostIP}:${port}/`, { timeout }, (res) => {
            if (res.statusCode && res.statusCode < 500) {
              console.log(`[DockerDesignManager] HTTP check successful on port ${port}`);
              resolve();
            } else {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          });

          req.on('error', (err) => {
            // Log connection errors for debugging
            if (i % 10 === 0) { // Log every 10th attempt
              console.log(`[DockerDesignManager] HTTP check attempt ${i + 1}/${maxRetries} failed:`, err.message);
            }
            reject(err);
          });
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
          });
        });

        return;
      } catch {
        const timeElapsed = Date.now() - startTime;
        console.log(`[DockerDesignManager] HTTP check failed, elapsed: ${timeElapsed}ms, timeout: ${DOCKER_STARTUP_TIMEOUT}ms, attempt: ${i + 1}/${maxRetries}`);
        if (timeElapsed > DOCKER_STARTUP_TIMEOUT) {
          throw new Error(`App failed to start within ${DOCKER_STARTUP_TIMEOUT / 1000}s`);
        }
        if (i === maxRetries - 1) {
          throw new Error('App failed to respond to HTTP requests');
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  /**
   * Graceful shutdown: stop all stacks
   */
  async stopAll(): Promise<void> {
    console.log('[DockerDesignManager] Stopping all stacks...');

    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
    }

    const promises = Array.from(this.stacks.keys()).map(id =>
      this.stopStack(id).catch(err => {
        console.error(`[DockerDesignManager] Error stopping stack ${id}:`, err);
      })
    );

    await Promise.all(promises);
    console.log('[DockerDesignManager] All stacks stopped');
  }

  /**
   * Register cleanup handlers
   */
  private registerCleanupHandlers(): void {
    const cleanup = () => {
      this.stopAll().catch(err => {
        console.error('[DockerDesignManager] Cleanup error:', err);
      });
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('beforeExit', cleanup);
  }
}

// Singleton instance (global across module reloads)
const getDockerDesignManager = (): DockerDesignManager => {
  if (!globalThis.__dockerDesignManager) {
    globalThis.__dockerDesignManager = new DockerDesignManager();
  }
  return globalThis.__dockerDesignManager;
};

export const dockerDesignManager = getDockerDesignManager();

// Type augmentation for global
declare global {
  // eslint-disable-next-line no-var
  var __dockerDesignManager: DockerDesignManager | undefined;
}
