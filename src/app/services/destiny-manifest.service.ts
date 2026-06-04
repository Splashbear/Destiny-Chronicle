import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Destiny1ManifestService } from './destiny1-manifest.service';
import { ActivityDbService } from './activity-db.service';
import { LocaleService } from './locale.service';
import { ManifestCacheService } from './manifest-cache.service';
import { AssetUrlService } from './asset-url.service';
import { ArchiveRuntimeService } from './archive-runtime.service';
import { isAnyPantheonActivity } from '../config/pantheon.config';

@Injectable({
  providedIn: 'root'
})
export class DestinyManifestService {
  private activityDefs: { [key: string]: any } = {};
  private titleDefs: { [key: string]: any } = {};
  private presentationNodes: { [key: string]: any } = {};
  private activityFamilyDefs: { [key: string]: any } = {};
  private manifestLoaded = new BehaviorSubject<boolean>(false);
  private loadedCulture: string | null = null;
  


  private buildUrl(url: string): string {
    // For now, use direct API calls to avoid rate limiting issues
    // We'll need to implement a proper solution for production deployment
    return url;
  }

  constructor(
    private http: HttpClient,
    private d1Manifest: Destiny1ManifestService,
    private locale: LocaleService,
    private manifestCache: ManifestCacheService,
    private assetUrl: AssetUrlService,
    private archiveRuntime: ArchiveRuntimeService
  ) {
    if (!this.archiveRuntime.isOfflineMode) {
      this.loadManifest();
    }
  }

  /** Active Bungie manifest culture for D2 definition strings. */
  get manifestCulture(): string {
    return this.locale.culture;
  }

  private async fetchDefinition(
    version: string,
    culture: string,
    component: string,
    path: string
  ): Promise<any> {
    const cacheKey = this.manifestCache.manifestComponentKey(version, culture, component);
    const cached = this.manifestCache.getManifestData(cacheKey);
    if (cached) {
      return cached;
    }
    const raw = await firstValueFrom(this.http.get(this.buildUrl('https://www.bungie.net' + path)));
    this.manifestCache.cacheManifestData(cacheKey, raw);
    return raw;
  }

  /** Ensure live D2 defs match the active locale before archiving a manifest subset. */
  async ensureReadyForArchiveSnapshot(): Promise<void> {
    if (this.archiveRuntime.isOfflineMode && !this.archiveRuntime.allowLiveApi) {
      return;
    }
    const culture = this.locale.culture;
    if (this.manifestLoaded.value && this.loadedCulture === culture) {
      return;
    }
    await this.loadManifest();
  }

