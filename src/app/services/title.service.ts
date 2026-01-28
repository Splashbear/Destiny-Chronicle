import { Injectable } from '@angular/core';
import { BungieApiService } from './bungie-api.service';
import { DestinyManifestService } from './destiny-manifest.service';
import { firstValueFrom } from 'rxjs';

export interface TitleItem {
  hash: number;
  name: string;
  icon?: string | null;
  altIcon?: string | null;
  completed: boolean;
  locked: boolean;
  legacy: boolean;
  releaseRank?: number;
  holders?: { displayName: string; platform: string }[];
  isGilded?: boolean;
  timesGilded?: number;
  gildedIcon?: string;
  normalized?: string;
}

export interface PlayerIdentityMin {
  game: 'D1' | 'D2';
  membershipType: number;
  membershipId: string;
  displayName: string;
  platform: string;
}

@Injectable({ providedIn: 'root' })
export class TitleService {
  constructor(private bungie: BungieApiService, private manifest: DestinyManifestService) {}

  /**
   * Fetches the player's title records and returns a raw map of record hashes
   * to record objects. Low-level helper mostly for internal use.
   */
  private async fetchProfileRecords(membershipType: number, membershipId: string): Promise<any> {
    const response = await firstValueFrom(this.bungie.getPlayerTitles(membershipType, membershipId));
    return response?.Response || {};
  }

