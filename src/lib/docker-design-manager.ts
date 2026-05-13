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
  POSTGRES_IMAGE,
  NEXTJS_APP_IMAGE,
  DOCKER_LABEL,
  POSTGRES_PASSWORD,
} from './design-constants';

const exec = promisify(execFile);

export interface StackInfo {
  designId: string;
  appContainerId: string;
  dbContainerId: string;
  networkId: string;
  port: number;
  status: 'starting' | 'ready' | 'error' | 'stopping';
  startedAt: number;
  lastAccess: number;
  url: string;
}

/**
 * DooD (Docker-out-of-Docker) container lifecycle manager for dynamic designs.
 * Each design gets: Next.js app container + Postgres container + Docker network + named volume.
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

    // Cleanup orphaned containers on startup
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
   * Ensure a Docker stack is running for the design.
   * Starts if not running, returns info if already started.
   * Thread-safe: concurrent calls for same ID return same Promise.
   */
  async ensureStack(designId: string): Promise<StackInfo> {
    this.validateDesignId(designId); // Prevent command injection

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

    // Start new stack - wrap in async to handle cleanup inside promise
    const promise = (async () => {
      try {
        return await this.doStartStack(designId);
      } catch (error) {
        this.pending.delete(designId); // Clean up on error
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
   * Internal: Start a complete Docker stack (network → db → app)
   */
  private async doStartStack(designId: string): Promise<StackInfo> {
    // Verify design exists
    const designPath = designService.getDesignPath(designId);
    try {
      const fs = await import('fs/promises');
      await fs.access(designPath);
    } catch {
      throw new Error(`Design not found: ${designId}`);
    }

    // LRU eviction if at capacity
    if (this.stacks.size >= MAX_DOCKER_STACKS) {
      await this.evictLRU();
    }

    // Allocate port
    const port = this.portPool.allocate(designId);

    const now = Date.now();
    const stackInfo: StackInfo = {
      designId,
      appContainerId: '',
      dbContainerId: '',
      networkId: '',
      port,
      status: 'starting',
      startedAt: now,
      lastAccess: now,
      url: `/api/designs/${designId}/preview/proxy/`,
    };

    this.stacks.set(designId, stackInfo);

    try {
      // Step 1: Create Docker network
      const networkName = `design-${designId}-net`;
      const { stdout: networkId } = await exec('docker', [
        'network', 'create',
        '--label', DOCKER_LABEL,
        networkName,
      ]);
      stackInfo.networkId = networkId.trim();

      // Step 2: Start Postgres container
      const dbName = `design-${designId}-db`;
      const volumeName = `design-${designId}-pgdata`;
      const { stdout: dbContainerId } = await exec('docker', [
        'run', '-d',
        '--name', dbName,
        '--network', networkName,
        '--label', DOCKER_LABEL,
        '-e', `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
        '-e', 'POSTGRES_DB=app',
        '-v', `${volumeName}:/var/lib/postgresql/data`,
        POSTGRES_IMAGE,
      ]);
      stackInfo.dbContainerId = dbContainerId.trim();

      // Step 3: Poll Postgres ready
      await this.waitForPostgres(dbName);

      // Step 4: Start Next.js app container
      const appName = `design-${designId}-app`;
      const databaseUrl = `postgresql://postgres:${POSTGRES_PASSWORD}@${dbName}:5432/app`;
      const { stdout: appContainerId } = await exec('docker', [
        'run', '-d',
        '--name', appName,
        '--network', networkName,
        '--label', DOCKER_LABEL,
        '-p', `${port}:3000`,
        '-e', `DATABASE_URL=${databaseUrl}`,
        '-e', 'NODE_ENV=development',
        '-v', `${designPath}:/app`,
        '-w', '/app',
        NEXTJS_APP_IMAGE,
        'sh', '-c', 'npm install && npx prisma migrate deploy && npm run dev',
      ]);
      stackInfo.appContainerId = appContainerId.trim();

      // Step 5: Poll HTTP ready
      await this.waitForHTTP(port);

      // Update status
      stackInfo.status = 'ready';
      console.log(`[DockerDesignManager] Stack started for design ${designId} on port ${port}`);

      return stackInfo;
    } catch (error) {
      // Cleanup on failure
      stackInfo.status = 'error';
      await this.destroyStack(designId, true); // force=true to cleanup partial state
      throw error;
    }
  }

  /**
   * Stop app container only (preserve db, volume, network)
   */
  async stopStack(designId: string): Promise<void> {
    const stack = this.stacks.get(designId);
    if (!stack) return;

    stack.status = 'stopping';

    try {
      if (stack.appContainerId) {
        // Wait for container to fully stop (5s grace period)
        await exec('docker', ['stop', '-t', '5', stack.appContainerId]);
        await exec('docker', ['rm', stack.appContainerId]);
      }

      this.portPool.release(designId);
      this.stacks.delete(designId);
      console.log(`[DockerDesignManager] Stack stopped for design ${designId}`);
    } catch (error) {
      console.error(`[DockerDesignManager] Error stopping stack ${designId}:`, error);
      // Still release resources to avoid deadlock
      this.portPool.release(designId);
      this.stacks.delete(designId);
      throw error;
    }
  }

  /**
   * Destroy entire stack (both containers, network, volume)
   */
  async destroyStack(designId: string, force = false): Promise<void> {
    const stack = this.stacks.get(designId);

    try {
      const appName = `design-${designId}-app`;
      const dbName = `design-${designId}-db`;
      const networkName = `design-${designId}-net`;
      const volumeName = `design-${designId}-pgdata`;

      // Stop and remove app container
      if (stack?.appContainerId || force) {
        await exec('docker', ['stop', appName]).catch(() => {});
        await exec('docker', ['rm', appName]).catch(() => {});
      }

      // Stop and remove db container
      if (stack?.dbContainerId || force) {
        await exec('docker', ['stop', dbName]).catch(() => {});
        await exec('docker', ['rm', dbName]).catch(() => {});
      }

      // Remove network
      if (stack?.networkId || force) {
        await exec('docker', ['network', 'rm', networkName]).catch(() => {});
      }

      // Remove volume
      try {
        await exec('docker', ['volume', 'rm', volumeName]);
      } catch (error) {
        console.error(`[DockerDesignManager] Failed to remove volume ${volumeName}:`, error);
        // Volume may still be mounted - will be cleaned by orphan cleanup
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
    }, 60000); // 1 minute
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
   * Cleanup orphaned containers/networks on startup
   */
  private async cleanupOrphans(): Promise<void> {
    try {
      // Find stopped containers with our label
      const { stdout: containerIds } = await exec('docker', [
        'ps', '-a',
        '--filter', `label=${DOCKER_LABEL}`,
        '--filter', 'status=exited',
        '-q',
      ]).catch(() => ({ stdout: '' }));

      if (containerIds.trim()) {
        const ids = containerIds.trim().split('\n');
        await exec('docker', ['rm', ...ids]).catch(() => {});
        console.log(`[DockerDesignManager] Removed ${ids.length} orphaned containers`);
      }

      // Find orphaned networks (no containers using them)
      const { stdout: networkList } = await exec('docker', [
        'network', 'ls',
        '--filter', `label=${DOCKER_LABEL}`,
        '--format', '{{.Name}}',
      ]).catch(() => ({ stdout: '' }));

      if (networkList.trim()) {
        const networks = networkList.trim().split('\n');
        for (const network of networks) {
          await exec('docker', ['network', 'rm', network]).catch(() => {});
        }
        console.log(`[DockerDesignManager] Cleaned ${networks.length} orphaned networks`);
      }
    } catch (error) {
      console.error('[DockerDesignManager] Orphan cleanup error:', error);
    }
  }

  /**
   * Wait for Postgres to be ready
   */
  private async waitForPostgres(containerName: string): Promise<void> {
    const maxRetries = 30;
    const retryDelay = 1000; // 1 second

    for (let i = 0; i < maxRetries; i++) {
      try {
        await exec('docker', ['exec', containerName, 'pg_isready']);
        return; // Success
      } catch {
        if (i === maxRetries - 1) {
          throw new Error('Postgres failed to start within 30 seconds');
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  /**
   * Wait for HTTP server to be ready
   */
  private async waitForHTTP(port: number): Promise<void> {
    const maxRetries = 60;
    const retryDelay = 1000; // 1 second
    const startTime = Date.now();

    for (let i = 0; i < maxRetries; i++) {
      try {
        // Check remaining time before request
        const timeRemaining = DOCKER_STARTUP_TIMEOUT - (Date.now() - startTime);
        if (timeRemaining <= 0) {
          throw new Error(`Next.js app failed to start within ${DOCKER_STARTUP_TIMEOUT / 1000}s`);
        }

        await new Promise<void>((resolve, reject) => {
          const timeout = Math.min(2000, timeRemaining);
          const req = http.get(`http://localhost:${port}/`, { timeout }, (res) => {
            if (res.statusCode && res.statusCode < 500) {
              resolve();
            } else {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          });

          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
          });
        });

        return; // Success
      } catch {
        const timeElapsed = Date.now() - startTime;
        if (timeElapsed > DOCKER_STARTUP_TIMEOUT) {
          throw new Error(`Next.js app failed to start within ${DOCKER_STARTUP_TIMEOUT / 1000}s`);
        }
        if (i === maxRetries - 1) {
          throw new Error('Next.js app failed to respond to HTTP requests');
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
