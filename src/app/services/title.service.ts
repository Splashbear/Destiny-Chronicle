import { Injectable } from '@angular/core';
import { BungieApiService } from './bungie-api.service';
import { DestinyManifestService } from './destiny-manifest.service';
import { AssetUrlService } from './asset-url.service';
import { ArchiveRuntimeService } from './archive-runtime.service';
import { firstValueFrom } from 'rxjs';
import {
  GILDED_SEAL_IMAGE_MAP,
  SPECIAL_TITLES,
  normalizeTitleName,
  titleReleaseRank,
} from '../config/title-release-order';

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
  progressPercent?: number;
  missingRecord?: boolean;
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
  constructor(
    private bungie: BungieApiService,
    private manifest: DestinyManifestService,
    private assetUrl: AssetUrlService,
    private archiveRuntime: ArchiveRuntimeService
  ) {}

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
    if (this.archiveRuntime.isReadOnly) {
      return this.getOfflineTitles(player);
    }
    // Load manifest if not yet ready
    if (!this.manifest.isLoadedSync) {
      await this.manifest.isLoaded().toPromise();
    }

    const presentationNodes = this.manifest.getPresentationNodes();

    // Shared title ranking / special names (CODE_CLEANUP_SPEC config/title-release-order)

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
      const missingRecord = !record;

      let progressPercent: number | undefined;
      const objectives = record?.objectives as Array<{
        complete?: boolean;
        visible?: boolean;
        completionValue?: number;
        progress?: number;
      }> | undefined;
      if (!completed && Array.isArray(objectives) && objectives.length) {
        let total = 0;
        let done = 0;
        for (const obj of objectives) {
          if (obj?.visible === false) continue;
          const target = obj.completionValue ?? 1;
          total += target;
          done += Math.min(obj.progress ?? (obj.complete ? target : 0), target);
        }
        if (total > 0) {
          progressPercent = Math.round((done / total) * 100);
        }
      }

      // gilding
      let isGilded = false;
      let timesGilded = 0;
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
        }
      }

      // Icon: prefer local gilded seal assets (host parity), else Bungie iconSequences, else base
      const baseIcon = node.displayProperties?.icon ? this.assetUrl.resolve(node.displayProperties.icon) : null;
      const localGilded = isGilded ? GILDED_SEAL_IMAGE_MAP[normalizedName] : undefined;
      const gildedIconFrames = node.iconSequences && node.iconSequences[0]?.frames;
      const sequenceGilded = (gildedIconFrames && gildedIconFrames.length)
        ? this.assetUrl.resolve(gildedIconFrames[gildedIconFrames.length - 1])
        : null;
      const gildedIcon = localGilded || sequenceGilded || undefined;

      const uniqueKey = `${displayName}#${node.completionRecordHash}`;
      if (!titleMap[uniqueKey]) {
        titleMap[uniqueKey] = {
          hash: node.completionRecordHash,
          name: displayName,
          icon: (isGilded && gildedIcon) ? gildedIcon : baseIcon,
          gildedIcon: gildedIcon,
          completed,
          isGilded,
          timesGilded: (completed && timesGilded > 0) ? timesGilded : undefined,
          locked: !completed,
          altIcon: (() => {
            const frames = node.iconSequences && node.iconSequences[1]?.frames;
            return frames && frames.length ? this.assetUrl.resolve(frames[frames.length - 1]) : undefined;
          })(),
          legacy: (node.parentNodeHashes || []).includes(1881970629),
          releaseRank: titleReleaseRank(node.completionRecordHash, normalizedName),
          normalized: normalizedName,
          progressPercent,
          missingRecord,
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
            existing.completed = true;
            existing.locked = false;
            existing.progressPercent = undefined;
            existing.missingRecord = false;
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

  private getOfflineTitles(player: PlayerIdentityMin): TitleItem[] {
    try {
      const raw = localStorage.getItem('destinyChronicle.titlesSnapshot');
      if (!raw) {
        return [];
      }
      const map = JSON.parse(raw) as Record<string, TitleItem[]>;
      const key = `${player.game}|${player.membershipType}|${player.membershipId}`;
      return map[key] ?? [];
    } catch {
      return [];
    }
  }
} 