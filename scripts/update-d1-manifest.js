const fs = require('fs');
const path = require('path');

// Configuration
const MISSING_ACTIVITIES_FILE = 'src/assets/data/d1-missing-activities.json';
const MANIFEST_FILE = 'src/assets/manifest/d1-activity-definitions.json';

// Read the missing activities data
const missingActivities = JSON.parse(fs.readFileSync(MISSING_ACTIVITIES_FILE, 'utf8'));

// Read the existing manifest
let manifest;
try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
} catch (error) {
    console.log('No existing manifest found, creating new one...');
    manifest = {
        activities: {},
        activityTypes: {},
        activityModes: {}
    };
}

// Update the manifest with new activities
console.log('Updating manifest with new activities...');
let updatedCount = 0;

missingActivities.activities.forEach(activity => {
    const hash = activity.hash;
    
    // Update activities
    if (!manifest.activities[hash]) {
        manifest.activities[hash] = {
            name: activity.name,
            description: activity.description,
            icon: activity.icon,
            pgcrImage: activity.pgcrImage,
            activityTypeHash: activity.activityTypeHash,
            activityModeHash: activity.activityModeHash,
            activityModeTypes: activity.activityModeTypes
        };
        updatedCount++;
    }

    // Update activity types if we have them
    if (activity.activityTypeHash && !manifest.activityTypes[activity.activityTypeHash]) {
        manifest.activityTypes[activity.activityTypeHash] = {
            hash: activity.activityTypeHash,
            name: activity.name.split(' - ')[0] // Use first part of activity name as type name
        };
    }

    // Update activity modes if we have them
    if (activity.activityModeHash && !manifest.activityModes[activity.activityModeHash]) {
        manifest.activityModes[activity.activityModeHash] = {
            hash: activity.activityModeHash,
            name: activity.name.split(' - ')[1] || activity.name // Use second part of activity name as mode name
        };
    }
});

// Save the updated manifest
fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

console.log(`Updated ${updatedCount} activities in the manifest`);
console.log(`Manifest saved to ${MANIFEST_FILE}`); 