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
  


  private buildUrl(url: string): string {
    // For now, use direct API calls to avoid rate limiting issues
    // We'll need to implement a proper solution for production deployment
    return url;
  }

  constructor(
    private http: HttpClient,
    private d1Manifest: Destiny1ManifestService
  ) {
    this.loadManifest();
  }

  async loadManifest() {
    try {
      // Step 1: Get manifest metadata
      const manifestMeta: any = await firstValueFrom(this.http.get(this.buildUrl('https://www.bungie.net/Platform/Destiny2/Manifest/')));
      const enPath = manifestMeta.Response.jsonWorldComponentContentPaths.en;
      if (!enPath) {
        throw new Error('Manifest metadata missing en path');
      }
      // Step 2: Get activity, title, and presentation node definitions
      const [activityDefsRaw, titleDefsRaw, presentationNodesRaw] = await Promise.all([
        firstValueFrom(this.http.get(this.buildUrl('https://www.bungie.net' + enPath.DestinyActivityDefinition))),
        firstValueFrom(this.http.get(this.buildUrl('https://www.bungie.net' + enPath.DestinyRecordDefinition))),
        firstValueFrom(this.http.get(this.buildUrl('https://www.bungie.net' + enPath.DestinyPresentationNodeDefinition)))
      ]);
      // Defensive: handle both possible structures
      this.activityDefs = (activityDefsRaw as any).DestinyActivityDefinition || activityDefsRaw;
      this.titleDefs = (titleDefsRaw as any).DestinyRecordDefinition || titleDefsRaw;
      this.presentationNodes = (presentationNodesRaw as any).DestinyPresentationNodeDefinition || presentationNodesRaw;
      if (!this.activityDefs || Object.keys(this.activityDefs).length === 0) {
        throw new Error('Activity definitions failed to load');
      }
      if (!this.titleDefs || Object.keys(this.titleDefs).length === 0) {
        throw new Error('Title definitions failed to load');
      }
      if (!this.presentationNodes || Object.keys(this.presentationNodes).length === 0) {
        throw new Error('Presentation nodes failed to load');
      }
      (window as any).titleDefs = this.titleDefs; // Expose for browser debugging
      (window as any).presentationNodes = this.presentationNodes; // Expose for browser debugging
      this.manifestLoaded.next(true);
      console.log('[Manifest] Successfully loaded Destiny 2 manifest.');
    } catch (error) {
      console.error('[Manifest] Error loading D2 manifest:', error);
      this.manifestLoaded.next(false);
    }
  }

  async refreshManifest() {
    console.log('[Manifest] Refreshing manifest...');
    this.manifestLoaded.next(false);
    await this.loadManifest();
  }

  async getTitleDefinition(hash: string): Promise<any> {
    if (!this.manifestLoaded.value) {
      await this.isLoaded().toPromise();
    }
    const definition = this.titleDefs[hash];
    if (!definition) {
      return null;
    }
    return definition;
  }

  getActivityName(referenceId: string | number, isD1: boolean = false): string {
    if (!this.manifestLoaded.value) {
      return 'Loading...';
    }
    if (!referenceId) return 'Unknown Activity';
    if (isD1) {
      return this.d1Manifest.getActivityName(referenceId);
    }
    const def = this.activityDefs[String(referenceId)];
    return def?.displayProperties?.name || 'Unknown Activity';
  }

  getActivityIcon(referenceId: string | number, isD1: boolean = false): string {
    if (!this.manifestLoaded.value) {
      return '';
    }
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
    // Special case: Shattered Throne has wrong mode but is definitely a dungeon
    const refIdStr = String(referenceId);
    if (refIdStr === '2032534090' || refIdStr === '1347078175') {
      return 'dungeon';
    }

    // D1 raid hashes (all known D1 raid activity referenceIds)
    const D1_RAID_HASHES = [
      // Vault of Glass (all variants)
      3801607287, 708693006, 2659248071, 2659248068, 2659248069, 856898338, 4038697181,
      // Crota's End (all variants)
      898834093, 112157962, 3879860662, 1836893116, 1836893119, 2324706853, 4000873610,
      // King's Fall (all variants)
      1733556769, 3534581229, 1016659723, 3978884648,
      // Wrath of the Machine (all variants)
      2578867903, 4007500989, 1099433614, 1342567280, 260765522, 1387993552, 430160982, 3356249023
    ];
    // D1 story and strike hashes (add more as needed)
    const D1_STORY_HASHES = [1584820970, 2393304318, 2393304319, 2393304320]; // Example hashes
    const D1_STRIKE_HASHES = [3604094944, 3604094945, 3604094946]; // Example hashes
    // Add detailed logging for D1 activities (after declarations)
    // if (typeof referenceId !== 'undefined') {
    //   console.log(`[DestinyManifestService] getActivityType called for D1 activity:`, {
    //     referenceId,
    //     mode,
    //     isRaidHash: D1_RAID_HASHES.includes(Number(referenceId)),
    //     isStoryHash: D1_STORY_HASHES.includes(Number(referenceId)),
    //     isStrikeHash: D1_STRIKE_HASHES.includes(Number(referenceId))
    //   });
    // }
    if (D1_RAID_HASHES.includes(Number(referenceId))) {
      return 'raid';
    }
    if (D1_STORY_HASHES.includes(Number(referenceId))) {
      return 'story';
    }
    if (D1_STRIKE_HASHES.includes(Number(referenceId))) {
      return 'strike';
    }
    // First check the mode if provided (from activity data)
    if (mode !== undefined) {
      // Crucible modes (D1 & D2)
      const CRUCIBLE_MODES = [5, 10, 12, 15, 19, 24, 25, 28, 37, 38, 39, 40, 41, 42, 43, 44, 48, 49, 50, 51, 52, 53, 65, 66];
      if (CRUCIBLE_MODES.includes(mode)) return 'crucible';
      // D1 modes
      if (mode === 4) return 'raid';
      if (mode === 16) return 'strike';
      if (mode === 2) return 'story';
      if (mode === 3 || mode === 6) return 'patrol';
      if (mode === 1) return 'public-event';
      if (mode === 7) return 'nightfall';
      // D2 modes
      if (mode === 82) return 'dungeon';
      if (mode === 46 || mode === 18 || mode === 48 || mode === 49) return 'strike';
      if (mode === 63 || mode === 75 || mode === 45 || mode === 47 || mode === 67) return 'gambit';
      if (mode === 79) return 'lost-sector';
      if (mode === 80 || mode === 81) return 'seasonal';
      if (mode === 90 || mode === 91) return 'exotic-mission';
      if (mode === 92 || mode === 93) return 'seasonal-event';
    }
    // Use the mapping to determine type
    const ACTIVITY_FAMILY_MAP = ActivityDbService['ACTIVITY_FAMILY_MAP'];
    const family = ACTIVITY_FAMILY_MAP[refIdStr];
    if (family) {
      // Try to infer from the mapped family name
      const familyLower = family.toLowerCase();
      if (familyLower.includes('raid')) return 'raid';
      if (familyLower.includes('dungeon')) return 'dungeon';

      // If the family string doesn't contain type words, match against known base names
      const baseName = family.includes(':') ? family.split(':')[0] : family;
      const D2_DUNGEONS = new Set([
        'The Shattered Throne', 'Pit of Heresy', 'Prophecy', 'Grasp of Avarice',
        'Duality', 'Spire of the Watcher', 'Ghosts of the Deep', "Warlord's Ruin",
        "Vesper's Host", 'Sundered Doctrine'
      ]);
      const D2_RAIDS = new Set([
        'Leviathan', 'Leviathan, Eater of Worlds', 'Leviathan, Spire of Stars', 'Crown of Sorrow',
        'Garden of Salvation', 'Deep Stone Crypt', 'Vault of Glass', 'Vow of the Disciple',
        "King's Fall", 'Root of Nightmares', "Crota's End", "Salvation's Edge",
        'The Pantheon'
      ]);
      if (D2_DUNGEONS.has(baseName)) return 'dungeon';
      if (D2_RAIDS.has(baseName) || baseName.startsWith('The Pantheon')) return 'raid';
    }
    // Fall back to manifest data
    const def = this.activityDefs[referenceId];
    if (!def) {
      // if (typeof referenceId !== 'undefined') {
      //   console.warn(`[DestinyManifestService] getActivityType: Unknown activity for referenceId=${referenceId}, mode=${mode} (returning 'other')`);
      // }
      return 'other';
    }
    // Destiny 2: Use activityTypeHash or activityModeTypes
    const typeHash = def.activityTypeHash;
    const modeTypes: number[] = def.activityModeTypes || [];
    if (typeHash === 2043403989 || modeTypes.includes(4)) return 'raid';
    // Dungeon detection: check multiple known dungeon type hashes or mode 82
    const DUNGEON_TYPE_HASHES = [608898761]; // Common dungeon type hash for Shattered Throne, Pit of Heresy, and others
    if (DUNGEON_TYPE_HASHES.includes(typeHash) || modeTypes.includes(82)) return 'dungeon';
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
    // As a last resort, try to infer from display name
    const name = (def.displayProperties?.name || '').toLowerCase();
    if (name.includes('dungeon')) return 'dungeon';
    if (name.includes('leviathan') || name.includes('raid')) return 'raid';
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

  /**
   * Debug: List all Destiny 2 titles (seals) with their hashes and names
   */
  public debugListAllD2Titles(): void {
    const titles = Object.values(this.presentationNodes)
      .filter(
        node =>
          node.completionRecordHash &&
          node.parentNodeHashes &&
          node.parentNodeHashes.includes(1652422747)
      )
      .map(node => ({
        hash: node.completionRecordHash,
        name: node.displayProperties?.name,
        description: node.displayProperties?.description,
      }));
    // console.log('D2 Titles:', titles);
    // console.log('Total D2 Titles:', titles.length);
  }

  /**
   * Debug: List all Destiny 2 titles (seals) with their hashes and names, waiting for manifest load if needed
   */
  public debugListAllD2TitlesWhenLoaded(): void {
    this.isLoaded().subscribe(loaded => {
      if (loaded) {
        this.debugListAllD2Titles();
      } else {
        // console.warn('Manifest not loaded yet.');
      }
    });
  }

  /**
   * Returns all Destiny 2 title nodes (seals) by parentNodeHashes including 1652422747
   */
  public getAllD2TitleNodesByParentHash(): any[] {
    return Object.values(this.presentationNodes).filter(
      (node: any) =>
        node.completionRecordHash &&
        node.parentNodeHashes &&
        node.parentNodeHashes.includes(1652422747)
    );
  }

  /**
   * Returns all Destiny 2 title nodes (seals) by loose filter: has completionRecordHash and titleInfo.hasTitle
   */
  public getAllD2TitleNodesLoose(): any[] {
    return Object.values(this.presentationNodes).filter(
      (node: any) =>
        node.completionRecordHash &&
        node.titleInfo &&
        node.titleInfo.hasTitle
    );
  }

  /**
   * Returns all Destiny 2 title records (seals) by loose filter: has titleInfo.hasTitle
   */
  public getAllD2TitleRecordsLoose(): any[] {
    return Object.values(this.titleDefs).filter(
      (record: any) =>
        record.titleInfo &&
        record.titleInfo.hasTitle
    );
  }

  /**
   * Public getter for manifest loaded state (synchronous)
   */
  public get isLoadedSync(): boolean {
    return this.manifestLoaded.value;
  }

  /**
   * Public getter for presentation nodes
   */
  public getPresentationNodes(): any {
    return this.presentationNodes;
  }

  /**
   * Public getter for titleDefs
   */
  public getTitleDefs(): any {
    return this.titleDefs;
  }
} 