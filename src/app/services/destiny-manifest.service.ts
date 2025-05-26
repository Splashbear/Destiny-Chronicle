import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Destiny1ManifestService } from './destiny1-manifest.service';
import { ActivityDbService } from './activity-db.service';

@Injectable({
  providedIn: 'root'
})
export class DestinyManifestService {
  private activityDefs: { [key: string]: any } = {};
  private titleDefs: { [key: string]: any } = {};
  private presentationNodes: { [key: string]: any } = {};
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
      const enPath = manifestMeta.Response.jsonWorldComponentContentPaths.en;
      
      // Step 2: Get activity, title, and presentation node definitions
      const [activityDefs, titleDefsRaw, presentationNodesRaw] = await Promise.all([
        firstValueFrom(this.http.get('https://www.bungie.net' + enPath.DestinyActivityDefinition)),
        firstValueFrom(this.http.get('https://www.bungie.net' + enPath.DestinyRecordDefinition)),
        firstValueFrom(this.http.get('https://www.bungie.net' + enPath.DestinyPresentationNodeDefinition))
      ]);
      this.activityDefs = activityDefs;
      this.titleDefs = (titleDefsRaw as any).DestinyRecordDefinition || titleDefsRaw;
      this.presentationNodes = (presentationNodesRaw as any).DestinyPresentationNodeDefinition || presentationNodesRaw;
      (window as any).titleDefs = this.titleDefs; // Expose for browser debugging
      (window as any).presentationNodes = this.presentationNodes; // Expose for browser debugging
      this.manifestLoaded.next(true);
    } catch (error) {
      console.error('Error loading D2 manifest:', error);
      this.manifestLoaded.next(false);
    }
  }

  async getTitleDefinition(hash: string): Promise<any> {
    const definition = this.titleDefs[hash];
    if (!definition) {
      console.warn('[Titles] No definition found for title hash:', hash);
      return null;
    }
    return definition;
  }

  getActivityName(referenceId: string | number, isD1: boolean = false): string {
    if (!referenceId) return 'Unknown Activity';
    if (isD1) {
      return this.d1Manifest.getActivityName(referenceId);
    }
    const def = this.activityDefs[String(referenceId)];
    return def?.displayProperties?.name || 'Unknown Activity';
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

  getActivityType(referenceId: string | number, mode?: number): string {
    // D1 raid hashes (all known D1 raid activity referenceIds)
    const D1_RAID_HASHES = [
      // Vault of Glass
      3801607287, 708693006, 2659248071, 2659248068, 2659248069, 856898338, 4038697181,
      // Crota's End
      898834093, 112157962, 3879860662, 1836893116,
      // King's Fall
      1733556769, 421023204, 1661734046, 2964135793,
      // Wrath of the Machine
      2578867903, 4007500989, 1099433614, 1342567280, 260765522
    ];
    if (D1_RAID_HASHES.includes(Number(referenceId))) {
      return 'raid';
    }
    // First check the mode if provided (from activity data)
    if (mode !== undefined) {
      // D1 modes
      if (mode === 4) return 'raid';
      if (mode === 16) return 'strike';
      if (mode === 5) return 'crucible';
      if (mode === 2) return 'story';
      if (mode === 3 || mode === 6) return 'patrol';
      if (mode === 1) return 'public-event';
      if (mode === 7) return 'nightfall';
      // D2 modes
      if (mode === 82) return 'dungeon';
      if (mode === 46 || mode === 18 || mode === 48 || mode === 49) return 'strike';
      if (mode === 63 || mode === 75 || mode === 45 || mode === 47 || mode === 67) return 'gambit';
      if ([5, 10, 12, 15, 19, 24, 25, 28, 37, 38, 39, 40, 41, 42, 43, 44, 48, 49, 50, 51, 52, 53, 65, 66].includes(mode)) return 'crucible';
      if (mode === 79) return 'lost-sector';
      if (mode === 80 || mode === 81) return 'seasonal';
      if (mode === 90 || mode === 91) return 'exotic-mission';
      if (mode === 92 || mode === 93) return 'seasonal-event';
    }
    // Use the mapping to determine type
    const ACTIVITY_FAMILY_MAP = ActivityDbService['ACTIVITY_FAMILY_MAP'];
    const refIdStr = String(referenceId);
    const family = ACTIVITY_FAMILY_MAP[refIdStr];
    if (family) {
      if (family.toLowerCase().includes('raid')) return 'raid';
      if (family.toLowerCase().includes('dungeon')) return 'dungeon';
    }
    // Fall back to manifest data
    const def = this.activityDefs[referenceId];
    if (!def) return 'other';
    // Destiny 2: Use activityTypeHash or activityModeTypes
    const typeHash = def.activityTypeHash;
    const modeTypes: number[] = def.activityModeTypes || [];
    if (typeHash === 2043403989 || modeTypes.includes(4)) return 'raid';
    if (typeHash === 1375089621 || modeTypes.includes(82)) return 'dungeon';
    if (typeHash === 4110605575 || modeTypes.includes(46) || modeTypes.includes(18) || modeTypes.includes(48) || modeTypes.includes(49)) return 'strike';
    if (typeHash === 3789021730 || modeTypes.includes(46)) return 'nightfall';
    if (typeHash === 1164760493 || modeTypes.some(m => [5, 10, 12, 15, 19, 24, 25, 28, 37, 38, 39, 40, 41, 42, 43, 44, 48, 49, 50, 51, 52, 53, 65, 66].includes(m))) return 'crucible';
    if (typeHash === 484905723 || modeTypes.includes(63) || modeTypes.includes(75) || modeTypes.includes(45) || modeTypes.includes(47) || modeTypes.includes(67)) return 'gambit';
    if (typeHash === 2889152536 || modeTypes.includes(2)) return 'story';
    if (typeHash === 3497767639 || modeTypes.includes(3) || modeTypes.includes(6)) return 'patrol';
    if (typeHash === 1515615564 || modeTypes.includes(1)) return 'public-event';
    if (typeHash === 4253138191 || modeTypes.includes(79)) return 'lost-sector';
    if (typeHash === 1063765675 || modeTypes.includes(80) || modeTypes.includes(81)) return 'seasonal';
    if (typeHash === 1234567890 || modeTypes.includes(90) || modeTypes.includes(91)) return 'exotic-mission';
    if (typeHash === 987654321 || modeTypes.includes(92) || modeTypes.includes(93)) return 'seasonal-event';
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

  // Helper to get the seal icon from DestinyPresentationNodeDefinition
  getSealIconByRecordHash(recordHash: string | number): string | undefined {
    const hashStr = String(recordHash);
    for (const node of Object.values(this.presentationNodes)) {
      if (String(node.completionRecordHash) === hashStr) {
        // Try all possible icon fields
        const iconPath =
          node.icon ||
          node.displayProperties?.icon ||
          node.originalIcon ||
          node.rootViewIcon;
        if (iconPath) {
          return iconPath.startsWith('http') ? iconPath : 'https://www.bungie.net' + iconPath;
        }
      }
    }
    return undefined;
  }

  /**
   * Returns the total number of possible titles (all presentation nodes with a completionRecordHash)
   */
  getTotalPossibleTitles(): number {
    return Object.values(this.presentationNodes).filter(node => node.completionRecordHash).length;
  }

  /**
   * Returns the total number of Destiny 2 titles (presentation nodes with a completionRecordHash and parentNodeHashes including 1652422747)
   */
  getTotalD2Titles(): number {
    return Object.values(this.presentationNodes).filter(
      node => node.completionRecordHash && node.parentNodeHashes && node.parentNodeHashes.includes(1652422747)
    ).length;
  }

  public getAllD2TitlePresentationNodes(): any[] {
    // Find the 'Titles' root node
    const titlesRoot = Object.values(this.presentationNodes).find(
      (node: any) => node.displayProperties?.name === 'Titles'
    );
    if (!titlesRoot || !titlesRoot.children?.presentationNodes) return [];
    // Get all child hashes
    const childHashes = titlesRoot.children.presentationNodes.map((n: any) => n.presentationNodeHash);
    // Return the actual child nodes
    return childHashes
      .map((hash: number | string) => this.presentationNodes[hash])
      .filter(Boolean);
  }
} 