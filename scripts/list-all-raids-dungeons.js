// Script to list all raid and dungeon hashes from the current codebase
// and help identify new ones that need to be added

const fs = require('fs');
const path = require('path');

const D2_RAID_NAMES = [
  'Pantheon',
  'Leviathan',
  'Last Wish',
  'Scourge',
  'Crown of Sorrow',
  'Garden of Salvation',
  'Deep Stone Crypt',
  'Vault of Glass',
  'Vow of the Disciple',
  "King's Fall",
  'Root of Nightmares',
  "Crota's End",
  "Salvation's Edge",
  'Desert Perpetual',
];

const D2_DUNGEON_NAMES = [
  'Shattered Throne',
  'Pit of Heresy',
  'Prophecy',
  'Grasp of Avarice',
  'Duality',
  'Spire of the Watcher',
  'Ghosts of the Deep',
  "Warlord's Ruin",
  "Vesper's Host",
  'Sundered Doctrine',
  'Equilibrium',
];

function isRaidName(name) {
  return D2_RAID_NAMES.some(raidName => name.includes(raidName));
}

function isDungeonName(name) {
  return D2_DUNGEON_NAMES.some(dungeonName => name.includes(dungeonName));
}

function printActivityMap(title, map, formatter) {
  console.log(title);
  for (const [name, values] of Array.from(map.entries()).sort()) {
    console.log(`${name}:`);
    for (const value of values) {
      console.log(`  ${formatter(value)}`);
    }
    console.log('');
  }
}

function main() {
  const servicePath = path.join(__dirname, '../src/app/services/activity-db.service.ts');

  if (!fs.existsSync(servicePath)) {
    console.error(`activity-db.service.ts not found at ${servicePath}`);
    process.exit(1);
  }

  const serviceContent = fs.readFileSync(servicePath, 'utf8');

  const raids = new Map();
  const dungeons = new Map();

  const d2RaidMatches = serviceContent.matchAll(
    /'(\d+)':\s*'([^']+):\s*(?:Normal|Standard|Master|Prestige|Legend|Expert|Contest|Epic|Day One|World First|Hard|Easy|Heroic|Grandmaster|Adept|Hero|Mythic|Oryx Exalted|Rhulk Indomitable|Atraks Sovereign|Nezarec Sublime)'/g,
  );

  for (const match of d2RaidMatches) {
    const hash = match[1];
    const name = match[2];
    const variantMatch = match[0].match(/: ([^']+)/);
    const variant = variantMatch?.[1] || 'Unknown';

    if (isRaidName(name)) {
      if (!raids.has(name)) {
        raids.set(name, []);
      }
      raids.get(name).push({ hash, variant });
    } else if (isDungeonName(name)) {
      if (!dungeons.has(name)) {
        dungeons.set(name, []);
      }
      dungeons.get(name).push({ hash, variant });
    }
  }

  console.log('=== DESTINY 2 RAIDS ===\n');
  printActivityMap('', raids, v => `${v.hash} - ${v.variant}`);

  console.log('\n=== DESTINY 2 DUNGEONS ===\n');
  printActivityMap('', dungeons, v => `${v.hash} - ${v.variant}`);

  console.log('\n=== DESTINY 1 RAIDS ===\n');
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

  printActivityMap('', d1Raids, hash => `${hash}`);

  console.log('\n=== SUMMARY ===');
  console.log(`Total D2 Raids: ${raids.size}`);
  console.log(`Total D2 Dungeons: ${dungeons.size}`);
  console.log(`Total D1 Raids: ${d1Raids.size}`);

  console.log('\n=== CHECKING FOR NEW ACTIVITIES ===');
  if (!Array.from(raids.keys()).some(name => name.includes('Desert Perpetual'))) {
    console.log('⚠️  Desert Perpetual Raid NOT FOUND in codebase - needs to be added');
  }
  if (!Array.from(dungeons.keys()).some(name => name.includes('Equilibrium'))) {
    console.log('⚠️  Equilibrium Dungeon NOT FOUND in codebase - needs to be added');
  }
}

main();
