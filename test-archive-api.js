/**
 * Simple mock archive API server for testing the archive activities integration.
 * Run with: node test-archive-api.js
 */
const http = require('http');

const PORT = 3001;

// Mock data for Splashbear PSN account
const MOCK_MEMBERSHIP_ID = '4611686018465122437';
const MOCK_CHARACTER_ID = '2305843009265042360';

const mockActivities = [];
const baseTime = new Date('2024-01-01T12:00:00Z').getTime();

// Generate some mock activities
for (let i = 0; i < 50; i++) {
  mockActivities.push({
    instanceId: `${10000000 + i}`,
    period: new Date(baseTime + i * 3600000).toISOString(),
    activityHash: '2122313384', // Last Wish
    mode: 4, // Raid
    membershipId: MOCK_MEMBERSHIP_ID,
    membershipType: 2, // PSN
    characterId: MOCK_CHARACTER_ID,
    completed: 1,
    deaths: 5,
    kills: 125,
    assists: 23,
    durationSeconds: 3600,
    game: 'D2',
    displayName: 'Splashbear'
  });
}

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname}`);

  // GET /players/:membershipId/activities
  if (req.method === 'GET' && url.pathname.match(/^\/players\/([^\/]+)\/activities$/)) {
    const membershipId = url.pathname.split('/')[2];
    
    if (membershipId === MOCK_MEMBERSHIP_ID) {
      const response = {
        membershipId,
        coverage: {
          source: 'mock-archive',
          rowCount: mockActivities.length,
          minPeriod: mockActivities[0].period,
          maxPeriod: mockActivities[mockActivities.length - 1].period,
          watermarkNote: 'Mock test data'
        },
        activities: mockActivities
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      console.log(`  → Returned ${mockActivities.length} mock activities for ${membershipId}`);
    } else {
      // No data for this membership
      const response = {
        membershipId,
        coverage: {
          source: 'mock-archive',
          rowCount: 0
        },
        activities: []
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      console.log(`  → No activities found for ${membershipId}`);
    }
    return;
  }

  // POST /players/activities/batch
  if (req.method === 'POST' && url.pathname === '/players/activities/batch') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { membershipIds } = JSON.parse(body);
        const response = {};
        
        membershipIds.forEach(membershipId => {
          if (membershipId === MOCK_MEMBERSHIP_ID) {
            response[membershipId] = {
              membershipId,
              coverage: {
                source: 'mock-archive',
                rowCount: mockActivities.length,
                minPeriod: mockActivities[0].period,
                maxPeriod: mockActivities[mockActivities.length - 1].period,
                watermarkNote: 'Mock test data'
              },
              activities: mockActivities
            };
          } else {
            response[membershipId] = {
              membershipId,
              coverage: {
                source: 'mock-archive',
                rowCount: 0
              },
              activities: []
            };
          }
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
        console.log(`  → Batch response for ${membershipIds.length} memberships`);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    });
    return;
  }

  // GET /pgcr/:instanceId (for compatibility)
  if (req.method === 'GET' && url.pathname.match(/^\/pgcr\/([^\/]+)$/)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'PGCR not found in mock archive' }));
    return;
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, () => {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Mock Archive API Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Listening on: http://localhost:${PORT}`);
  console.log(`  Mock account: Splashbear PSN (${MOCK_MEMBERSHIP_ID})`);
  console.log(`  Mock activities: ${mockActivities.length} D2 raid activities`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  console.log(`Available endpoints:`);
  console.log(`  GET  /players/:membershipId/activities`);
  console.log(`  POST /players/activities/batch`);
  console.log(`  GET  /pgcr/:instanceId`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
