/**
 * Script to detect new raids and dungeons from the Destiny 2 manifest
 * 
 * This script can be run in the browser console after the app loads:
 * 
 * 1. Open the app in the browser
 * 2. Open the browser console
 * 3. Wait for the manifest to load
 * 4. Run: await window.detectNewRaidsDungeons()
 * 
 * Or use it programmatically in the app
 */

// This will be exposed on the window object for browser console access
if (typeof window !== 'undefined') {
  window.detectNewRaidsDungeons = async function() {
    // Get the Angular injector (this is a simplified version - actual implementation would use Angular's DI)
    console.log('To use this, inject DestinyManifestService in your component and call detectNewRaidsAndDungeons()');
    console.log('Example:');
    console.log(`
      // In a component:
      constructor(private manifest: DestinyManifestService) {}
      
      async checkForNewActivities() {
        if (!this.manifest.isLoadedSync) {
          await this.manifest.isLoaded().toPromise();
        }
        const results = this.manifest.detectNewRaidsAndDungeons();
        console.log('New Raids:', results.raids);
        console.log('New Dungeons:', results.dungeons);
        console.log('Suggested ACTIVITY_FAMILY_MAP entries:');
        results.suggestions.forEach(s => {
          console.log(\`  '\${s.hash}': "\${s.suggestedName}", // \${s.type}\`);
        });
        return results;
      }
    `);
  };
}