  async loadManifest() {
    if (this.archiveRuntime.isOfflineMode && !this.archiveRuntime.allowLiveApi) {
      return;
    }
    try {
      // Step 1: Get manifest metadata
      const manifestMeta: any = await firstValueFrom(this.http.get(this.buildUrl('https://www.bungie.net/Platform/Destiny2/Manifest/')));
      const contentPaths = manifestMeta.Response?.jsonWorldComponentContentPaths ?? {};
      const cultures = Object.keys(contentPaths);
      this.locale.setAvailableCultures(cultures);
      const culture = this.locale.culture;
      const culturePath = contentPaths[culture] ?? contentPaths.en;
      if (!culturePath) {
        throw new Error('Manifest metadata missing culture path');
      }
      const version = String(manifestMeta.Response?.version ?? 'unknown');
      if (culture !== 'en' && !contentPaths[culture]) {
        console.info(`[Manifest] Culture "${culture}" unavailable; using English definitions.`);
      }
      // Step 2: Get activity, title, presentation node, and activity family definitions (localized)
      const [activityDefsRaw, titleDefsRaw, presentationNodesRaw, activityFamilyDefsRaw] = await Promise.all([
        this.fetchDefinition(version, culture, 'DestinyActivityDefinition', culturePath.DestinyActivityDefinition),
        this.fetchDefinition(version, culture, 'DestinyRecordDefinition', culturePath.DestinyRecordDefinition),
        this.fetchDefinition(version, culture, 'DestinyPresentationNodeDefinition', culturePath.DestinyPresentationNodeDefinition),
        culturePath.DestinyActivityFamilyDefinition
          ? this.fetchDefinition(version, culture, 'DestinyActivityFamilyDefinition', culturePath.DestinyActivityFamilyDefinition).catch(() => ({}))
          : Promise.resolve({})
      ]);
      // Defensive: handle both possible structures
      this.activityDefs = (activityDefsRaw as any).DestinyActivityDefinition || activityDefsRaw;
      this.titleDefs = (titleDefsRaw as any).DestinyRecordDefinition || titleDefsRaw;
      this.presentationNodes = (presentationNodesRaw as any).DestinyPresentationNodeDefinition || presentationNodesRaw;
      this.activityFamilyDefs = (activityFamilyDefsRaw as any)?.DestinyActivityFamilyDefinition || activityFamilyDefsRaw || {};
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
      this.loadedCulture = culture;
      this.manifestLoaded.next(true);
      console.log(`[Manifest] Loaded Destiny 2 manifest (culture: ${culture}, version: ${version}).`);
    } catch (error: unknown) {
      const msg = error instanceof HttpErrorResponse
        ? `Bungie manifest unavailable (${error.status ?? 'network'}). Activity names may load once the API is reachable.`
        : error instanceof Error
          ? error.message
          : 'Unknown error';
      if (error instanceof HttpErrorResponse && error.status >= 500) {
        console.warn('[Manifest]', msg);
      } else {
        console.error('[Manifest] Error loading D2 manifest:', msg);
      }
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

  /**
   * Merge D1 activity definitions from an Activity History response (when definitions=true).
   * Call after fetching D1 activities so names resolve from the API.
   */
  injectD1DefinitionsFromActivityHistoryResponse(definitions: any): void {
    if (definitions) {
      this.d1Manifest.injectDefinitionsFromApi(definitions);
    }
  }

  /** @see Destiny1ManifestService.findActivityHashesByExactName */
  findD1ActivityHashesByExactName(displayName: string): string[] {
    return this.d1Manifest.findActivityHashesByExactName(displayName);
  }

  /** Known D1 raid (and key activity) names when definition is missing from manifest/API. */
  private static D1_KNOWN_NAMES: Record<string, string> = {
    '3801607287': "Vault of Glass", '708693006': "Vault of Glass", '2659248071': "Vault of Glass", '2659248068': "Vault of Glass", '2659248069': "Vault of Glass", '856898338': "Vault of Glass", '4038697181': "Vault of Glass",
    '898834093': "Crota's End", '112157962': "Crota's End", '3879860662': "Crota's End", '1836893116': "Crota's End", '1836893119': "Crota's End", '2324706853': "Crota's End", '4000873610': "Crota's End",
    '1733556769': "King's Fall", '3534581229': "King's Fall", '1016659723': "King's Fall", '3978884648': "King's Fall",
    '2578867903': "Wrath of the Machine", '4007500989': "Wrath of the Machine", '1099433614': "Wrath of the Machine", '1342567280': "Wrath of the Machine", '260765522': "Wrath of the Machine", '1387993552': "Wrath of the Machine", '430160982': "Wrath of the Machine", '3356249023': "Wrath of the Machine"
  };

  getActivityName(referenceId: string | number, isD1: boolean = false): string {
    if (!referenceId) return 'Unknown Activity';
    if (isD1) {
      const name = this.d1Manifest.getActivityName(referenceId);
      if (name && name !== 'Unknown Activity') return name;
      return DestinyManifestService.D1_KNOWN_NAMES[String(referenceId)] || name || 'Unknown Activity';
    }
    if (!this.manifestLoaded.value) return 'Loading...';
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
    return def && def.displayProperties?.icon ? this.assetUrl.resolve(def.displayProperties.icon) : '';
  }

  getActivityDefinitionRaw(referenceId: string | number): any {
    return this.activityDefs[String(referenceId)];
  }

  /** Load trimmed manifest defs from an offline archive bundle. */
  loadFromArchive(activityDefs: Record<string, unknown>, presentationNodes: Record<string, unknown>): void {
    this.activityDefs = { ...this.activityDefs, ...activityDefs };
    this.presentationNodes = { ...this.presentationNodes, ...presentationNodes };
    this.manifestLoaded.next(true);
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
      return result ? this.assetUrl.resolve(result) : undefined;
    }
  }

  /**
   * Returns normalized pieces for breakdown views:
   * - baseName: family/base activity name (e.g. \"Lake of Shadows\")
   * - variantName: difficulty or variant label (e.g. \"Nightfall\", \"Nightfall Grandmaster\", \"Smuggle\")
   * When isD1 is true, uses D1 manifest/name so D1 activities display correctly.
   */
  getActivityBreakdownParts(referenceId: string | number, isD1?: boolean): { baseName: string; variantName: string } {
    if (isD1) {
      const baseName = this.getActivityName(referenceId, true) || 'Unknown Activity';
      return { baseName, variantName: '' };
    }
    const baseName = this.getActivityFamilyName(referenceId, false) || 'Unknown Activity';

    if (!this.manifestLoaded.value) {
      return { baseName, variantName: '' };
    }

    const def = this.activityDefs[String(referenceId)];
    const fullName: string = def?.displayProperties?.name || baseName;

    // If the full name already equals the base name, there is no explicit variant label.
    if (!fullName || fullName === baseName) {
      return { baseName, variantName: '' };
    }

    // Helper: remove common prefixes like \"Invasion:\" before parsing.
    const stripCommonPrefixes = (name: string): string => {
      return name.replace(/^Invasion:\s*/i, '').trim();
    };

    let working = stripCommonPrefixes(fullName);

    // Try to extract variant by removing the base name from the working string.
    let variantCandidate = working.replace(baseName, '').trim();
    if (variantCandidate.startsWith(':')) {
      variantCandidate = variantCandidate.slice(1).trim();
    }

    // If we didn't get anything useful, fall back to colon-based splitting.
    if (!variantCandidate) {
      const parts = working.split(':').map(p => p.trim()).filter(Boolean);
      if (parts.length > 1) {
        // Prefer the part that is not equal to the base name.
        const alt = parts.find(p => p !== baseName);
        if (alt) {
          variantCandidate = alt;
        }
      }
    }

    return {
      baseName,
      variantName: variantCandidate || ''
    };
  }

  getActivityType(referenceId: string | number, mode?: number, isD1?: boolean): string {
    // D1: use D1 manifest type when available so we get correct categorization from D1 definitions
    if (isD1) {
      const d1Type = this.d1Manifest.getActivityType(referenceId);
      if (d1Type && d1Type !== 'unknown') {
        const normalized = this.normalizeD1ActivityType(d1Type);
        if (normalized) return normalized;
      }
    }

    // Special case: Shattered Throne has wrong mode but is definitely a dungeon
    const refIdStr = String(referenceId);
    if (refIdStr === '2032534090' || refIdStr === '1347078175') {
      return 'dungeon';
    }
    
    const activityName = this.activityDefs[refIdStr]?.displayProperties?.name as string | undefined;
    if (isAnyPantheonActivity(refIdStr, activityName)) {
      return 'raid';
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
    // First check ACTIVITY_FAMILY_MAP for known activities (provides proper variant naming)
    // Then fall back to manifest-based automatic detection for new activities
    const ACTIVITY_FAMILY_MAP = (ActivityDbService as any).ACTIVITY_FAMILY_MAP || {};
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
        "Vesper's Host", 'Sundered Doctrine', 'Equilibrium'
      ]);
      const D2_RAIDS = new Set([
        'Leviathan', 'Leviathan, Eater of Worlds', 'Leviathan, Spire of Stars', 'Crown of Sorrow',
        'Garden of Salvation', 'Deep Stone Crypt', 'Vault of Glass', 'Vow of the Disciple',
        "King's Fall", 'Root of Nightmares', "Crota's End", "Salvation's Edge",
        'The Pantheon', 'The Desert Perpetual'
      ]);
      if (D2_DUNGEONS.has(baseName)) return 'dungeon';
      if (D2_RAIDS.has(baseName) || baseName.startsWith('The Pantheon')) return 'raid';
    }
    
