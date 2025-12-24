// Script to list all raid and dungeon hashes from the current codebase
// and help identify new ones that need to be added

const fs = require('fs');
const path = require('path');

// Read the activity-db.service.ts file to extract hashes
const servicePath = path.join(__dirname, '../src/app/services/activity-db.service.ts');
const serviceContent = fs.readFileSync(servicePath, 'utf8');

// Extract D2 Raids
const d2RaidMatches = serviceContent.matchAll(/'(\d+)':\s*'([^']+):\s*(?:Normal|Standard|Master|Prestige|Legend|Expert|Contest|Epic|Day One|World First|Hard|Easy|Heroic|Grandmaster|Adept|Hero|Mythic|Oryx Exalted|Rhulk Indomitable|Atraks Sovereign|Nezarec Sublime)'/g);

const raids = new Map();
const dungeons = new Map();

for (const match of d2RaidMatches) {
  const hash = match[1];
  const name = match[2];
  
  // Determine if it's a raid or dungeon based on name
  if (name.includes('Pantheon') || 
      name.includes('Leviathan') || 
      name.includes('Last Wish') ||
      name.includes('Scourge') ||
      name.includes('Crown of Sorrow') ||
      name.includes('Garden of Salvation') ||
      name.includes('Deep Stone Crypt') ||
      name.includes('Vault of Glass') ||
      name.includes('Vow of the Disciple') ||
      name.includes("King's Fall") ||
      name.includes('Root of Nightmares') ||
      name.includes("Crota's End") ||
      name.includes("Salvation's Edge") ||
      name.includes('Desert Perpetual')) {
    if (!raids.has(name)) {
      raids.set(name, []);
    }
    raids.get(name).push({ hash, variant: match[0].match(/: ([^']+)/)?.[1] || 'Unknown' });
  } else if (name.includes('Shattered Throne') ||
             name.includes('Pit of Heresy') ||
             name.includes('Prophecy') ||
             name.includes('Grasp of Avarice') ||
             name.includes('Duality') ||
             name.includes('Spire of the Watcher') ||
             name.includes('Ghosts of the Deep') ||
             name.includes("Warlord's Ruin") ||
             name.includes("Vesper's Host") ||
             name.includes('Sundered Doctrine') ||
             name.includes('Equilibrium')) {
    if (!dungeons.has(name)) {
      dungeons.set(name, []);
    }
    dungeons.get(name).push({ hash, variant: match[0].match(/: ([^']+)/)?.[1] || 'Unknown' });
  }
}

console.log('=== DESTINY 2 RAIDS ===\n');
for (const [name, variants] of Array.from(raids.entries()).sort()) {
  console.log(`${name}:`);
  for (const v of variants) {
    console.log(`  ${v.hash} - ${v.variant}`);
  }
  console.log('');
}

console.log('\n=== DESTINY 2 DUNGEONS ===\n');
for (const [name, variants] of Array.from(dungeons.entries()).sort()) {
  console.log(`${name}:`);
  for (const v of variants) {
    console.log(`  ${v.hash} - ${v.variant}`);
  }
  console.log('');
}

console.log('\n=== DESTINY 1 RAIDS ===\n');
const d1RaidMatches = serviceContent.matchAll(/'(\d+)':\s*'([^']+)'/g);
const d1Raids = new Map();
let inD1Section = false;

const lines = serviceContent.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('Destiny 1 Raids')) {
    inD1Section = true;
  } else if (inD1Section && line.includes('Destiny 2 Dungeons')) {
    break;
  } else if (inD1Section) {
    const match = line.match(/'(\d+)':\s*'([^']+)'/);
    if (match) {
      const hash = match[1];
      const name = match[2];
      if (!d1Raids.has(name)) {
        d1Raids.set(name, []);
      }
      d1Raids.get(name).push(hash);
    }
  }
}

for (const [name, hashes] of Array.from(d1Raids.entries()).sort()) {
  console.log(`${name}:`);
  for (const hash of hashes) {
    console.log(`  ${hash}`);
  }
  console.log('');
}

console.log('\n=== SUMMARY ===');
console.log(`Total D2 Raids: ${raids.size}`);
console.log(`Total D2 Dungeons: ${dungeons.size}`);
console.log(`Total D1 Raids: ${d1Raids.size}`);

// Check for new activities
console.log('\n=== CHECKING FOR NEW ACTIVITIES ===');
if (!Array.from(raids.keys()).some(name => name.includes('Desert Perpetual'))) {
  console.log('⚠️  Desert Perpetual Raid NOT FOUND in codebase - needs to be added');
}
if (!Array.from(dungeons.keys()).some(name => name.includes('Equilibrium'))) {
  console.log('⚠️  Equilibrium Dungeon NOT FOUND in codebase - needs to be added');
}