  /**
   * High-level helper that will eventually replicate the component's existing
   * title-building logic and return the list of `TitleItem` rows ready for display.
   * For now this is just a placeholder that returns an empty array so we can wire
   * the service incrementally without breaking the build.
   */
  async getPlayerTitles(player: PlayerIdentityMin): Promise<TitleItem[]> {
    // Load manifest if not yet ready
    if (!this.manifest.isLoadedSync) {
      await this.manifest.isLoaded().toPromise();
    }

    const presentationNodes = this.manifest.getPresentationNodes();

    // --- local helpers / constants copied from component ---
    const SPECIAL_TITLES: { [hash: number]: { name: string; gildingTrackingRecordHash?: number } } = {
      4022875525: { name: 'Shadow', gildingTrackingRecordHash: 1366561603 },
      347120011: { name: 'Reaper', gildingTrackingRecordHash: 4161118613 },
      1039791253: { name: 'Iron Lord' } // etc. (trimmed list for brevity)
    };

    // Hash-based release order mapping (more reliable than name matching).
    // Maps completionRecordHash -> releaseRank and takes precedence over name-based lookup.
    const HASH_RELEASE_ORDER: { [hash: number]: number } = {
      // MMXXIII MoT (2023) - Rank 40
      3175660257: 40,
      126238604: 50
    };

    // Normalize title names: lowercase and remove all non-alphanumeric characters
    const normalizeTitleName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Explicit release order mapping (higher = newer).
    // Keys must match normalizeTitleName(), so we normalize a readable raw list once.
    // Organized chronologically by release rank (oldest to newest).
    const RELEASE_ORDER_RAW: { [name: string]: number } = {
      // Rank 1: 9/4/2018 - Forsaken launch (alphabetical: chronicler, cursebreaker, dredgen, rivensbane, wayfarer)
      'chronicler': 1,
      'cursebreaker': 1,
      'dredgen': 1,
      'rivensbane': 1,
      'wayfarer': 1,
      
      // Rank 2: 12/7/2018 - Black Armory
      'blacksmith': 2,
      
      // Rank 3: 3/5/2019 - Season of the Drifter
      'reckoner': 3,
      
      // Rank 4: 6/4/2019 - Season of Opulence
      'shadow': 4,
      
      // Rank 5: 7/9/2019 - Moments of Triumph 2019
      'mmxix mot': 5,
      'mmxix': 5, // Alternative format without "MoT"
      
      // Rank 6: 10/1/2019 - Shadowkeep launch
      'undying': 6,
      
      // Rank 7: 10/5/2019 - Season of Opulence
      'enlightened': 7,
      
      // Rank 8: 10/29/2019 - Season of the Undying
      'harbinger': 8,
      
      // Rank 9: 12/10/2019 - Season of Dawn
      'savior': 9,
      
      // Rank 10: 3/10/2020 - Season of the Worthy (alphabetical: almighty, conqueror)
      'almighty': 10,
      'conqueror': 10,
      
      // Rank 11: 6/9/2020 - Season of Arrivals
      'forerunner': 11,
      
      // Rank 12: 7/7/2020 - Moments of Triumph 2020
      'mmxx mot': 12,
      'mmxx': 12, // Alternative format without "MoT"
      
      // Rank 13: 11/10/2020 - Beyond Light launch (alphabetical: splintered, warden)
      'splintered': 13,
      'warden': 13,
      
      // Rank 14: 11/21/2020 - Season of the Hunt
      'descendant': 14,
      
      // Rank 15: 2/9/2021 - Season of the Chosen
      'chosen': 15,
      
      // Rank 16: 5/11/2021 - Season of the Splicer
      'splicer': 16,
      
      // Rank 17: 5/22/2021 - Season of the Splicer
      'fatebreaker': 17,
      
      // Rank 18: 8/24/2021 - Season of the Lost (alphabetical: deadeye, realmwalker)
      'deadeye': 18,
      'realmwalker': 18,
      
      // Rank 19: 12/7/2021 - Moments of Triumph 2021 (alphabetical: mmxxi mot, vidmaster)
      'mmxxi mot': 19,
      'mmxxi': 19, // Alternative format without "MoT"
      'vidmaster': 19,
      
      // Rank 20: 2/22/2022 - The Witch Queen launch (alphabetical: disciple-slayer, gumshoe, risen)
      'disciple-slayer': 20,
      'gumshoe': 20,
      'risen': 20,
      
      // Rank 21: 5/24/2022 - Season of the Haunted (alphabetical: iron lord, reaper)
      'iron lord': 21,
      'reaper': 21,
      
      // Rank 22: 5/27/2022 - Season of the Haunted
      'discerptor': 22,
      
      // Rank 23: 7/19/2022 - Season of the Haunted
      'reveler': 23,
      
      // Rank 24: 7/20/2022 - Season of the Haunted
      'flamekeeper': 24,
      
      // Rank 25: 8/23/2022 - Season of Plunder
      'scallywag': 25,
      
      // Rank 26: 8/26/2022 - Season of Plunder
      'kingslayer': 26,
      
      // Rank 27: 9/1/2022 - Season of Plunder (note: sheet shows 9/1/2023 but should be 2022)
      'swordbearer': 27,
      
      // Rank 28: 10/18/2022 - Season of the Seraph
      'ghost writer': 28,
      
      // Rank 29: 12/6/2022 - Season of the Seraph (alphabetical: glorious, mmxxii mot, seraph)
      'glorious': 29,
      'mmxxii mot': 29,
      'mmxxii': 29, // Alternative format without "MoT"
      'seraph': 29,
      
      // Rank 30: 12/9/2022 - Season of the Seraph
      'wanted': 30,
      
      // Rank 31: 12/13/2022 - Season of the Seraph
      'star baker': 31,
      
      // Rank 32: 2/8/2023 - Lightfall launch (alphabetical: queensguard, virtual fighter)
      'queensguard': 32,
      'virtual fighter': 32,
      
      // Rank 33: 3/10/2023 - Season of Defiance
      'dream warrior': 33,
      
      // Rank 34: 5/2/2023 - Season of the Deep
      'champ': 34,
      
      // Rank 35: 5/23/2023 - Season of the Deep
      'aquanaut': 35,
      
      // Rank 36: 5/26/2023 - Season of the Deep
      'ghoul': 36,
      
      // Rank 37: 8/22/2023 - Season of the Witch
      'haruspex': 37,
      
      // Rank 38: 11/28/2023 - Season of the Wish
      'wishbearer': 38,
      
      // Rank 39: 12/1/2023 - Season of the Wish
      'wrathbearer': 39,
      
      // Rank 40: 1/30/2024 - Moments of Triumph 2023
      'mmxxiii mot': 40,
      'mmxxiii': 40, // Alternative format without "MoT"
      
      // Rank 41: 4/9/2024 - The Final Shape launch
      'brave': 41,
      
      // Rank 42: 4/30/2024 - The Final Shape
      'godslayer': 42,
      
      // Rank 43: 6/4/2024 - The Final Shape (alphabetical: intrepid, transcendent)
      'intrepid': 43,
      'transcendent': 43,
      
      // Rank 44: 6/7/2024 - The Final Shape
      'iconoclast': 44,
      
      // Rank 45: 9/9/2024 - The Final Shape
      'legend': 45,
      
      // Rank 46: 10/8/2024 - Post-Final Shape
      'slayer baron': 46,
      
      // Rank 47: 10/11/2024 - Post-Final Shape
      'unleashed': 47,
      
      // Rank 48: 2/4/2025 - Post-Final Shape
      'heretic': 48,
      
      // Rank 49: 2/7/2025 - Post-Final Shape
      'delver': 49,
      
      // Rank 50: 3/4/2025 - Moments of Triumph 2024
      'mmxxiv mot': 50,
      'mmxxiv': 50, // Alternative format without "MoT"
      
      // Rank 51: 5/6/2025 - Post-Final Shape
      'eternal': 51,
      
      // Rank 52: 5/9/2025 - Post-Final Shape
      'heavy metal': 52,
      
      // Rank 53: 7/15/2025 - Post-Final Shape
      'fated weapon': 53,
      
      // Rank 54: 7/19/2025 - Post-Final Shape
      'atemporal': 54,
      
      // Rank 55: 7/29/2025 - Post-Final Shape
      'sharpshooter': 55,
      
      // Rank 56: 11/11/2025 - Post-Final Shape
      'avant garde': 56,
      
      // Rank 57: 12/2/2025 - Post-Final Shape (alphabetical: renegade, undertaker)
      'renegade': 57,
      'undertaker': 57,
      
      // Rank 58: 12/13/2025 - Most recent
      'praxic': 58,
    };

    const RELEASE_ORDER: { [normalized: string]: number } = Object.fromEntries(
      Object.entries(RELEASE_ORDER_RAW).map(([k, v]) => [normalizeTitleName(k), v])
    );

    // Add alternative spellings for MMX* titles (Bungie API may return different formats)
    // Handle variations like "MMXIX", "MMXIX MoT", "MMXIX MOT", etc.
    // All normalize to the same key, but ensure we have mappings for common variations
    const mmxixRank = RELEASE_ORDER[normalizeTitleName('mmxix mot')] || 5;
    const mmxxRank = RELEASE_ORDER[normalizeTitleName('mmxx mot')] || 12;
    const mmxxiRank = RELEASE_ORDER[normalizeTitleName('mmxxi mot')] || 19;
    const mmxxiiRank = RELEASE_ORDER[normalizeTitleName('mmxxii mot')] || 29;
    const mmxxiiiRank = RELEASE_ORDER[normalizeTitleName('mmxxiii mot')] || 40;
    const mmxxivRank = RELEASE_ORDER[normalizeTitleName('mmxxiv mot')] || 50;
    
    // Ensure all variations map to the same rank (they should normalize to the same key, but just in case)
    RELEASE_ORDER[normalizeTitleName('MMXIX')] = mmxixRank;
    RELEASE_ORDER[normalizeTitleName('MMXIX MoT')] = mmxixRank;
    RELEASE_ORDER[normalizeTitleName('MMXIX MOT')] = mmxixRank;
    RELEASE_ORDER[normalizeTitleName('MMXX')] = mmxxRank;
    RELEASE_ORDER[normalizeTitleName('MMXX MoT')] = mmxxRank;
    RELEASE_ORDER[normalizeTitleName('MMXX MOT')] = mmxxRank;
    RELEASE_ORDER[normalizeTitleName('MMXXI')] = mmxxiRank;
    RELEASE_ORDER[normalizeTitleName('MMXXI MoT')] = mmxxiRank;
    RELEASE_ORDER[normalizeTitleName('MMXXI MOT')] = mmxxiRank;
    RELEASE_ORDER[normalizeTitleName('MMXXII')] = mmxxiiRank;
    RELEASE_ORDER[normalizeTitleName('MMXXII MoT')] = mmxxiiRank;
    RELEASE_ORDER[normalizeTitleName('MMXXII MOT')] = mmxxiiRank;
    RELEASE_ORDER[normalizeTitleName('MMXXIII')] = mmxxiiiRank;
    RELEASE_ORDER[normalizeTitleName('MMXXIII MoT')] = mmxxiiiRank;
    RELEASE_ORDER[normalizeTitleName('MMXXIII MOT')] = mmxxiiiRank;
    RELEASE_ORDER[normalizeTitleName('MMXXIV')] = mmxxivRank;
    RELEASE_ORDER[normalizeTitleName('MMXXIV MoT')] = mmxxivRank;
    RELEASE_ORDER[normalizeTitleName('MMXXIV MOT')] = mmxxivRank;

    const GILDED_SEAL_IMAGE_MAP: { [title: string]: string } = {
      "conqueror": "/assets/gilded-seals/Conqueror-Gilded.png",
      "flawless": "/assets/gilded-seals/Flawless-Gilded.png",
      "deadeye": "/assets/gilded-seals/Deadeye-Gilded.png"
    };

    // Gather all title nodes (current + legacy)
    const titleParentHashes = [616318467, 1881970629];
    let allTitleNodes: any[] = [];
    for (const parentHash of titleParentHashes) {
      const parentNode = presentationNodes[parentHash];
      if (!parentNode?.children?.presentationNodes) continue;
      allTitleNodes.push(...parentNode.children.presentationNodes.map((n: any) => presentationNodes[n.presentationNodeHash]).filter(Boolean));
    }

    // Fetch records from Bungie
    const response = await firstValueFrom(this.bungie.getPlayerTitles(player.membershipType, player.membershipId));
    const records = response.Response?.profileRecords?.data?.records || {};
    const charRecords = response.Response?.characterRecords?.data as { [c: string]: { records?: any } } || {};

    const titleMap: { [key: string]: any } = {};

    for (const node of allTitleNodes) {
      if (!node?.completionRecordHash) continue;

      let record = records[node.completionRecordHash];
      if (!record) {
        // look in character records
        for (const charId of Object.keys(charRecords)) {
          const rec = charRecords[charId]?.records?.[node.completionRecordHash];
          if (rec) { record = rec; break; }
        }
      }

      const recordDef = this.manifest.getTitleDefs()[node.completionRecordHash];
      const special = SPECIAL_TITLES[node.completionRecordHash] || SPECIAL_TITLES[node.hash];
      const displayName = special ? special.name : (recordDef?.titleInfo?.titlesByGender?.Male || node.displayProperties?.name || 'Unknown');
      const normalizedName = normalizeTitleName(displayName);

      const completed = record ? ((record.state & 1) !== 0) : false;

      // gilding
      let isGilded = false;
      let timesGilded = 0;
      let gildedIcon: string | undefined;
      const gildHash = special?.gildingTrackingRecordHash || recordDef?.titleInfo?.gildingTrackingRecordHash;
      if (gildHash && completed) {
        let gildingRecord = records[gildHash];
        if (!gildingRecord) {
          for (const charId of Object.keys(charRecords)) {
            const rec = charRecords[charId]?.records?.[gildHash];
            if (rec) { gildingRecord = rec; break; }
          }
        }
        if (gildingRecord) {
          timesGilded = gildingRecord.completedCount || 0;
          isGilded = timesGilded > 0;
          if (isGilded) gildedIcon = GILDED_SEAL_IMAGE_MAP[normalizedName];
        }
      }

      const uniqueKey = `${displayName}#${node.completionRecordHash}`;
      if (!titleMap[uniqueKey]) {
        // Prefer hash-based lookup, fall back to name-based lookup
        const hashRank = HASH_RELEASE_ORDER[node.completionRecordHash];
        const nameRank = RELEASE_ORDER[normalizedName] || 0;
        const releaseRank = hashRank !== undefined ? hashRank : nameRank;

        titleMap[uniqueKey] = {
          hash: node.completionRecordHash,
          name: displayName,
          icon: (isGilded && gildedIcon) ? gildedIcon : (node.displayProperties?.icon ? `https://www.bungie.net${node.displayProperties.icon}` : null),
          completed,
          isGilded,
          timesGilded: (completed && timesGilded > 0) ? timesGilded : undefined,
          locked: !completed,
          altIcon: (() => {
            const frames = node.iconSequences && node.iconSequences[1]?.frames;
            return frames && frames.length ? `https://www.bungie.net${frames[frames.length-1]}` : undefined;
          })(),
          legacy: (node.parentNodeHashes || []).includes(1881970629),
          releaseRank: releaseRank,
          normalized: normalizedName,
        } as TitleItem;
      }
    }

    const all = Object.values(titleMap) as TitleItem[];
    // Don't sort here - let the component's displayTitles getter handle sorting
    // based on user's selected sort option (alpha vs release)
    return all;
  }

