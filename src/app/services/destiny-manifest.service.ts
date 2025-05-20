import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Destiny1ManifestService } from './destiny1-manifest.service';

@Injectable({
  providedIn: 'root'
})
export class DestinyManifestService {
  private activityDefs: { [key: string]: any } = {};
  private manifestLoaded = new BehaviorSubject<boolean>(false);

  constructor(
    private http: HttpClient,
    private d1Manifest: Destiny1ManifestService
  ) {
    this.loadManifest();
  }

  async loadManifest() {
    try {
      // Step 1: Get manifest metadata
      const manifestMeta: any = await firstValueFrom(this.http.get('https://www.bungie.net/Platform/Destiny2/Manifest/'));
      const enPath = manifestMeta.Response.jsonWorldComponentContentPaths.en.DestinyActivityDefinition;
      // Step 2: Get activity definitions
      this.activityDefs = await firstValueFrom(this.http.get('https://www.bungie.net' + enPath));
      this.manifestLoaded.next(true);
    } catch (error) {
      console.error('Error loading D2 manifest:', error);
      this.manifestLoaded.next(false);
    }
  }

  getActivityName(referenceId: number | string, isD1: boolean): string | undefined {
    if (isD1) {
      const result = this.d1Manifest.getActivityName(referenceId);
      return result;
    } else {
      const refIdStr = String(referenceId);
      const activityDef = this.activityDefs[refIdStr];
      const result = activityDef?.displayProperties?.name;
      return result;
    }
  }

  getActivityIcon(referenceId: string | number, isD1: boolean = false): string {
    if (isD1) {
      return this.d1Manifest.getActivityIcon(referenceId);
    }
    if (!this.activityDefs) return '';
    const def = this.activityDefs[referenceId];
    return def && def.displayProperties?.icon ? 'https://www.bungie.net' + def.displayProperties.icon : '';
  }

  getActivityPgcrImage(referenceId: number | string, isD1: boolean): string | undefined {
    if (isD1) {
      // First, check the D1 manifest for a pgcrImage
      const d1Pgcr = this.d1Manifest.getActivityPgcrImage(referenceId);
      if (d1Pgcr && !d1Pgcr.includes('/icons/')) {
        // Only use if it's not a fallback icon
        return d1Pgcr;
      }
      // Then try raid image
      const raidImg = this.d1Manifest.getActivityRaidImage(referenceId);
      if (raidImg) {
        return raidImg;
      }
      // Fallback to icon
      const icon = this.d1Manifest.getActivityIcon(referenceId);
      if (icon) {
        return icon;
      }
      return undefined;
    } else {
      const refIdStr = String(referenceId);
      const activityDef = this.activityDefs[refIdStr];
      const result = activityDef?.pgcrImage;
      return result;
    }
  }

  getActivityType(referenceId: string | number, mode?: number): 'raid' | 'dungeon' | 'strike' | 'nightfall' | 'crucible' | 'gambit' | 'other' {
    // First check the mode if provided (from activity data)
    if (mode !== undefined) {
      // D1 modes
      if (mode === 4) return 'raid';  // D1 raid mode
      if (mode === 16) return 'strike';  // D1 strike mode
      if (mode === 5) return 'crucible';  // D1 crucible mode

      // D2 modes
      if (mode === 82) return 'dungeon';
      if (mode === 46 || mode === 18) return 'strike';
      if (mode === 63 || mode === 75) return 'gambit';
      if ([5, 10, 12, 15, 19, 24, 25, 28, 37, 38, 39, 40, 41, 42, 43, 44, 48, 49, 50, 51, 52, 53].includes(mode)) return 'crucible';
    }

    // Fall back to manifest data
    const def = this.activityDefs[referenceId];
    if (!def) return 'other';
    
    // D1 activity type hashes
    const D1_RAID_HASHES = [
      2043403989,  // Vault of Glass
      3879860661,  // Crota's End
      1733556769,  // King's Fall
      2578867903   // Wrath of the Machine
    ];

    // Check if it's a D1 raid by referenceId
    if (D1_RAID_HASHES.includes(Number(referenceId))) {
      return 'raid';
    }

    // Destiny 2: Use activityTypeHash or activityModeTypes
    const typeHash = def.activityTypeHash;
    const modeTypes: number[] = def.activityModeTypes || [];
    if (typeHash === 2043403989 || modeTypes.includes(4)) return 'raid';
    if (typeHash === 1375089621 || modeTypes.includes(82)) return 'dungeon';
    if (typeHash === 4110605575 || modeTypes.includes(46) || modeTypes.includes(18)) return 'strike';
    if (typeHash === 3789021730 || modeTypes.includes(46)) return 'nightfall';
    if (typeHash === 1164760493 || modeTypes.some(m => [5, 10, 12, 15, 19, 24, 25, 28, 37, 38, 39, 40, 41, 42, 43, 44, 48, 49, 50, 51, 52, 53].includes(m))) return 'crucible';
    if (typeHash === 484905723 || modeTypes.includes(63) || modeTypes.includes(75)) return 'gambit';
    return 'other';
  }

  isLoaded(): Observable<boolean> {
    return this.manifestLoaded.asObservable();
  }

  /**
   * Debug: Log detailed activity definition information
   */
  debugActivityDefinition(referenceId: string | number) {
    const def = this.activityDefs[referenceId];
    if (!def) {
      // console.warn(`Missing activity definition for referenceId: ${referenceId}`);
      return;
    }
  }

  // Utility to check for missing hashes in the manifest
  checkMissingHashes(referenceIds: (number | string)[], isD1: boolean): (number | string)[] {
    if (isD1) {
      return referenceIds.filter(refId => {
        const name = this.d1Manifest.getActivityName(refId);
        return !name || name === 'Unknown Activity';
      });
    } else {
      return referenceIds.filter(refId => !this.activityDefs[String(refId)]);
    }
  }
} 