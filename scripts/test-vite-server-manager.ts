/**
 * Manual test script for Vite Server Manager
 * Usage: npx tsx scripts/test-vite-server-manager.ts
 */

import { viteServerManager } from '../src/lib/vite-server-manager';
import { designService } from '../src/lib/design-service';

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testBasicStartStop() {
  console.log('\n=== Test 1: Basic Start/Stop ===');

  try {
    // Create a test design
    const design = await designService.createDesign(
      'Test Server Manager',
      'Test prompt',
      `export default function App() { return <div>Test Component</div>; }`
    );

    console.log(`Created design: ${design.id}`);

    // Start server
    console.log('Starting server...');
    const server = await viteServerManager.ensureServer(design.id);
    console.log(`✓ Server started on port ${server.port}`);
    console.log(`  Status: ${server.status}`);
    console.log(`  URL: ${server.url}`);
    console.log(`  PID: ${server.pid}`);

    // Verify server is accessible
    await wait(1000);
    const info = viteServerManager.getServer(design.id);
    console.log(`✓ Server info retrieved: ${info?.status}`);

    // Test idempotency - calling ensureServer again should return same server
    const server2 = await viteServerManager.ensureServer(design.id);
    console.log(`✓ Idempotency check: same port? ${server.port === server2.port}`);

    // Stop server
    console.log('Stopping server...');
    await viteServerManager.stopServer(design.id);
    await wait(500);

    const stopped = viteServerManager.getServer(design.id);
    console.log(`✓ Server stopped: ${stopped === null}`);

    // Cleanup
    await designService.deleteDesign(design.id);
    console.log('✓ Design cleaned up');
  } catch (error) {
    console.error('✗ Test failed:', error);
    throw error;
  }
}

async function testMaxServersAndLRU() {
  console.log('\n=== Test 2: Max Servers & LRU Eviction ===');

  const designs: string[] = [];

  try {
    // Create 4 designs
    for (let i = 0; i < 4; i++) {
      const design = await designService.createDesign(
        `Test Design ${i + 1}`,
        `Test prompt ${i + 1}`,
        `export default function App() { return <div>Design ${i + 1}</div>; }`
      );
      designs.push(design.id);
    }

    console.log(`Created ${designs.length} designs`);

    // Start first 3 servers
    console.log('Starting first 3 servers...');
    const server1 = await viteServerManager.ensureServer(designs[0]);
    await wait(500);
    const server2 = await viteServerManager.ensureServer(designs[1]);
    await wait(500);
    const server3 = await viteServerManager.ensureServer(designs[2]);

    console.log(`✓ Server 1 on port ${server1.port}`);
    console.log(`✓ Server 2 on port ${server2.port}`);
    console.log(`✓ Server 3 on port ${server3.port}`);

    const active = viteServerManager.getActiveServers();
    console.log(`✓ Active servers: ${active.length} (expected 3)`);

    // Access server 1 and 2 to make them more recent
    await wait(1000);
    await viteServerManager.ensureServer(designs[0]); // Update lastAccess
    await viteServerManager.ensureServer(designs[1]); // Update lastAccess

    // Start 4th server - should evict server 3 (oldest access)
    console.log('Starting 4th server (should trigger LRU eviction)...');
    await wait(1000);
    const server4 = await viteServerManager.ensureServer(designs[3]);

    console.log(`✓ Server 4 on port ${server4.port}`);

    await wait(1000);
    const activeAfterEviction = viteServerManager.getActiveServers();
    console.log(`✓ Active servers after eviction: ${activeAfterEviction.length} (expected 3)`);

    // Check which server was evicted
    const server3Exists = viteServerManager.getServer(designs[2]);
    console.log(`✓ Server 3 evicted: ${server3Exists === null}`);

    // Cleanup
    await viteServerManager.stopAll();
    await wait(1000);

    for (const id of designs) {
      await designService.deleteDesign(id);
    }

    console.log('✓ All designs cleaned up');
  } catch (error) {
    console.error('✗ Test failed:', error);

    // Cleanup on error
    await viteServerManager.stopAll();
    for (const id of designs) {
      try {
        await designService.deleteDesign(id);
      } catch {}
    }

    throw error;
  }
}

async function testConcurrentRequests() {
  console.log('\n=== Test 3: Concurrent Requests (Mutex) ===');

  try {
    const design = await designService.createDesign(
      'Concurrent Test',
      'Test prompt',
      `export default function App() { return <div>Concurrent Test</div>; }`
    );

    console.log(`Created design: ${design.id}`);

    // Start 3 concurrent requests for same design
    console.log('Starting 3 concurrent requests...');
    const [server1, server2, server3] = await Promise.all([
      viteServerManager.ensureServer(design.id),
      viteServerManager.ensureServer(design.id),
      viteServerManager.ensureServer(design.id),
    ]);

    console.log(`✓ All returned same port: ${server1.port === server2.port && server2.port === server3.port}`);
    console.log(`✓ All returned same PID: ${server1.pid === server2.pid && server2.pid === server3.pid}`);

    // Only 1 server should be running
    const active = viteServerManager.getActiveServers();
    console.log(`✓ Only 1 server instance: ${active.length === 1}`);

    // Cleanup
    await viteServerManager.stopServer(design.id);
    await designService.deleteDesign(design.id);
    console.log('✓ Design cleaned up');
  } catch (error) {
    console.error('✗ Test failed:', error);
    throw error;
  }
}

async function testNonExistentDesign() {
  console.log('\n=== Test 4: Non-existent Design ===');

  try {
    await viteServerManager.ensureServer('non-existent-id');
    console.error('✗ Should have thrown error for non-existent design');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      console.log('✓ Correctly threw error for non-existent design');
    } else {
      console.error('✗ Wrong error type:', error);
      throw error;
    }
  }
}

async function runTests() {
  console.log('Starting Vite Server Manager Tests...');

  try {
    await testBasicStartStop();
    await testMaxServersAndLRU();
    await testConcurrentRequests();
    await testNonExistentDesign();

    console.log('\n=== All Tests Passed ✓ ===\n');
    process.exit(0);
  } catch (error) {
    console.error('\n=== Tests Failed ✗ ===\n');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runTests();