  /**
   * Aggregates title lists from multiple players into a single list matching the
   * logic previously inside PlayerSearchComponent.
   */
  public aggregateTitles(players: PlayerIdentityMin[], titlesByPlayerKey: { [key: string]: TitleItem[] }): TitleItem[] {
    const getKey = (p: PlayerIdentityMin) => `${p.game}|${p.membershipId}`;

    // Choose reference (main) player – first D2 primary/cross-save or first D2 account
    const mainPlayer = players.find(p => p.game === 'D2') || players[0];
    if (!mainPlayer) return [];

    const mainList = titlesByPlayerKey[getKey(mainPlayer)] || [];

    const aggMap = new Map<number, TitleItem>();

    const addHolder = (t: any, holder: { displayName: string; platform: string }) => {
      if (!t.holders) t.holders = [];
      if (!t.holders.some((h: any) => h.displayName === holder.displayName && h.platform === holder.platform)) {
        t.holders.push(holder);
      }
    };

    // seed map with main titles
    for (const t of mainList) {
      const clone = { ...t, holders: t.completed ? [{ displayName: mainPlayer.displayName, platform: mainPlayer.platform }] : [] } as TitleItem;
      aggMap.set(t.hash, clone);
    }

    // merge titles from other players
    for (const p of players) {
      if (p.game === 'D1') continue;
      if (p.membershipId === mainPlayer.membershipId) continue;
      const list = titlesByPlayerKey[getKey(p)] || [];
      for (const t of list) {
        const existing = aggMap.get(t.hash);
        if (!existing) {
          const clone = { ...t, holders: t.completed ? [{ displayName: p.displayName, platform: p.platform }] : [] } as TitleItem;
          aggMap.set(t.hash, clone);
        } else {
          if (t.completed) addHolder(existing, { displayName: p.displayName, platform: p.platform });
          if (!existing.completed && t.completed) {
            existing.completed = true; existing.locked = false;
            if (!existing.icon) existing.icon = t.icon;
          }
        }
      }
    }

    // Don't sort here - preserve the order and let the component's displayTitles
    // getter handle sorting based on user's selected sort option (alpha vs release)
    return Array.from(aggMap.values());
  }

