import { Injectable } from '@angular/core';
import {
  ActivityBreakdownService,
  ActivityCountRow,
  BreakdownMembershipScope,
} from './activity-breakdown.service';
import { ActivityDbService, StoredActivity } from './activity-db.service';
import { DestinyManifestService } from './destiny-manifest.service';
import { ArchiveAccount } from '../models/archive.types';
import {
  D1_RAID_RELEASE_ORDER,
  D2_DUNGEON_RELEASE_ORDER,
  D2_RAID_RELEASE_ORDER,
} from '../config/raid-dungeon-release-order';
import { collectPlayerFirstCompletions } from '../utils/collect-guardian-firsts';
import { getBaseRaidName } from '../utils/base-raid-name';
import { lookupActivityReleaseDate } from '../utils/activity-release-lookup';
import {
  chroniclePgcrUrl,
  completedMark,
  durationExcelSerial,
  idAsText,
  localDateYmd,
  localTimeAmpm,
} from '../utils/chronicle-xlsx';
import { activityDurationSeconds } from '../utils/activity-duration-seconds';

export interface ChronicleXlsxBuildResult {
  buffer: ArrayBuffer;
  activityRows: number;
  elapsedMs: number;
}

type MatrixCol = { key: string; game: 'D1' | 'D2'; baseName: string; header: string };

/**
 * Tiny experiment (ARCHIVE_SPREADSHEET_SPEC): Activities + Raids & Dungeons → Chronicle.xlsx.
 * Built in-browser from already-loaded IndexedDB / archive gather — no extra Bungie calls.
 */
@Injectable({ providedIn: 'root' })
export class ArchiveSpreadsheetService {
  constructor(
    private readonly activityDb: ActivityDbService,
    private readonly breakdown: ActivityBreakdownService,
    private readonly manifest: DestinyManifestService
  ) {}

