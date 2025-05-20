// save as extract-missing-hashes.js
const fs = require('fs');

const logFile = 'missing-activity-logs.txt'; // update if your file is named differently

const logData = fs.readFileSync(logFile, 'utf8');
const hashRegex = /referenceId:\s*(\d+)/g;

const hashes = new Set();
let match;
while ((match = hashRegex.exec(logData)) !== null) {
  hashes.add(match[1]);
}

console.log('Unique missing D1 activity hashes:');
console.log([...hashes].join('\n'));