  /**
   * Checks for new titles by comparing current manifest with cached data
   * Returns information about new titles found
   */
  async checkForNewTitles(): Promise<{ newTitles: TitleItem[], totalTitles: number }> {
    // Load manifest if not yet ready
    if (!this.manifest.isLoadedSync) {
      await this.manifest.isLoaded().toPromise();
    }

    const presentationNodes = this.manifest.getPresentationNodes();
    
    // Get all title nodes (current + legacy)
    const titleParentHashes = [616318467, 1881970629];
    let allTitleNodes: any[] = [];
    for (const parentHash of titleParentHashes) {
      const parentNode = presentationNodes[parentHash];
      if (!parentNode?.children?.presentationNodes) continue;
      allTitleNodes.push(...parentNode.children.presentationNodes.map((n: any) => presentationNodes[n.presentationNodeHash]).filter(Boolean));
    }

    const totalTitles = allTitleNodes.length;
    const newTitles: TitleItem[] = [];

    // For now, just return the total count since we don't have a way to track "new" titles
    // In the future, this could compare against a cached list of known titles
    console.log(`[TitleService] Found ${totalTitles} total titles in manifest`);

    return { newTitles, totalTitles };
  }

  /**
   * Refreshes the manifest and returns updated title information
   */
  async refreshTitles(): Promise<{ newTitles: TitleItem[], totalTitles: number }> {
    await this.manifest.refreshManifest();
    return this.checkForNewTitles();
  }

