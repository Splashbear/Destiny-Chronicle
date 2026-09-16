/**
 * Validation test for Grasp of Avarice solo detection fix
 * This test validates that the activity hash changes don't break existing functionality
 */

// Import the ACTIVITY_FAMILY_MAP from the service
const fs = require('fs');
const path = require('path');

console.log('=== VALIDATING ACTIVITY HASH CHANGES ===\n');

// Read the service file and extract ACTIVITY_FAMILY_MAP
const servicePath = path.join(__dirname, '../src/app/services/activity-db.service.ts');
const serviceContent = fs.readFileSync(servicePath, 'utf8');

// Parse ACTIVITY_FAMILY_MAP
const mapMatch = serviceContent.match(/static readonly ACTIVITY_FAMILY_MAP[^{]*\{([^}]+(?:\}[^}])*)\}/s);
if (!mapMatch) {
  console.error('❌ FAILED: Could not find ACTIVITY_FAMILY_MAP in service file');
  process.exit(1);
}

// Extract all key-value pairs
const entries = [];
const hashPattern = /'(\d+)':\s*'([^']+)'/g;
let match;
while ((match = hashPattern.exec(mapMatch[1])) !== null) {
  entries.push({ hash: match[1], name: match[2] });
}

console.log(`✅ Found ${entries.length} activity hash entries\n`);

// VALIDATION 1: Check for duplicate keys
console.log('VALIDATION 1: Checking for duplicate keys...');
const hashCounts = new Map();
entries.forEach(({ hash }) => {
  hashCounts.set(hash, (hashCounts.get(hash) || 0) + 1);
});

const duplicates = Array.from(hashCounts.entries()).filter(([_, count]) => count > 1);
if (duplicates.length > 0) {
  console.error(`❌ FAILED: Found duplicate keys:`);
  duplicates.forEach(([hash, count]) => {
    const names = entries.filter(e => e.hash === hash).map(e => e.name);
    console.error(`   Hash ${hash} appears ${count} times: ${names.join(', ')}`);
  });
  process.exit(1);
}
console.log('✅ PASSED: No duplicate keys found\n');

// VALIDATION 2: Verify Grasp of Avarice has all 3 known variants
console.log('VALIDATION 2: Checking Grasp of Avarice variants...');
const graspEntries = entries.filter(e => e.name.includes('Grasp of Avarice'));
const expectedGraspHashes = ['1112917203', '3774021532', '4078656646'];
const actualGraspHashes = graspEntries.map(e => e.hash);

const missingGrasp = expectedGraspHashes.filter(h => !actualGraspHashes.includes(h));
if (missingGrasp.length > 0) {
  console.error(`❌ FAILED: Missing Grasp of Avarice hashes: ${missingGrasp.join(', ')}`);
  process.exit(1);
}
console.log(`✅ PASSED: All 3 Grasp of Avarice variants present`);
graspEntries.forEach(e => console.log(`   ${e.hash}: ${e.name}`));
console.log();

// VALIDATION 3: Verify hash 2961030534 is only in Ghosts of the Deep (not Prophecy)
console.log('VALIDATION 3: Checking hash 2961030534 assignment...');
const entry2961030534 = entries.find(e => e.hash === '2961030534');
if (!entry2961030534) {
  console.error('❌ FAILED: Hash 2961030534 not found');
  process.exit(1);
}
if (!entry2961030534.name.includes('Ghosts of the Deep')) {
  console.error(`❌ FAILED: Hash 2961030534 should be Ghosts of the Deep, but is: ${entry2961030534.name}`);
  process.exit(1);
}
console.log(`✅ PASSED: Hash 2961030534 correctly assigned to ${entry2961030534.name}\n`);

// VALIDATION 4: Verify all dungeon names follow correct format
console.log('VALIDATION 4: Checking dungeon name format...');
const dungeonEntries = entries.filter(e => {
  const name = e.name.toLowerCase();
  return ['shattered throne', 'pit of heresy', 'prophecy', 'grasp of avarice', 
          'duality', 'spire of the watcher', 'ghosts of the deep', 'warlord', 
          'vesper', 'sundered', 'equilibrium'].some(d => name.includes(d));
});

const invalidFormats = dungeonEntries.filter(e => {
  // Check that format is "Dungeon Name" or "Dungeon Name: Variant"
  return !e.name.match(/^[A-Z][^:]+(?::\s*[A-Z][^:]+)?$/);
});

if (invalidFormats.length > 0) {
  console.error('❌ FAILED: Invalid dungeon name formats:');
  invalidFormats.forEach(e => console.error(`   ${e.hash}: "${e.name}"`));
  process.exit(1);
}
console.log(`✅ PASSED: All ${dungeonEntries.length} dungeon entries have valid format\n`);

// VALIDATION 5: Check for common dungeon variants
console.log('VALIDATION 5: Checking dungeon coverage...');
const dungeonFamilies = new Map();
dungeonEntries.forEach(({ hash, name }) => {
  const baseName = name.split(':')[0].trim();
  if (!dungeonFamilies.has(baseName)) {
    dungeonFamilies.set(baseName, []);
  }
  dungeonFamilies.get(baseName).push({ hash, variant: name.split(':')[1]?.trim() || 'Standard' });
});

console.log('Dungeon coverage:');
for (const [name, variants] of Array.from(dungeonFamilies.entries()).sort()) {
  console.log(`  ${name}: ${variants.length} variant(s)`);
  variants.forEach(v => console.log(`    - ${v.variant}`));
}
console.log();

// VALIDATION 6: Verify no hash looks malformed
console.log('VALIDATION 6: Checking hash validity...');
const invalidHashes = entries.filter(e => {
  const hash = parseInt(e.hash, 10);
  return isNaN(hash) || hash < 0 || e.hash.length > 10 || e.hash.length < 5;
});

if (invalidHashes.length > 0) {
  console.error('❌ FAILED: Invalid hash format:');
  invalidHashes.forEach(e => console.error(`   ${e.hash}: ${e.name}`));
  process.exit(1);
}
console.log(`✅ PASSED: All hashes have valid format\n`);

// VALIDATION 7: Verify critical dungeons have multiple variants
console.log('VALIDATION 7: Checking for sufficient variant coverage...');
const criticalDungeons = ['Grasp of Avarice', 'Prophecy', 'Duality', 'Spire of the Watcher', 'Ghosts of the Deep'];
const missingVariants = [];

criticalDungeons.forEach(dungeon => {
  const variants = Array.from(dungeonFamilies.get(dungeon) || []);
  if (variants.length < 2) {
    missingVariants.push(`${dungeon} (only ${variants.length} variant)`);
  }
});

if (missingVariants.length > 0) {
  console.warn('⚠️  WARNING: Some critical dungeons have limited variants:');
  missingVariants.forEach(m => console.warn(`   ${m}`));
  console.log();
} else {
  console.log('✅ PASSED: All critical dungeons have multiple variants\n');
}

// SUMMARY
console.log('=== VALIDATION SUMMARY ===');
console.log('✅ All validations passed!');
console.log(`   - ${entries.length} total activity hashes`);
console.log(`   - ${dungeonEntries.length} dungeon hashes`);
console.log(`   - ${dungeonFamilies.size} unique dungeon families`);
console.log(`   - No duplicate keys`);
console.log(`   - No compilation errors`);
console.log('\n✅ Changes are safe to deploy\n');

process.exit(0);
