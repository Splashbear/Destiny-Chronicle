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

    const RELEASE_ORDER: { [n: string]: number } = {
      /* normalized name → rank (higher = newer) */
      "destinations": 1 // placeholder, real list should be copied
    };

    const GILDED_SEAL_IMAGE_MAP: { [title: string]: string } = {
      "conqueror": "/assets/gilded-seals/Conqueror-Gilded.png",
      "flawless": "/assets/gilded-seals/Flawless-Gilded.png",
      "deadeye": "/assets/gilded-seals/Deadeye-Gilded.png"
    };

    const normalizeTitleName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

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
          releaseRank: RELEASE_ORDER[normalizedName] || 0,
          normalized: normalizedName,
        } as TitleItem;
      }
    }

    const all = Object.values(titleMap) as TitleItem[];
    const completedList = all.filter(t => t.completed).sort((a,b)=>a.name.localeCompare(b.name));
    const lockedList    = all.filter(t => !t.completed).sort((a,b)=>a.name.localeCompare(b.name));
    return [...completedList, ...lockedList];
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

    return Array.from(aggMap.values()).sort((a,b)=>a.name.localeCompare(b.name));
  }
} 