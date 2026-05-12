import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { PortPool } from './port-pool';
import { designService } from './design-service';
import {
  MAX_VITE_SERVERS,
  VITE_IDLE_TIMEOUT,
  VITE_STARTUP_TIMEOUT,
  SHARED_NODE_MODULES,
} from './design-constants';

export interface ServerInfo {
  designId: string;
  port: number;
  pid: number;
  status: 'starting' | 'ready' | 'error' | 'stopping';
  startedAt: number;
  lastAccess: number;
  url: string;
  basePath: string;
}

/**
 * Vite dev server process manager
 * Handles lifecycle, LRU eviction, idle timeout, graceful shutdown
 */
class ViteServerManager {
  private servers = new Map<string, ServerInfo>();
  private processes = new Map<string, ChildProcess>();
  private portPool: PortPool;
  private pending = new Map<string, Promise<ServerInfo>>();
  private idleCheckInterval?: NodeJS.Timeout;

  constructor() {
    this.portPool = new PortPool();
    this.startIdleChecker();
    this.registerCleanupHandlers();
  }

  /**
   * Ensure a Vite server is running for the design.
   * Starts if not running, returns info if already started.
   * Thread-safe: concurrent calls for same ID return same Promise.
   */
  async ensureServer(designId: string): Promise<ServerInfo> {
    // Return existing server if ready
    const existing = this.servers.get(designId);
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

    // Start new server
    const promise = this.doStartServer(designId);
    this.pending.set(designId, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pending.delete(designId);
    }
  }

  /**
   * Internal method to start a server (with LRU eviction)
   */
  private async doStartServer(designId: string): Promise<ServerInfo> {
    // Check if design exists
    const designPath = designService.getDesignPath(designId);
    try {
      const fs = await import('fs/promises');
      await fs.access(designPath);
    } catch {
      throw new Error(`Design not found: ${designId}`);
    }

    // LRU eviction if at capacity
    if (this.servers.size >= MAX_VITE_SERVERS) {
      await this.evictLRUServer();
    }

    // Allocate port
    const port = this.portPool.allocate(designId);

    // Create server info
    const now = Date.now();
    const basePath = `/api/designs/${designId}/preview/proxy/`;
    const serverInfo: ServerInfo = {
      designId,
      port,
      pid: 0, // Will be set after spawn
      status: 'starting',
      startedAt: now,
      lastAccess: now,
      url: basePath,
      basePath,
    };

    this.servers.set(designId, serverInfo);

    try {
      // Use Vite binary from shared node_modules
      const viteBin = path.resolve(process.cwd(), SHARED_NODE_MODULES, '.bin', 'vite');

      const basePath = `/api/designs/${designId}/preview/proxy/`;
      const proc = spawn(viteBin, ['--port', port.toString(), '--host', '0.0.0.0', '--base', basePath], {
        cwd: designPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env: { ...process.env, NODE_ENV: 'development' },
      });

      if (!proc.pid) {
        throw new Error('Failed to spawn Vite process');
      }

      serverInfo.pid = proc.pid;
      this.processes.set(designId, proc);

      // Setup process handlers
      this.setupProcessHandlers(designId, proc);

      // Wait for Vite to be ready
      await this.waitForReady(designId, proc, port);

      // Update status
      serverInfo.status = 'ready';
      console.log(`[ViteServerManager] Server started for design ${designId} on port ${port}`);

      return serverInfo;
    } catch (error) {
      // Cleanup on failure
      serverInfo.status = 'error';
      this.portPool.release(designId);
      this.servers.delete(designId);
      this.processes.delete(designId);

      throw error;
    }
  }