  /**
   * Debug method to list all available titles in the manifest
   */
  async debugAllTitles(): Promise<void> {
    if (!this.manifest.isLoadedSync) {
      await this.manifest.isLoaded().toPromise();
    }

    const presentationNodes = this.manifest.getPresentationNodes();
    const titleDefs = this.manifest.getTitleDefs();
    
    console.log('[TitleService] Debugging all available titles...');
    
    // Get all title nodes (current + legacy)
    const titleParentHashes = [616318467, 1881970629];
    let allTitleNodes: any[] = [];
    for (const parentHash of titleParentHashes) {
      const parentNode = presentationNodes[parentHash];
      if (!parentNode?.children?.presentationNodes) continue;
      allTitleNodes.push(...parentNode.children.presentationNodes.map((n: any) => presentationNodes[n.presentationNodeHash]).filter(Boolean));
    }

    console.log(`[TitleService] Found ${allTitleNodes.length} total title nodes`);
    
    // List all titles with their hashes
    const titleList = allTitleNodes
      .filter(node => node?.completionRecordHash)
      .map(node => ({
        hash: node.completionRecordHash,
        name: node.displayProperties?.name,
        description: node.displayProperties?.description,
        icon: node.displayProperties?.icon,
        parentNodeHashes: node.parentNodeHashes
      }))
      .sort((a, b) => a.name?.localeCompare(b.name || '') || 0);

    console.log('[TitleService] All available titles:', titleList);
    
    // Check for specific new titles by completion hash
    const newTitleCompletionHashes = [3888842466, 3198225435]; // Edge of Fate, Sharpshooter completion hashes
    for (const hash of newTitleCompletionHashes) {
      const found = titleList.find(t => t.hash === hash);
      if (found) {
        console.log(`[TitleService] ✅ Found new title by completion hash: ${found.name} (${hash})`);
      } else {
        console.log(`[TitleService] ❌ New title not found by completion hash: ${hash}`);
      }
    }

    // Also check by presentation node hash
    const newTitlePresentationHashes = [3588958240, 3417748255]; // Edge of Fate, Sharpshooter presentation hashes
    for (const hash of newTitlePresentationHashes) {
      const found = titleList.find(t => t.hash === hash);
      if (found) {
        console.log(`[TitleService] ✅ Found new title by presentation hash: ${found.name} (${hash})`);
      } else {
        console.log(`[TitleService] ❌ New title not found by presentation hash: ${hash}`);
      }
    }
  }
} 