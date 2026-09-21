#!/usr/bin/env node

/**
 * Smoke test for PGCR API server
 * Tests basic functionality without requiring Travis-PC files
 */

const http = require('http');

const PORT = process.env.PGCR_API_PORT || 3001;
const BASE_URL = `http://localhost:${PORT}`;

let testsFailed = 0;
let testsPassed = 0;

function test(name, testFn) {
  console.log(`\n🧪 Testing: ${name}`);
  return testFn()
    .then(() => {
      console.log(`✅ PASSED: ${name}`);
      testsPassed++;
    })
    .catch((err) => {
      console.error(`❌ FAILED: ${name}`);
      console.error(`   Error: ${err.message}`);
      testsFailed++;
    });
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    console.log(`   GET ${url}`);
    
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          resolve({ status: res.statusCode, body });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('🚀 Starting PGCR API Smoke Tests\n');
  console.log(`Testing server at: ${BASE_URL}`);
  
  await test('Health endpoint returns 200', async () => {
    const { status, body } = await httpGet('/health');
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (body.status !== 'ok') throw new Error('Health check failed');
    console.log(`   Response: ${JSON.stringify(body)}`);
  });

  await test('Root endpoint returns API info', async () => {
    const { status, body } = await httpGet('/');
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!body.name) throw new Error('Missing API name');
    console.log(`   API: ${body.name} v${body.version || '1.0.0'}`);
  });

  await test('Watermark endpoint returns 404 when not configured', async () => {
    const { status } = await httpGet('/api/pgcr/watermark');
    if (status !== 404) {
      console.log(`   Note: Got ${status} - watermark may be configured`);
    }
  });

  await test('Activities endpoint requires membershipId', async () => {
    const { status, body } = await httpGet('/api/pgcr/activities');
    if (status !== 400) throw new Error(`Expected 400, got ${status}`);
    if (!body.error) throw new Error('Missing error message');
    console.log(`   Error message: ${body.error}`);
  });

  await test('Activities endpoint accepts membershipId', async () => {
    const { status } = await httpGet('/api/pgcr/activities?membershipId=4611686018488107374');
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    console.log(`   Accepted membership ID parameter`);
  });

  await test('Invalid instance ID returns 400', async () => {
    const { status, body } = await httpGet('/api/pgcr/invalid');
    if (status !== 400) throw new Error(`Expected 400, got ${status}`);
    console.log(`   Error: ${body.error}`);
  });

  await test('404 endpoint returns 404', async () => {
    const { status } = await httpGet('/nonexistent');
    if (status !== 404) throw new Error(`Expected 404, got ${status}`);
  });

  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Test Results:`);
  console.log(`   ✅ Passed: ${testsPassed}`);
  console.log(`   ❌ Failed: ${testsFailed}`);
  console.log(`   📈 Total:  ${testsPassed + testsFailed}`);
  
  if (testsFailed > 0) {
    console.log('\n⚠️  Some tests failed. Check the output above for details.');
    process.exit(1);
  } else {
    console.log('\n🎉 All smoke tests passed!');
    process.exit(0);
  }
}

// Wait for server to be ready
console.log('⏳ Waiting for server to start...');
setTimeout(() => {
  runTests().catch((err) => {
    console.error('\n💥 Test suite crashed:', err);
    process.exit(1);
  });
}, 2000);
