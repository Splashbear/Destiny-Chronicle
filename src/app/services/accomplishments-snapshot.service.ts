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
  displayName?: string;
  platform?: string;
}

export type SnapshotDownloadFormat = 'xlsx' | 'txt' | 'json';

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
   * Build snapshot, persist lean JSON to localStorage (and archive),
   * and download a human-readable Excel (default) or text file.
   */
  async saveSnapshot(
    players: SnapshotPlayerRef[],
    options: { download?: boolean; format?: SnapshotDownloadFormat } = {}
  ): Promise<AccomplishmentsSnapshot> {
    const download = options.download !== false;
    const format: SnapshotDownloadFormat = options.format || 'xlsx';
    const accounts: AccomplishmentsSnapshotAccount[] = [];
    const rows = await this.buildReadableRows(players);

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

    if (download) {
      const stamp = snapshot.savedAt.slice(0, 10);
      if (format === 'xlsx') {
        await this.downloadExcel(rows, stamp);
      } else if (format === 'txt') {
        this.downloadText(rows, stamp);
      } else {
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
        saveAs(blob, `destiny-chronicle-accomplishments-${stamp}.json`);
      }
    }

    return snapshot;
  }

  /** For archive zip — lean IDs/counts only (no download). */
  async buildForArchive(players: SnapshotPlayerRef[]): Promise<AccomplishmentsSnapshot> {
    return this.saveSnapshot(players, { download: false });
  }

  private async buildReadableRows(players: SnapshotPlayerRef[]): Promise<SnapshotRow[]> {
    const rows: SnapshotRow[] = [];
    for (const p of players) {
      const label = p.displayName || p.membershipId;
      const platform = p.platform || String(p.membershipType);
      if (p.game === 'D1') {
        const [books, medals] = await Promise.all([
          this.d1.loadRecordBooks(p.membershipType, p.membershipId),
          this.d1.loadMedals(p.membershipType, p.membershipId),
        ]);
        if (medals.status === 'ok') {
          for (const g of medals.groups) {
            for (const m of g.medals) {
              rows.push({
                account: label,
                platform,
                game: 'D1',
                section: 'Medals',
                mode: g.id,
                subtype: m.subtype,
                name: m.name,
                description: m.description,
                detail: String(m.count),
              });
            }
          }
        }
        if (books.status === 'ok') {
          for (const b of books.books) {
            rows.push({
              account: label,
              platform,
              game: 'D1',
              section: 'Record Books',
              mode: '',
              subtype: '',
              name: b.name,
              description: '',
              detail: `${b.completed}/${b.total}`,
            });
            for (const r of b.completedRecords) {
              rows.push({
                account: label,
                platform,
                game: 'D1',
                section: 'Record Books',
                mode: b.name,
                subtype: 'Completed record',
                name: r.name,
                description: '',
                detail: 'complete',
              });
            }
          }
        }
      } else {
        const [medals, cols, seals] = await Promise.all([
          this.medals.loadAccountMedals(p.membershipType, p.membershipId),
          this.collections.loadAccountCollections(p.membershipType, p.membershipId),
          this.seals.loadAccountSealTriumphs(p.membershipType, p.membershipId),
        ]);
        if (medals.status === 'ok') {
          for (const g of medals.groups) {
            for (const m of g.medals) {
              if (m.count <= 0) continue;
              rows.push({
                account: label,
                platform,
                game: 'D2',
                section: 'Medals',
                mode: g.id,
                subtype: m.subtype,
                name: m.name,
                description: m.description,
                detail: String(m.count),
              });
            }
          }
        }
        if (cols.status === 'ok') {
          for (const b of cols.badges) {
            rows.push({
              account: label,
              platform,
              game: 'D2',
              section: 'Badges',
              mode: '',
              subtype: b.complete ? 'Complete' : 'In progress',
              name: b.name,
              description: '',
              detail: `${b.acquired}/${b.total}`,
            });
          }
          for (const e of cols.emblems) {
            rows.push({
              account: label,
              platform,
              game: 'D2',
              section: 'Emblems',
              mode: '',
              subtype: 'Owned',
              name: e.name,
              description: '',
              detail: 'owned',
            });
          }
        }
        if (seals.status === 'ok') {
          for (const s of seals.seals) {
            for (const t of s.triumphs) {
              rows.push({
                account: label,
                platform,
                game: 'D2',
                section: 'Seal Triumphs',
                mode: s.name,
                subtype: s.legacy ? 'Legacy' : 'Current',
                name: t.name,
                description: t.description,
                detail: 'complete',
              });
            }
          }
        }
      }
    }
    return rows;
  }

  private async downloadExcel(rows: SnapshotRow[], stamp: string): Promise<void> {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const sheetRows = rows.map((r) => ({
      Account: r.account,
      Platform: r.platform,
      Game: r.game,
      Section: r.section,
      Mode: r.mode,
      Subtype: r.subtype,
      Name: r.name,
      Description: r.description,
      Detail: r.detail,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows.length ? sheetRows : [{ Account: '', Name: '(empty)' }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Accomplishments');
    XLSX.writeFile(wb, `destiny-chronicle-accomplishments-${stamp}.xlsx`);
  }

  private downloadText(rows: SnapshotRow[], stamp: string): void {
    const lines: string[] = [`Destiny Chronicle Accomplishments — ${stamp}`, ''];
    let lastKey = '';
    for (const r of rows) {
      const key = `${r.account}|${r.section}|${r.mode}|${r.subtype}`;
      if (key !== lastKey) {
        lines.push('');
        const header = [r.account, r.game, r.section, r.mode, r.subtype].filter(Boolean).join(' · ');
        lines.push(header);
        lastKey = key;
      }
      const desc = r.description ? ` — ${r.description}` : '';
      lines.push(`  ${r.name}${desc} · ${r.detail}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `destiny-chronicle-accomplishments-${stamp}.txt`);
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
        for (const m of g.medals) {
          if (m.count > 0) medalMap[m.statId] = m.count;
        }
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

interface SnapshotRow {
  account: string;
  platform: string;
  game: 'D1' | 'D2';
  section: string;
  mode: string;
  subtype: string;
  name: string;
  description: string;
  detail: string;
}