  async buildChronicleXlsx(
    accounts: ArchiveAccount[],
    activities: StoredActivity[],
    onProgress?: (message: string) => void
  ): Promise<ChronicleXlsxBuildResult> {
    const started = performance.now();
    onProgress?.('Building Chronicle.xlsx (Activities)…');
    const XLSX = await import('xlsx');

    const accountByMid = new Map(accounts.map(a => [a.membershipId, a]));
    const activitySheet = this.buildActivitiesSheet(XLSX, activities, accountByMid);

    onProgress?.('Building Chronicle.xlsx (Raids & Dungeons)…');
    const raidsSheet = await this.buildRaidsDungeonsSheet(XLSX, accounts, activities);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, activitySheet, 'Activities');
    XLSX.utils.book_append_sheet(wb, raidsSheet, 'Raids & Dungeons');

    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const elapsedMs = Math.round(performance.now() - started);
    onProgress?.(`Chronicle.xlsx ready (${activities.length.toLocaleString()} activities, ${elapsedMs} ms)`);
    return { buffer, activityRows: activities.length, elapsedMs };
  }

  private buildActivitiesSheet(
    XLSX: typeof import('xlsx'),
    activities: StoredActivity[],
    accountByMid: Map<string, ArchiveAccount>
  ) {
    const visibleHeaders = [
      'Date',
      'Time',
      'Game',
      'Player',
      'Platform',
      'Activity',
      'Mode/Type',
      'Duration',
      'Kills',
      'Deaths',
      'Assists',
      'Completed',
      'Report',
    ];
    const hiddenHeaders = ['InstanceId', 'ActivityHash', 'MembershipId', 'CharacterId'];
    const headers = [...visibleHeaders, ...hiddenHeaders];

    const sorted = [...activities].sort((a, b) => {
      const ta = a.period ? new Date(a.period).getTime() : 0;
      const tb = b.period ? new Date(b.period).getTime() : 0;
      return tb - ta;
    });

    const rows: unknown[][] = [headers];
    for (const activity of sorted) {
      const game = (activity.game || accountByMid.get(activity.membershipId || '')?.game || 'D2') as
        | 'D1'
        | 'D2';
      const isD1 = game === 'D1';
      const refId = activity.activityDetails?.referenceId;
      const instanceId = activity.activityDetails?.instanceId;
      const mode = activity.activityDetails?.mode;
      const account = accountByMid.get(activity.membershipId || '');
      const name =
        this.manifest.getActivityName(refId as any, isD1) ||
        (refId != null ? `Unknown activity (${refId})` : 'Unknown activity');
      const type = this.manifest.getActivityType(refId as any, mode, isD1) || String(mode ?? '');
      const seconds = activityDurationSeconds(activity);
      const reportUrl = chroniclePgcrUrl(instanceId, game);
      const reportLabel = instanceId != null && instanceId !== '' ? String(instanceId) : '';

      rows.push([
        localDateYmd(activity.period),
        localTimeAmpm(activity.period),
        game,
        account?.displayName || '',
        account?.platform || '',
        name,
        type,
        durationExcelSerial(seconds),
        activity.values?.kills?.basic?.value ?? '',
        activity.values?.deaths?.basic?.value ?? '',
        activity.values?.assists?.basic?.value ?? '',
        completedMark(activity.values?.completed?.basic?.value),
        reportLabel,
        idAsText(instanceId),
        idAsText(refId),
        idAsText(activity.membershipId),
        idAsText(activity.characterId),
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const lastRow = rows.length;
    const lastCol = headers.length - 1;

    // Duration column (H) as Excel time
    for (let r = 2; r <= lastRow; r++) {
      const addr = XLSX.utils.encode_cell({ r: r - 1, c: 7 });
      const cell = ws[addr];
      if (cell && typeof cell.v === 'number') {
        cell.t = 'n';
        cell.z = '[h]:mm';
      }
    }

    // Report HYPERLINK (column M = index 12)
    for (let r = 2; r <= lastRow; r++) {
      const activity = sorted[r - 2];
      const game = (activity.game || 'D2') as string;
      const url = chroniclePgcrUrl(activity.activityDetails?.instanceId, game);
      if (!url) continue;
      const addr = XLSX.utils.encode_cell({ r: r - 1, c: 12 });
      const label = String(activity.activityDetails?.instanceId ?? 'Report');
      ws[addr] = {
        t: 's',
        v: label,
        l: { Target: url, Tooltip: 'Post Game Carnage Report' },
      };
    }

    // Force ID columns to text
    for (const c of [13, 14, 15, 16]) {
      for (let r = 2; r <= lastRow; r++) {
        const addr = XLSX.utils.encode_cell({ r: r - 1, c });
        const cell = ws[addr];
        if (cell && cell.v != null && cell.v !== '') {
          cell.t = 's';
          cell.v = String(cell.v);
        }
      }
    }

    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: lastRow - 1, c: lastCol },
      }),
    };
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    ws['!cols'] = headers.map((h, i) => {
      if (i >= visibleHeaders.length) return { hidden: true, wch: 14 };
      const widths: Record<string, number> = {
        Date: 12,
        Time: 12,
        Game: 6,
        Player: 16,
        Platform: 12,
        Activity: 28,
        'Mode/Type': 14,
        Duration: 10,
        Kills: 8,
        Deaths: 8,
        Assists: 8,
        Completed: 10,
        Report: 14,
      };
      return { wch: widths[h] ?? 12 };
    });

    return ws;
  }

  private async buildRaidsDungeonsSheet(
    XLSX: typeof import('xlsx'),
    accounts: ArchiveAccount[],
    activities: StoredActivity[]
  ) {
    const columns = this.matrixColumns();
    const scopes: BreakdownMembershipScope[] = accounts.map(a => ({
      membershipId: a.membershipId,
      game: a.game,
    }));
    // Cover both games when an account id is shared / mistagged.
    const midSeen = new Set<string>();
    const dualScopes: BreakdownMembershipScope[] = [];
    for (const a of accounts) {
      if (midSeen.has(a.membershipId)) continue;
      midSeen.add(a.membershipId);
      dualScopes.push({ membershipId: a.membershipId, game: 'D1' });
      dualScopes.push({ membershipId: a.membershipId, game: 'D2' });
    }
    const countScopes = dualScopes.length ? dualScopes : scopes;
    const counts = await this.breakdown.getActivityCountsForScopes(countScopes);
    const statsByKey = this.aggregateRaidDungeonStats(counts);
    const firstByKey = await this.firstClearsByKey(accounts, activities);

    const header = ['Metric', ...columns.map(c => c.header)];
    const releaseRow: unknown[] = ['Release Date'];
    const firstRow: unknown[] = ['First Clear'];
    const clearsRow: unknown[] = ['Clears'];
    const runsRow: unknown[] = ['Runs'];
    const timeRow: unknown[] = ['Time'];

    const firstClearUrls: (string | null)[] = [];

    for (const col of columns) {
      const stats = this.lookupByColumn(statsByKey, col) || { clears: 0, runs: 0, timeSeconds: 0 };
      const first = this.lookupByColumn(firstByKey, col);
      releaseRow.push(lookupActivityReleaseDate(col.baseName, col.game) || '');
      if (first?.date) {
        firstRow.push(first.date);
        firstClearUrls.push(first.url || null);
      } else {
        firstRow.push('');
        firstClearUrls.push(null);
      }
      clearsRow.push(stats.clears || '');
      runsRow.push(stats.runs || '');
      timeRow.push(durationExcelSerial(stats.timeSeconds));
    }

    const aoa = [header, releaseRow, firstRow, clearsRow, runsRow, timeRow];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // First Clear hyperlinks (row index 2)
    for (let c = 0; c < columns.length; c++) {
      const url = firstClearUrls[c];
      if (!url) continue;
      const addr = XLSX.utils.encode_cell({ r: 2, c: c + 1 });
      const cell = ws[addr];
      if (cell) {
        cell.l = { Target: url, Tooltip: 'First clear report' };
      }
    }

    // Time row format
    for (let c = 1; c <= columns.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: 5, c });
      const cell = ws[addr];
      if (cell && typeof cell.v === 'number') {
        cell.t = 'n';
        cell.z = '[h]:mm';
      }
    }

    ws['!freeze'] = { xSplit: 1, ySplit: 1 };
    ws['!cols'] = [{ wch: 14 }, ...columns.map(() => ({ wch: 16 }))];
    return ws;
  }

  private matrixColumns(): MatrixCol[] {
    const cols: MatrixCol[] = [];
    for (const baseName of D1_RAID_RELEASE_ORDER) {
      cols.push({
        key: `D1|${baseName}`,
        game: 'D1',
        baseName,
        header: `D1 · ${baseName}`,
      });
    }
    for (const baseName of D2_RAID_RELEASE_ORDER) {
      cols.push({
        key: `D2|${baseName}`,
        game: 'D2',
        baseName,
        header: `D2 · ${baseName}`,
      });
    }
    for (const baseName of D2_DUNGEON_RELEASE_ORDER) {
      cols.push({
        key: `D2|${baseName}`,
        game: 'D2',
        baseName,
        header: `D2 · ${baseName}`,
      });
    }
    return cols;
  }

  private aggregateRaidDungeonStats(
    rows: ActivityCountRow[]
  ): Map<string, { clears: number; runs: number; timeSeconds: number }> {
    const out = new Map<string, { clears: number; runs: number; timeSeconds: number }>();
    for (const row of rows) {
      if (!this.isRaidOrDungeonRow(row)) continue;
      const baseName = getBaseRaidName(row.baseName || '', row.game) || row.baseName;
      const key = `${row.game}|${baseName}`;
      const existing = out.get(key) || { clears: 0, runs: 0, timeSeconds: 0 };
      existing.clears += row.clears || 0;
      existing.runs += row.runs || 0;
      existing.timeSeconds += row.timeSeconds || 0;
      out.set(key, existing);
    }
    return out;
  }

  private isRaidOrDungeonRow(row: ActivityCountRow): boolean {
    if (row.mode === 4) return true;
    if (row.game === 'D2' && row.mode === 82) return true;
    const typed = this.manifest.getActivityType(row.referenceId, row.mode, row.game === 'D1');
    return typed === 'raid' || typed === 'dungeon';
  }

  /** Match release-order columns to stats/firsts keys when "The Shattered Throne" ↔ "Shattered Throne". */
  private lookupByColumn<T>(map: Map<string, T>, col: MatrixCol): T | undefined {
    const direct = map.get(col.key);
    if (direct) return direct;
    const normalized = `${col.game}|${getBaseRaidName(col.baseName, col.game)}`;
    if (normalized !== col.key) {
      const hit = map.get(normalized);
      if (hit) return hit;
    }
    const want = getBaseRaidName(col.baseName, col.game).toLowerCase();
    for (const [key, value] of map) {
      if (!key.startsWith(`${col.game}|`)) continue;
      const name = key.slice(col.game.length + 1);
      if (getBaseRaidName(name, col.game).toLowerCase() === want) return value;
      if (name.toLowerCase() === col.baseName.toLowerCase()) return value;
    }
    return undefined;
  }

  private async firstClearsByKey(
    accounts: ArchiveAccount[],
    activities: StoredActivity[]
  ): Promise<Map<string, { date: string; url: string }>> {
    const out = new Map<string, { date: string; url: string; ts: number }>();

    const byMembership = new Map<string, Set<string>>();
    for (const a of activities) {
      if (!a.membershipId || !a.characterId) continue;
      if (!byMembership.has(a.membershipId)) byMembership.set(a.membershipId, new Set());
      byMembership.get(a.membershipId)!.add(a.characterId);
    }

    for (const account of accounts) {
      const characterIds = [...(byMembership.get(account.membershipId) || [])];
      if (!characterIds.length) continue;
      const firsts = await collectPlayerFirstCompletions(this.activityDb, {
        membershipId: account.membershipId,
        characterIds,
        game: account.game,
        includeD1MembershipStoryFirsts: account.game === 'D1',
        requireCompleted: true,
      });
      for (const first of firsts) {
        if (first.type !== 'raid' && first.type !== 'dungeon') continue;
        const game = (first.game || account.game) as 'D1' | 'D2';
        const baseName = getBaseRaidName(first.name || '', game) || first.name;
        const key = `${game}|${baseName}`;
        const ts = first.completionDate ? new Date(first.completionDate).getTime() : NaN;
        if (!Number.isFinite(ts)) continue;
        const prev = out.get(key);
        if (prev && prev.ts <= ts) continue;
        out.set(key, {
          date: localDateYmd(first.completionDate),
          url: chroniclePgcrUrl(first.instanceId, game),
          ts,
        });
      }
    }

    const slim = new Map<string, { date: string; url: string }>();
    for (const [k, v] of out) {
      slim.set(k, { date: v.date, url: v.url });
    }
    return slim;
  }
}