    // Fall back to manifest-based automatic detection for new activities
    // This ensures any new raid/dungeon is detected automatically based on Bungie's type definitions
    const def = this.activityDefs[referenceId];
    if (!def) {
      // If manifest not loaded yet, return 'other' - will be retried when manifest loads
      if (!this.manifestLoaded.value) {
        return 'other';
      }
      // Manifest loaded but activity not found - might be a new activity not yet in cache
      // Try to fetch it or return 'other' for now
      return 'other';
    }
    
    // Destiny 2: Use activityTypeHash or activityModeTypes - fully automatic detection
    const typeHash = def.activityTypeHash;
    const modeTypes: number[] = def.activityModeTypes || [];
    
    // Raid detection: activityTypeHash 2043403989 OR mode type 4
    if (typeHash === 2043403989 || modeTypes.includes(4)) return 'raid';
    
    // Dungeon detection: check multiple known dungeon type hashes or mode 82
    // Common dungeon type hashes: 608898761 (most common), and others
    const DUNGEON_TYPE_HASHES = [608898761, 1375089621]; // Add more as discovered
    if (DUNGEON_TYPE_HASHES.includes(typeHash) || modeTypes.includes(82)) return 'dungeon';
    
    // Additional automatic detection: check display name for keywords (fallback)
    const name = (def.displayProperties?.name || '').toLowerCase();
    if (name.includes('dungeon') && !name.includes('raid')) return 'dungeon';
    if (name.includes('raid') || name.includes('leviathan')) return 'raid';
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
    // As a last resort, try to infer from display name (name already declared above)
    if (name.includes('dungeon')) return 'dungeon';
    if (name.includes('leviathan') || name.includes('raid')) return 'raid';
    return 'other';
  }

  /** Map D1 manifest type (identifier or activityTypeName) to our breakdown type slug. */
  private normalizeD1ActivityType(d1Type: string): string {
    const lower = d1Type.toLowerCase();
    if (lower.includes('raid')) return 'raid';
    if (lower.includes('strike') || lower.includes('nightfall')) return lower.includes('nightfall') ? 'nightfall' : 'strike';
    if (lower.includes('story')) return 'story';
    if (lower.includes('patrol')) return 'patrol';
    if (lower.includes('pvp') || lower.includes('crucible') || lower.includes('elimination') || lower.includes('rumble') || lower.includes('supremacy') || lower.includes('inferno')) return 'crucible';
    if (lower.includes('public') || lower.includes('event')) return 'public-event';
    return ''; // unknown D1 type -> caller falls back to mode-based logic
  }

  /**
   * Automatically detect new raids and dungeons from the manifest
   * Returns activities that match raid/dungeon criteria but aren't in ACTIVITY_FAMILY_MAP
   */
  detectNewRaidsAndDungeons(): {
    raids: Array<{ hash: string; name: string; typeHash: number; modeTypes: number[]; mode?: number }>;
    dungeons: Array<{ hash: string; name: string; typeHash: number; modeTypes: number[]; mode?: number }>;
    suggestions: Array<{ hash: string; suggestedName: string; type: 'raid' | 'dungeon' }>;
  } {
    const RAID_TYPE_HASH = 2043403989;
    const DUNGEON_TYPE_HASH = 608898761;
    const RAID_MODE = 4;
    const DUNGEON_MODE = 82;

    // Get all known hashes from ACTIVITY_FAMILY_MAP
    const ACTIVITY_FAMILY_MAP = (ActivityDbService as any).ACTIVITY_FAMILY_MAP || {};
    const knownHashes = new Set(Object.keys(ACTIVITY_FAMILY_MAP));

    const detectedRaids: Array<{ hash: string; name: string; typeHash: number; modeTypes: number[]; mode?: number }> = [];
    const detectedDungeons: Array<{ hash: string; name: string; typeHash: number; modeTypes: number[]; mode?: number }> = [];

    // Scan all activities in the manifest
    for (const [hash, def] of Object.entries(this.activityDefs)) {
      if (!def || knownHashes.has(hash)) continue; // Skip if already known

      const typeHash = def.activityTypeHash;
      const modeTypes: number[] = def.activityModeTypes || [];
      const name = def.displayProperties?.name || 'Unknown Activity';

      // Skip if name suggests it's not a real activity (test, placeholder, etc.)
      const nameLower = name.toLowerCase();
      if (nameLower.includes('test') || nameLower.includes('placeholder') || nameLower === 'unknown activity') {
        continue;
      }

      // Check if it's a raid
      const isRaid = typeHash === RAID_TYPE_HASH || modeTypes.includes(RAID_MODE);
      // Check if it's a dungeon
      const isDungeon = typeHash === DUNGEON_TYPE_HASH || modeTypes.includes(DUNGEON_MODE);

      if (isRaid) {
        detectedRaids.push({ hash, name, typeHash, modeTypes });
      } else if (isDungeon) {
        detectedDungeons.push({ hash, name, typeHash, modeTypes });
      }
    }

    // Generate suggestions for ACTIVITY_FAMILY_MAP entries
    const suggestions: Array<{ hash: string; suggestedName: string; type: 'raid' | 'dungeon' }> = [];

    // Group raids by base name and suggest variants
    const raidGroups = new Map<string, Array<{ hash: string; name: string }>>();
    for (const raid of detectedRaids) {
      const baseName = this.extractBaseName(raid.name);
      if (!raidGroups.has(baseName)) {
        raidGroups.set(baseName, []);
      }
      raidGroups.get(baseName)!.push({ hash: raid.hash, name: raid.name });
    }

    for (const [baseName, variants] of raidGroups) {
      for (const variant of variants) {
        const variantName = this.extractVariantName(variant.name, baseName);
        suggestions.push({
          hash: variant.hash,
          suggestedName: `${baseName}: ${variantName}`,
          type: 'raid'
        });
      }
    }

    // Group dungeons by base name and suggest variants
    const dungeonGroups = new Map<string, Array<{ hash: string; name: string }>>();
    for (const dungeon of detectedDungeons) {
      const baseName = this.extractBaseName(dungeon.name);
      if (!dungeonGroups.has(baseName)) {
        dungeonGroups.set(baseName, []);
      }
      dungeonGroups.get(baseName)!.push({ hash: dungeon.hash, name: dungeon.name });
    }

    for (const [baseName, variants] of dungeonGroups) {
      for (const variant of variants) {
        const variantName = this.extractVariantName(variant.name, baseName);
        suggestions.push({
          hash: variant.hash,
          suggestedName: `${baseName}: ${variantName}`,
          type: 'dungeon'
        });
      }
    }

    return { raids: detectedRaids, dungeons: detectedDungeons, suggestions };
  }

  /**
   * Extract base name from activity name (removes variant suffixes)
   */
  private extractBaseName(activityName: string): string {
    // Remove common variant suffixes
    const variantSuffixes = [
      ': Master', ': Standard', ': Normal', ': Prestige', ': Challenge',
      ': Expert', ': Legend', ': Contest', ': Day One', ': World First',
      ': Hard', ': Easy', ': Heroic', ': Grandmaster', ': Epic',
      ': Explorer', ': Eternity', ': Ultimatum'
    ];

    let baseName = activityName;
    for (const suffix of variantSuffixes) {
      if (baseName.endsWith(suffix)) {
        baseName = baseName.replace(suffix, '');
        break;
      }
    }

    // Handle parentheses (e.g., "The Desert Perpetual (Epic): Contest" -> "The Desert Perpetual")
    const parenMatch = baseName.match(/^(.+?)\s*\([^)]+\)/);
    if (parenMatch) {
      baseName = parenMatch[1].trim();
    }

    return baseName.trim();
  }

  /**
   * Extract variant name from activity name
   */
  private extractVariantName(activityName: string, baseName: string): string {
    // Remove base name
    let variant = activityName.replace(baseName, '').trim();

    // Remove leading colon and space
    if (variant.startsWith(': ')) {
      variant = variant.substring(2);
    }

    // Handle parentheses (e.g., "(Epic): Contest" -> "Epic: Contest")
    const parenMatch = variant.match(/^\(([^)]+)\)\s*:?\s*(.+)?$/);
    if (parenMatch) {
      const parenContent = parenMatch[1];
      const afterParen = parenMatch[2] || '';
      variant = `${parenContent}${afterParen ? ': ' + afterParen : ''}`.trim();
    }

    // Default to "Normal" or "Standard" if no variant found
    if (!variant || variant === activityName) {
      // Try to infer from common patterns
      const nameLower = activityName.toLowerCase();
      if (nameLower.includes('master')) return 'Master';
      if (nameLower.includes('contest')) return 'Contest';
      if (nameLower.includes('prestige')) return 'Prestige';
      if (nameLower.includes('legend')) return 'Legend';
      if (nameLower.includes('expert')) return 'Expert';
      if (nameLower.includes('epic')) return 'Epic';
      if (nameLower.includes('explorer')) return 'Explorer';
      if (nameLower.includes('eternity')) return 'Eternity';
      if (nameLower.includes('ultimatum')) return 'Ultimatum';
      return 'Normal';
    }

    return variant;
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
          return this.assetUrl.resolve(iconPath);
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
    this.isLoaded().subscribe((loaded: boolean) => {
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

  /**
   * Gets the activity family hash for an activity, if available.
   * This allows automatic grouping of activity variants.
   */
  getActivityFamilyHash(referenceId: string | number): number | undefined {
    if (!this.manifestLoaded.value) return undefined;
    const def = this.activityDefs[String(referenceId)];
    return def?.activityFamilyHash;
  }

  /**
   * Gets all activity hashes that belong to the same family as the given activity.
   * This enables automatic grouping of variants (Normal, Master, Contest, Epic, etc.)
   */
  getActivityFamilyMembers(referenceId: string | number): string[] {
    if (!this.manifestLoaded.value) return [];
    const familyHash = this.getActivityFamilyHash(referenceId);
    if (!familyHash) return [];

    // Find the family definition
    const familyDef = this.activityFamilyDefs[String(familyHash)];
    if (!familyDef) return [];

    // Handle different possible structures for family members
    let members: any[] = [];
    if (familyDef.members) {
      members = Array.isArray(familyDef.members) ? familyDef.members : [];
    } else if (familyDef.activityHashes) {
      members = Array.isArray(familyDef.activityHashes) ? familyDef.activityHashes : [];
    } else if (familyDef.children && familyDef.children.activities) {
      members = Array.isArray(familyDef.children.activities) ? familyDef.children.activities : [];
    }

    // Return all activity hashes in this family
    return members.map((member: any) => {
      if (typeof member === 'string' || typeof member === 'number') {
        return String(member);
      }
      return String(member.activityHash || member.hash || member);
    }).filter(Boolean);
  }

  /**
   * Automatically determines the base activity name by grouping variants.
   * Uses manifest family data when available, falls back to name parsing.
   */
  getBaseActivityNameFromManifest(referenceId: string | number): string {
    if (!this.manifestLoaded.value) {
      const name = this.getActivityName(referenceId, false);
      return this.normalizeBaseName(name);
    }

    const def = this.activityDefs[String(referenceId)];
    if (!def) {
      const name = this.getActivityName(referenceId, false);
      return this.normalizeBaseName(name);
    }

    const name = def.displayProperties?.name || 'Unknown Activity';
    
    // Try to get family members to find the "base" activity (usually the first or standard one)
    const familyMembers = this.getActivityFamilyMembers(referenceId);
    if (familyMembers.length > 0) {
      // Find the base activity (usually Standard/Normal variant, or first one)
      // Check all family members to find the canonical base name
      let baseName: string | null = null;
      
      for (const memberHash of familyMembers) {
        const memberDef = this.activityDefs[memberHash];
        if (memberDef) {
          const memberName = memberDef.displayProperties?.name || '';
          // Prefer Standard, Normal, or base name without variant suffix
          if (!memberName.includes(': ')) {
            // Found a name without variant - this is likely the base
            baseName = memberName;
            break;
          } else if (!baseName && (
              memberName.includes(': Standard') || 
              memberName.includes(': Normal'))) {
            baseName = this.normalizeBaseName(memberName);
          }
        }
      }
      
      // If we found a base name, use it; otherwise normalize the current activity's name
      if (baseName) {
        return this.normalizeBaseName(baseName);
      }
      
      // If no standard found, use the first family member's normalized name
      const firstDef = this.activityDefs[familyMembers[0]];
      if (firstDef) {
        const firstName = firstDef.displayProperties?.name || name;
        return this.normalizeBaseName(firstName);
      }
    }

    // Fallback to name normalization
    return this.normalizeBaseName(name);
  }

  /**
   * Normalizes an activity name by removing variant suffixes.
   * Handles any variant naming convention (Master, Epic, Contest, etc.)
   */
  private normalizeBaseName(name: string): string {
    // Remove variant suffixes (anything after ": ")
    const colonIndex = name.indexOf(': ');
    if (colonIndex !== -1) {
      return name.substring(0, colonIndex).trim();
    }
    return name.trim();
  }

  /**
   * Checks if an activity is in Contest mode based on manifest data.
   * Contest mode is typically indicated by modifiers or specific naming.
   */
  isContestMode(referenceId: string | number): boolean {
    if (!this.manifestLoaded.value) return false;
    const def = this.activityDefs[String(referenceId)];
    if (!def) return false;

    const name = (def.displayProperties?.name || '').toLowerCase();
    
    // Check for contest mode indicators in name
    if (name.includes('contest') || name.includes('day one')) {
      return true;
    }

    // Check modifiers for contest mode
    if (def.modifiers) {
      for (const modifier of def.modifiers) {
        const modifierDef = this.activityDefs[String(modifier)];
        if (modifierDef) {
          const modifierName = (modifierDef.displayProperties?.name || '').toLowerCase();
          if (modifierName.includes('contest')) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Gets the activity family name (base name) for grouping.
   * When isD1 is true, uses D1 name so D1 activities group correctly.
   */
  getActivityFamilyName(referenceId: string | number, isD1?: boolean): string {
    if (isD1) {
      const name = this.getActivityName(referenceId, true);
      return this.normalizeBaseName(name || 'Unknown Activity');
    }
    // First try manifest-based grouping
    const baseName = this.getBaseActivityNameFromManifest(referenceId);
    if (baseName && baseName !== 'Unknown Activity') {
      return baseName;
    }
    // Fallback to simple name normalization
    const name = this.getActivityName(referenceId, false);
    return this.normalizeBaseName(name);
  }
} 