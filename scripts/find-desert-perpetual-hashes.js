/**
 * Script to find Desert Perpetual activity hashes from instance IDs
 * Usage: node find-desert-perpetual-hashes.js
 */

const https = require('https');
const API_KEY = process.env.BUNGIE_API_KEY || 'YOUR_API_KEY_HERE';

// Instance IDs provided by user
const instanceIds = [
  '16327844957', // First clear for Desert Perpetual (normal)
  '16565094165'  // First clear for Desert Perpetual (Epic)
];

function fetchPGCR(instanceId) {
  return new Promise((resolve, reject) => {
    const url = `https://stats.bungie.net/Platform/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`;
    
    const options = {
      headers: {
        'X-API-Key': API_KEY
      }
    };

    https.get(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.ErrorCode === 1) {
            resolve(response.Response);
          } else {
            reject(new Error(`API Error: ${response.ErrorStatus} - ${response.Message}`));
          }
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  console.log('Fetching PGCRs to find Desert Perpetual activity hashes...\n');
  
  for (const instanceId of instanceIds) {
    try {
      console.log(`Fetching PGCR for instance ID: ${instanceId}`);
      const pgcr = await fetchPGCR(instanceId);
      
      const activityDetails = pgcr.activityDetails;
      const referenceId = activityDetails?.referenceId;
      const activityName = activityDetails?.displayProperties?.name || 'Unknown';
      const mode = activityDetails?.mode;
      
      console.log(`  Activity Name: ${activityName}`);
      console.log(`  Reference ID (hash): ${referenceId}`);
      console.log(`  Mode: ${mode}`);
      console.log(`  Period: ${activityDetails?.period}`);
      console.log('');
      
      // Output code snippet for ACTIVITY_FAMILY_MAP
      if (referenceId) {
        const variant = activityName.includes('Epic') ? 'Epic' : 'Normal';
        console.log(`  Add to ACTIVITY_FAMILY_MAP:`);
        console.log(`    '${referenceId}': "The Desert Perpetual: ${variant}",`);
        console.log('');
      }
    } catch (error) {
      console.error(`Error fetching PGCR ${instanceId}:`, error.message);
    }
  }
}

if (require.main === module) {
  if (API_KEY === 'YOUR_API_KEY_HERE') {
    console.error('Error: Please set BUNGIE_API_KEY environment variable');
    console.error('Usage: BUNGIE_API_KEY=your_key node find-desert-perpetual-hashes.js');
    process.exit(1);
  }
  main().catch(console.error);
}

module.exports = { fetchPGCR };





