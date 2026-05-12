import { VITE_PORT_START, VITE_PORT_END } from './design-constants';

/**
 * Port allocation manager for Vite dev servers
 * Thread-safe within single Node.js process
 */
export class PortPool {
  private available: Set<number>;
  private assigned: Map<string, number>; // designId -> port

  constructor(start: number = VITE_PORT_START, end: number = VITE_PORT_END) {
    if (start > end || start < 1024 || end > 65535) {
      throw new Error('Invalid port range');
    }

    this.available = new Set(
      Array.from({ length: end - start + 1 }, (_, i) => start + i)
    );
    this.assigned = new Map();
  }

  /**
   * Allocate a port for a design. Returns existing port if already allocated.
   */
  allocate(designId: string): number {
    // Return existing port if already assigned
    if (this.assigned.has(designId)) {
      return this.assigned.get(designId)!;
    }

    // Get first available port
    const port = this.available.values().next().value;
    if (port === undefined) {
      throw new Error('No ports available in pool');
    }

    this.available.delete(port);
    this.assigned.set(designId, port);
    return port;
  }

  /**
   * Release a port back to the pool
   */
  release(designId: string): void {
    const port = this.assigned.get(designId);
    if (port !== undefined) {
      this.available.add(port);
      this.assigned.delete(designId);
    }
  }

  /**
   * Check if a design has an allocated port
   */
  isAllocated(designId: string): boolean {
    return this.assigned.has(designId);
  }

  /**
   * Get the port assigned to a design (undefined if not allocated)
   */
  getPort(designId: string): number | undefined {
    return this.assigned.get(designId);
  }

  /**
   * Get count of available ports
   */
  getAvailableCount(): number {
    return this.available.size;
  }

  /**
   * Get count of assigned ports
   */
  getAssignedCount(): number {
    return this.assigned.size;
  }
}
