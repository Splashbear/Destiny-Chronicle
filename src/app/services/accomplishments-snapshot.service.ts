import { Injectable, inject } from '@angular/core';
import { saveAs } from 'file-saver';
import {
  AccomplishmentsSnapshot,
  AccomplishmentsSnapshotAccount,
} from '../models/accomplishments-d1.model';
import { AccomplishmentsMedalsService } from './accomplishments-medals.service';
import { AccomplishmentsCollectionsService } from './accomplishments-collections.service';
import { AccomplishmentsSealTriumphsService } from './accomplishments-seal-triumphs.service';
import { AccomplishmentsD1Service } from './accomplishments-d1.service';

const STORAGE_KEY = 'destinyChronicle.accomplishmentsSnapshot';

export interface SnapshotPlayerRef {
  membershipId: string;
  membershipType: number;
  game: 'D1' | 'D2';
}

@Injectable({ providedIn: 'root' })
export class AccomplishmentsSnapshotService {
  private readonly medals = inject(AccomplishmentsMedalsService);
  private readonly collections = inject(AccomplishmentsCollectionsService);
  private readonly seals = inject(AccomplishmentsSealTriumphsService);
  private readonly d1 = inject(AccomplishmentsD1Service);

  getLatest(): AccomplishmentsSnapshot | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AccomplishmentsSnapshot;
    } catch {
      return null;
    }
  }

  /**
   * Build a lean IDs/counts snapshot for the given accounts, persist latest to
   * localStorage, and optionally download a dated JSON file.
   */
  async saveSnapshot(
    players: SnapshotPlayerRef[],
    options: { download?: boolean } = { download: true }
  ): Promise<AccomplishmentsSnapshot> {
    const accounts: AccomplishmentsSnapshotAccount[] = [];

    for (const p of players) {
      if (p.game === 'D1') {
        accounts.push(await this.snapshotD1(p));
      } else {
        accounts.push(await this.snapshotD2(p));
      }
    }

    const snapshot: AccomplishmentsSnapshot = {
      savedAt: new Date().toISOString(),
      accounts,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));

    if (options.download !== false) {
      const stamp = snapshot.savedAt.slice(0, 10);
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      saveAs(blob, `destiny-chronicle-accomplishments-${stamp}.json`);
    }

    return snapshot;
  }

  /** For archive zip — same lean shape as Save snapshot. */
  async buildForArchive(players: SnapshotPlayerRef[]): Promise<AccomplishmentsSnapshot> {
    return this.saveSnapshot(players, { download: false });
  }

  private async snapshotD2(p: SnapshotPlayerRef): Promise<AccomplishmentsSnapshotAccount> {
    const [medals, cols, seals] = await Promise.all([
      this.medals.loadAccountMedals(p.membershipType, p.membershipId),
      this.collections.loadAccountCollections(p.membershipType, p.membershipId),
      this.seals.loadAccountSealTriumphs(p.membershipType, p.membershipId),
    ]);

    const medalMap: Record<string, number> = {};
    if (medals.status === 'ok') {
      for (const g of medals.groups) {
        for (const m of g.medals) medalMap[m.statId] = m.count;
      }
    }

    const badges: Record<string, { acquired: number; total: number }> = {};
    const emblems: string[] = [];
    if (cols.status === 'ok') {
      for (const b of cols.badges) badges[b.hash] = { acquired: b.acquired, total: b.total };
      for (const e of cols.emblems) emblems.push(e.hash);
    }

    const completedSeals: string[] = [];
    if (seals.status === 'ok') {
      for (const s of seals.seals) completedSeals.push(s.hash);
    }

    return {
      membershipId: p.membershipId,
      membershipType: p.membershipType,
      game: 'D2',
      medals: medalMap,
      badges,
      emblems,
      completedSeals,
    };
  }

  private async snapshotD1(p: SnapshotPlayerRef): Promise<AccomplishmentsSnapshotAccount> {
    const [books, medals] = await Promise.all([
      this.d1.loadRecordBooks(p.membershipType, p.membershipId),
      this.d1.loadMedals(p.membershipType, p.membershipId),
    ]);

    const d1RecordBooks: Record<string, { completed: number; total: number }> = {};
    if (books.status === 'ok') {
      for (const b of books.books) {
        d1RecordBooks[b.hash] = { completed: b.completed, total: b.total };
      }
    }

    const d1Medals: Record<string, number> = {};
    if (medals.status === 'ok') {
      for (const g of medals.groups) {
        for (const m of g.medals) d1Medals[m.statId] = m.count;
      }
    }

    return {
      membershipId: p.membershipId,
      membershipType: p.membershipType,
      game: 'D1',
      d1RecordBooks,
      d1Medals,
    };
  }
}
