const fetch = require('node-fetch');
const fs = require('fs');

// Configuration
const API_KEY = process.env.BUNGIE_API_KEY;
const OUTPUT_FILE = 'src/assets/data/d1-missing-activities.json';

// Read the log file
const logFile = 'scripts/logs/missing-activity-logs.txt';
const logData = fs.readFileSync(logFile, 'utf8');
const hashRegex = /referenceId:\s*(\d+)/g;

// Extract unique hashes
const hashes = new Set();
let match;
while ((match = hashRegex.exec(logData)) !== null) {
  hashes.add(match[1]);
}

console.log(`Found ${hashes.size} unique missing activity hashes`);

// Function to fetch activity details
async function fetchActivityDetails(hash) {
  const url = `https://www.bungie.net/Platform/Destiny/Manifest/Activity/${hash}/`;
  try {
    const response = await fetch(url, {
      headers: {
        'X-API-Key': API_KEY
      }
    });
    const data = await response.json();
    if (data.Response) {
      return {
        hash: hash,
        name: data.Response.displayProperties?.name || 'Unknown Activity',
        description: data.Response.displayProperties?.description || '',
        icon: data.Response.displayProperties?.icon || '',
        pgcrImage: data.Response.pgcrImage || '',
        activityTypeHash: data.Response.activityTypeHash,
        activityModeHash: data.Response.activityModeHash,
        activityModeTypes: data.Response.activityModeTypes || []
      };
    }
    return null;
  } catch (error) {
    console.error(`Error fetching hash ${hash}:`, error.message);
    return null;
  }
}

// Main function to process all hashes
async function processHashes() {
  const results = [];
  const hashesArray = Array.from(hashes);
  
  console.log('Fetching activity details...');
  
  for (const hash of hashesArray) {
    console.log(`Processing hash: ${hash}`);
    const details = await fetchActivityDetails(hash);
    if (details) {
      results.push(details);
    }
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Save results to file
  const output = {
    lastUpdated: new Date().toISOString(),
    activities: results
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nProcessed ${results.length} activities`);
  console.log(`Results saved to ${OUTPUT_FILE}`);
}

// Run the script
if (!API_KEY) {
  console.error('Please set your BUNGIE_API_KEY environment variable');
  process.exit(1);
}

processHashes().catch(console.error); 