  /**
   * Wait for Vite server to be ready: first wait for log output, then probe HTTP.
   * Vite logs "ready in" before accepting connections, so we must confirm via HTTP.
   */
  private waitForReady(designId: string, proc: ChildProcess, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        proc.kill('SIGKILL');
        reject(new Error('Vite startup timeout'));
      }, VITE_STARTUP_TIMEOUT);

      let stderrData = '';

      const cleanup = () => {
        clearTimeout(timeout);
        proc.stdout?.removeAllListeners('data');
        proc.stderr?.removeAllListeners('data');
        proc.removeAllListeners('exit');
      };

      // After log fires, probe HTTP until it actually responds
      const probeHttp = (attemptsLeft = 20): void => {
        const http = require('http') as typeof import('http');
        const req = http.get(`http://localhost:${port}/api/designs/${designId}/preview/proxy/`, (res) => {
          res.resume();
          cleanup();
          resolve();
        });
        req.on('error', () => {
          if (attemptsLeft <= 0) {
            cleanup();
            reject(new Error('Vite HTTP probe timed out'));
            return;
          }
          setTimeout(() => probeHttp(attemptsLeft - 1), 200);
        });
        req.setTimeout(500, () => {
          req.destroy();
          setTimeout(() => probeHttp(attemptsLeft - 1), 200);
        });
      };

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        if (text.includes(`localhost:${port}`) || text.includes('ready in')) {
          // Log fired — now confirm HTTP is actually accepting connections
          probeHttp();
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderrData += data.toString();
      });

      proc.on('exit', (code) => {
        cleanup();
        reject(
          new Error(
            `Vite process exited with code ${code}\nStderr: ${stderrData.slice(-500)}`
          )
        );
      });
    });
  }

  /**
   * Setup handlers for process lifecycle events
   */
  private setupProcessHandlers(designId: string, proc: ChildProcess): void {
    proc.on('exit', (code, signal) => {
      console.log(
        `[ViteServerManager] Server ${designId} exited (code: ${code}, signal: ${signal})`
      );

      // Always cleanup resources on exit (expected or not)
      this.portPool.release(designId);
      this.servers.delete(designId);
      this.processes.delete(designId);
    });

    proc.on('error', (error) => {
      console.error(`[ViteServerManager] Server ${designId} error:`, error);
      const serverInfo = this.servers.get(designId);
      if (serverInfo) {
        serverInfo.status = 'error';
      }
    });

    // Capture stderr for debugging (but don't spam logs)
    let stderrBuffer = '';
    proc.stderr?.on('data', (data: Buffer) => {
      stderrBuffer += data.toString();
      // Keep only last 1000 chars
      if (stderrBuffer.length > 1000) {
        stderrBuffer = stderrBuffer.slice(-1000);
      }
    });
  }

  /**
   * Stop a specific server gracefully
   */
  async stopServer(designId: string): Promise<void> {
    const serverInfo = this.servers.get(designId);
    const proc = this.processes.get(designId);

    if (!serverInfo || !proc) {
      // Already stopped or doesn't exist
      this.portPool.release(designId);
      this.servers.delete(designId);
      this.processes.delete(designId);
      return;
    }

    serverInfo.status = 'stopping';
    console.log(`[ViteServerManager] Stopping server ${designId} (PID: ${serverInfo.pid})`);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill after 3s
        if (!proc.killed) {
          console.log(`[ViteServerManager] Force killing server ${designId}`);
          proc.kill('SIGKILL');
        }
        // Ensure cleanup even if exit event hasn't fired yet
        setTimeout(() => {
          this.portPool.release(designId);
          this.servers.delete(designId);
          this.processes.delete(designId);
          resolve();
        }, 100);
      }, 3000);

      proc.once('exit', () => {
        clearTimeout(timeout);
        // Cleanup will be done by exit handler, but ensure resolve happens
        setTimeout(resolve, 10);
      });

      // Send SIGTERM for graceful shutdown
      proc.kill('SIGTERM');
    });
  }

  /**
   * Get server info for a design
   */
  getServer(designId: string): ServerInfo | null {
    return this.servers.get(designId) || null;
  }

  /**
   * Get all active servers
   */
  getActiveServers(): ServerInfo[] {
    return Array.from(this.servers.values());
  }

  /**
   * Record access time (for LRU tracking)
   */
  private recordAccess(designId: string): void {
    const serverInfo = this.servers.get(designId);
    if (serverInfo) {
      serverInfo.lastAccess = Date.now();
    }
  }

  /**
   * Evict least recently used server
   */
  private async evictLRUServer(): Promise<void> {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    Array.from(this.servers.entries()).forEach(([id, info]) => {
      if (info.status === 'ready' && info.lastAccess < oldestTime) {
        oldestTime = info.lastAccess;
        oldestId = id;
      }
    });

    if (oldestId) {
      console.log(`[ViteServerManager] Evicting LRU server: ${oldestId}`);
      await this.stopServer(oldestId);
    }
  }

  /**
   * Start idle checker background task
   */
  private startIdleChecker(): void {
    this.idleCheckInterval = setInterval(() => {
      this.checkIdleServers();
    }, 60_000); // Check every 60 seconds

    // Don't prevent process exit
    if (this.idleCheckInterval.unref) {
      this.idleCheckInterval.unref();
    }
  }

  /**
   * Check and stop idle servers
   */
  private checkIdleServers(): void {
    const now = Date.now();
    const toStop: string[] = [];

    Array.from(this.servers.entries()).forEach(([id, info]) => {
      if (info.status === 'ready' && now - info.lastAccess > VITE_IDLE_TIMEOUT) {
        toStop.push(id);
      }
    });

    toStop.forEach((id) => {
      console.log(`[ViteServerManager] Stopping idle server: ${id}`);
      this.stopServer(id).catch((err) => {
        console.error(`[ViteServerManager] Error stopping idle server ${id}:`, err);
      });
    });
  }

  /**
   * Stop all servers (for graceful shutdown)
   */
  async stopAll(): Promise<void> {
    console.log('[ViteServerManager] Stopping all servers...');

    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
    }

    const stopPromises = Array.from(this.servers.keys()).map((id) => this.stopServer(id));

    await Promise.all(stopPromises);
    console.log('[ViteServerManager] All servers stopped');
  }

  /**
   * Register cleanup handlers for process signals
   */
  private registerCleanupHandlers(): void {
    const cleanup = async () => {
      await this.stopAll();
      process.exit(0);
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);

    // Note: 'exit' event doesn't allow async operations
    // Rely on SIGTERM/SIGINT for graceful shutdown
  }
}

// Persist across Next.js hot-reloads in dev mode
const globalForVite = globalThis as unknown as { __viteServerManager?: ViteServerManager };
export const viteServerManager = globalForVite.__viteServerManager ??= new ViteServerManager();
