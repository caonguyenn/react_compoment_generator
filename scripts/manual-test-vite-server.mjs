/**
 * Quick manual test for Vite Server Manager
 * Usage: node scripts/manual-test-vite-server.mjs
 */

console.log('Testing Vite Server Manager...\n');

// Test 1: Start server via API
console.log('Test 1: Starting Vite server via API...');
const designId = 'WwmSrmL_rUv6'; // Existing design
const port = process.env.PORT || '3001';
const baseUrl = `http://localhost:${port}`;

try {
  const startResponse = await fetch(`${baseUrl}/api/vite-servers/${designId}`, {
    method: 'POST',
  });

  if (!startResponse.ok) {
    console.error('❌ Failed to start server:', await startResponse.text());
    process.exit(1);
  }

  const startData = await startResponse.json();
  console.log('✓ Server started:', startData);

  // Wait a bit for Vite to fully start
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 2: Get server status
  console.log('\nTest 2: Getting server status...');
  const statusResponse = await fetch(`${baseUrl}/api/vite-servers/${designId}`);

  if (!statusResponse.ok) {
    console.error('❌ Failed to get status:', await statusResponse.text());
    process.exit(1);
  }

  const statusData = await statusResponse.json();
  console.log('✓ Server status:', statusData);

  // Test 3: Verify server is accessible
  console.log('\nTest 3: Checking if Vite server is responding...');
  const vitePort = statusData.server.port;
  const viteResponse = await fetch(`http://localhost:${vitePort}/`, {
    headers: { 'Accept': 'text/html' }
  });

  if (!viteResponse.ok) {
    console.error('❌ Vite server not responding:', viteResponse.status);
    process.exit(1);
  }

  const html = await viteResponse.text();
  const hasVite = html.includes('vite') || html.includes('script');
  console.log(`✓ Vite server responding (${viteResponse.status}), HTML contains script tags: ${hasVite}`);

  // Test 4: Stop server
  console.log('\nTest 4: Stopping server...');
  const stopResponse = await fetch(`${baseUrl}/api/vite-servers/${designId}`, {
    method: 'DELETE',
  });

  if (!stopResponse.ok) {
    console.error('❌ Failed to stop server:', await stopResponse.text());
    process.exit(1);
  }

  const stopData = await stopResponse.json();
  console.log('✓ Server stopped:', stopData);

  // Wait for cleanup (Vite takes up to 3s to shutdown)
  await new Promise(resolve => setTimeout(resolve, 4000));

  // Test 5: Verify server is gone
  console.log('\nTest 5: Verifying server is stopped...');
  const verifyResponse = await fetch(`${baseUrl}/api/vite-servers/${designId}`);

  if (verifyResponse.status === 404) {
    console.log('✓ Server confirmed stopped (404)');
  } else {
    console.error('❌ Server still running:', await verifyResponse.json());
    process.exit(1);
  }

  console.log('\n✅ All tests passed!\n');
  process.exit(0);

} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
}
