#!/usr/bin/env node

/**
 * Smoke test for Player Activities API endpoints
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

function httpPost(path, data) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    console.log(`   POST ${url}`);
    console.log(`   Body: ${JSON.stringify(data)}`);
    
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    
    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          const body = JSON.parse(responseData);
          resolve({ status: res.statusCode, body });
        } catch {
          resolve({ status: res.statusCode, body: responseData });
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting Player Activities API Smoke Tests\n');
  console.log(`Testing server at: ${BASE_URL}`);
  
  const testMembershipId = '4611686018465122437'; // Splashbear PSN
  const emptyMembershipId = '9999999999999999999';
  
  await test('Root endpoint lists new player activities endpoints', async () => {
    const { status, body } = await httpGet('/');
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!body.endpoints.player_activities) throw new Error('Missing player_activities endpoint');
    if (!body.endpoints.player_activities_batch) throw new Error('Missing player_activities_batch endpoint');
    console.log(`   Found endpoints: player_activities, player_activities_batch`);
  });

  await test('GET /players/:membershipId/activities returns 200', async () => {
    const { status, body } = await httpGet(`/players/${testMembershipId}/activities`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!body.membershipId) throw new Error('Missing membershipId in response');
    if (!body.coverage) throw new Error('Missing coverage in response');
    if (!Array.isArray(body.activities)) throw new Error('activities should be an array');
    console.log(`   Response: ${body.activities.length} activities, coverage: ${body.coverage.source}`);
    console.log(`   Row count: ${body.coverage.rowCount}, range: ${body.coverage.minPeriod} to ${body.coverage.maxPeriod}`);
  });

  await test('Empty membership ID returns 200 with empty activities', async () => {
    const { status, body } = await httpGet(`/players/${emptyMembershipId}/activities`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (body.coverage.rowCount !== 0) throw new Error('Expected rowCount to be 0');
    if (body.activities.length !== 0) throw new Error('Expected empty activities array');
    console.log(`   Empty membership correctly returns 0 activities`);
  });

  await test('Invalid membership ID returns 400', async () => {
    const { status, body } = await httpGet('/players/invalid-id/activities');
    if (status !== 400) throw new Error(`Expected 400, got ${status}`);
    if (!body.error) throw new Error('Missing error message');
    console.log(`   Error message: ${body.error}`);
  });

  await test('Query params work: game filter', async () => {
    const { status, body } = await httpGet(`/players/${testMembershipId}/activities?game=D2`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    console.log(`   Game filter accepted, got ${body.activities.length} D2 activities`);
  });

  await test('Query params work: limit', async () => {
    const { status, body } = await httpGet(`/players/${testMembershipId}/activities?limit=10`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    console.log(`   Limit filter accepted, got ${body.activities.length} activities (max 10)`);
  });

  await test('Query params work: date range', async () => {
    const { status, body } = await httpGet(`/players/${testMembershipId}/activities?from=2021-01-01&to=2021-12-31`);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    console.log(`   Date range filter accepted, got ${body.activities.length} activities`);
  });

  await test('POST /players/activities/batch requires membershipIds array', async () => {
    const { status, body } = await httpPost('/players/activities/batch', {});
    if (status !== 400) throw new Error(`Expected 400, got ${status}`);
    if (!body.error) throw new Error('Missing error message');
    console.log(`   Error message: ${body.error}`);
  });

  await test('POST /players/activities/batch returns map of results', async () => {
    const { status, body } = await httpPost('/players/activities/batch', {
      membershipIds: [testMembershipId, emptyMembershipId],
      limit: 100,
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!body[testMembershipId]) throw new Error('Missing result for test membership');
    if (!body[emptyMembershipId]) throw new Error('Missing result for empty membership');
    console.log(`   Batch returned ${Object.keys(body).length} results`);
    console.log(`   Test membership: ${body[testMembershipId].activities.length} activities`);
    console.log(`   Empty membership: ${body[emptyMembershipId].activities.length} activities`);
  });

  await test('POST /players/activities/batch accepts game filter', async () => {
    const { status, body } = await httpPost('/players/activities/batch', {
      membershipIds: [testMembershipId],
      game: 'D2',
      limit: 50,
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    console.log(`   Batch with game filter returned ${body[testMembershipId].activities.length} activities`);
  });

  await test('POST /players/activities/batch rejects more than 20 IDs', async () => {
    const tooManyIds = Array(21).fill('4611686018488107374');
    const { status, body } = await httpPost('/players/activities/batch', {
      membershipIds: tooManyIds,
    });
    if (status !== 400) throw new Error(`Expected 400, got ${status}`);
    if (!body.error || !body.error.includes('20')) throw new Error('Missing or incorrect error message');
    console.log(`   Error message: ${body.error}`);
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
    console.log('\n🎉 All player activities smoke tests passed!');
    process.exit(0);
  }
}

console.log('⏳ Waiting for server to start...');
setTimeout(() => {
  runTests().catch((err) => {
    console.error('\n💥 Test suite crashed:', err);
    process.exit(1);
  });
}, 2000);
