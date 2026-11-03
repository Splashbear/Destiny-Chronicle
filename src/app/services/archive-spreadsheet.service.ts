import { Injectable } from '@angular/core';
import {
  ActivityBreakdownService,
  ActivityCountRow,
  BreakdownMembershipScope,
} from './activity-breakdown.service';
import { ActivityDbService, StoredActivity } from './activity-db.service';
import { DestinyManifestService } from './destiny-manifest.service';
import { TitleItem } from './title.service';
import { ArchiveAccount, ArchiveTitlesSnapshot } from '../models/archive.types';
import {
  D1_RAID_RELEASE_ORDER,
  D2_DUNGEON_RELEASE_ORDER,
  D2_RAID_RELEASE_ORDER,
} from '../config/raid-dungeon-release-order';
import { collectPlayerFirstCompletions } from '../utils/collect-guardian-firsts';
import { getBaseRaidName } from '../utils/base-raid-name';
import { baseActivityNameFromVersioned } from '../utils/date-activity-grouping';
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
import {
  findDuplicateSummaryTotals,
  isValidCalendarMonthDay,
  latestLocalActivityDate,
  onThisDayCountGrid,
  summarizeActivitiesForAccount,
} from '../utils/chronicle-xlsx-summary';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { canonicalAccountKey } from '../utils/account-key';

export interface ChronicleXlsxBuildResult {
  buffer: ArrayBuffer;
  activityRows: number;
  elapsedMs: number;
}

export interface ChronicleXlsxInput {
  accounts: ArchiveAccount[];
  activities: StoredActivity[];
  titlesSnapshot?: ArchiveTitlesSnapshot;
  frozenAt?: string;
  onProgress?: (message: string) => void;
}

type MatrixCol = { key: string; game: 'D1' | 'D2'; baseName: string; header: string };
type XlsxMod = typeof import('xlsx');

/**
 * Chronicle.xlsx for Share & Archive (ARCHIVE_SPREADSHEET_SPEC).
 * Built in-browser from gathered archive data — no extra Bungie calls.
 */
@Injectable({ providedIn: 'root' })
export class ArchiveSpreadsheetService {
  constructor(
    private readonly activityDb: ActivityDbService,
    private readonly breakdown: ActivityBreakdownService,
    private readonly manifest: DestinyManifestService
  ) {}

  async buildChronicleXlsx(input: ChronicleXlsxInput): Promise<ChronicleXlsxBuildResult> {
    const { accounts, activities, titlesSnapshot = {}, frozenAt, onProgress } = input;
    const started = performance.now();
    const XLSX = await import('xlsx');
    const accountByMid = new Map(accounts.map(a => [a.membershipId, a]));
    const charsByMid = this.characterIdsByMembership(activities);

    onProgress?.('Building Chronicle.xlsx (Summary)…');
    const firstsByAccount = await this.collectAllFirsts(accounts, charsByMid);
    const summarySheet = this.buildSummarySheet(
      XLSX,
      accounts,
      activities,
      titlesSnapshot,
      firstsByAccount
    );

    onProgress?.('Building Chronicle.xlsx (Start Here)…');
    const startSheet = this.buildStartHereSheet(XLSX, accounts, activities, frozenAt);

    onProgress?.('Building Chronicle.xlsx (Activities)…');
    const activitySheet = this.buildActivitiesSheet(XLSX, activities, accountByMid);

    onProgress?.('Building Chronicle.xlsx (Firsts)…');
    const firstsSheet = this.buildFirstsSheet(XLSX, accounts, firstsByAccount);

    onProgress?.('Building Chronicle.xlsx (Raids & Dungeons)…');
    const raidsSheet = await this.buildRaidsDungeonsSheet(XLSX, accounts, activities, firstsByAccount);

    onProgress?.('Building Chronicle.xlsx (Breakdown)…');
    const breakdownSheet = await this.buildBreakdownSheet(XLSX, accounts);

    onProgress?.('Building Chronicle.xlsx (Seals)…');
    const sealsSheet = this.buildSealsSheet(XLSX, accounts, titlesSnapshot);

    onProgress?.('Building Chronicle.xlsx (On This Day)…');
    const otdSheet = this.buildOnThisDaySheet(XLSX, activities);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, startSheet, 'Start Here');
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
    XLSX.utils.book_append_sheet(wb, activitySheet, 'Activities');
    XLSX.utils.book_append_sheet(wb, firstsSheet, 'Firsts');
    XLSX.utils.book_append_sheet(wb, raidsSheet, 'Raids & Dungeons');
    XLSX.utils.book_append_sheet(wb, breakdownSheet, 'Breakdown');
    XLSX.utils.book_append_sheet(wb, sealsSheet, 'Seals');
    XLSX.utils.book_append_sheet(wb, otdSheet, 'On This Day');

    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const elapsedMs = Math.round(performance.now() - started);
    onProgress?.(
      `Chronicle.xlsx ready (${activities.length.toLocaleString()} activities, ${elapsedMs} ms)`
    );
    return { buffer, activityRows: activities.length, elapsedMs };
  }

  private characterIdsByMembership(activities: StoredActivity[]): Map<string, Set<string>> {
    const byMembership = new Map<string, Set<string>>();
    for (const a of activities) {
      if (!a.membershipId || !a.characterId) continue;
      if (!byMembership.has(a.membershipId)) byMembership.set(a.membershipId, new Set());
      byMembership.get(a.membershipId)!.add(a.characterId);
    }
    return byMembership;
  }

  private accountKey(acct: ArchiveAccount): string {
    return canonicalAccountKey(acct);
  }

  private async collectAllFirsts(
    accounts: ArchiveAccount[],
    charsByMid: Map<string, Set<string>>
  ): Promise<Map<string, ActivityFirstCompletion[]>> {
    const out = new Map<string, ActivityFirstCompletion[]>();
    for (const account of accounts) {
      const characterIds = [...(charsByMid.get(account.membershipId) || [])];
      if (!characterIds.length) {
        out.set(this.accountKey(account), []);
        continue;
      }
      const firsts = await collectPlayerFirstCompletions(this.activityDb, {
        membershipId: account.membershipId,
        characterIds,
        game: account.game,
        includeD1MembershipStoryFirsts: account.game === 'D1',
        requireCompleted: true,
      });
      out.set(this.accountKey(account), firsts);
    }
    return out;
  }

  private titlesForAccount(
    snapshot: ArchiveTitlesSnapshot,
    account: ArchiveAccount
  ): TitleItem[] {
    const key = this.accountKey(account);
    const raw = snapshot[key];
    return Array.isArray(raw) ? (raw as TitleItem[]) : [];
  }

  private buildStartHereSheet(
    XLSX: XlsxMod,
    accounts: ArchiveAccount[],
    activities: StoredActivity[],
    frozenAt?: string
  ) {
    const through = latestLocalActivityDate(activities);
    const generated = frozenAt
      ? `${localDateYmd(frozenAt)} ${localTimeAmpm(frozenAt)}`
      : `${localDateYmd(new Date().toISOString())} ${localTimeAmpm(new Date().toISOString())}`;
    const unknownCount = activities.filter(a => {
      const game = (a.game || 'D2') as 'D1' | 'D2';
      const name = this.manifest.getActivityName(a.activityDetails?.referenceId as any, game === 'D1');
      return !name || name === 'Unknown Activity' || name.startsWith('Unknown');
    }).length;

    const rows: unknown[][] = [
      ['Destiny Chronicle — Chronicle.xlsx'],
      ['Generated (local)', generated],
      ['Archive through (latest activity, local)', through || '(none)'],
      ['Activity rows included', activities.length],
      [],
      ['Accounts in this archive'],
      ['Game', 'Platform', 'Bungie name', 'Membership ID'],
    ];
    for (const a of accounts) {
      rows.push([a.game, a.platform, a.displayName, idAsText(a.membershipId)]);
    }
    rows.push([]);
    rows.push(['Not included / notes']);
    rows.push([
      'Games after the archive-through date that have not been synced yet are not in this file.',
    ]);
    rows.push([
      unknownCount
        ? `${unknownCount} activities resolved as Unknown activity (hash kept on Activities tab).`
        : 'No unknown-activity hashes detected at build time.',
    ]);
    rows.push(['Earn dates for seals are not invented — use Seals “My notes” columns if you track them.']);
    rows.push([]);
    rows.push(['Tab legend']);
    rows.push(['Start Here', 'This overview']);
    rows.push(['Summary', 'Per-account totals (game + membership); D1/D2/grand totals']);
    rows.push(['Activities', 'Every game, newest first']);
    rows.push(['Firsts', 'Guardian Firsts completions']);
    rows.push(['Raids & Dungeons', 'Release-order matrix: first clear, clears, runs, time']);
    rows.push(['Breakdown', 'Grouped activity stats (Trials separate, still in PvP)']);
    rows.push(['Seals', 'Bungie titles/seals + blank user note columns']);
    rows.push(['On This Day', 'Local month×day activity counts']);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 42 }, { wch: 18 }, { wch: 22 }, { wch: 22 }];
    // Membership IDs as text
    for (let r = 7; r < 7 + accounts.length; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: 3 });
      const cell = ws[addr];
      if (cell) {
        cell.t = 's';
        cell.v = String(cell.v ?? '');
      }
    }
    return ws;
  }

  private buildSummarySheet(
    XLSX: XlsxMod,
    accounts: ArchiveAccount[],
    activities: StoredActivity[],
    titlesSnapshot: ArchiveTitlesSnapshot,
    firstsByAccount: Map<string, ActivityFirstCompletion[]>
  ) {
    const headers = [
      'Game',
      'Platform',
      'Player',
      'Membership ID',
      'Time in activities',
      'Activities',
      'Completions',
      'Seals',
      'Firsts',
    ];
    const rows: unknown[][] = [headers];
    const fingerprints: Array<
      {
        key: string;
        timeInActivitiesSeconds: number;
        activities: number;
        completions: number;
        seals: number;
        firsts: number;
      }
    > = [];

    let d1Time = 0,
      d1Acts = 0,
      d1Comp = 0,
      d1Seals = 0,
      d1Firsts = 0;
    let d2Time = 0,
      d2Acts = 0,
      d2Comp = 0,
      d2Seals = 0,
      d2Firsts = 0;

    for (const account of accounts) {
      const key = this.accountKey(account);
      const totals = summarizeActivitiesForAccount(activities, account.membershipId, account.game);
      const seals = this.titlesForAccount(titlesSnapshot, account).filter(t => t.completed).length;
      const firsts = (firstsByAccount.get(key) || []).length;
      fingerprints.push({
        key,
        timeInActivitiesSeconds: totals.timeInActivitiesSeconds,
        activities: totals.activities,
        completions: totals.completions,
        seals,
        firsts,
      });
      rows.push([
        account.game,
        account.platform,
        account.displayName,
        idAsText(account.membershipId),
        durationExcelSerial(totals.timeInActivitiesSeconds),
        totals.activities,
        totals.completions,
        seals,
        firsts,
      ]);
      if (account.game === 'D1') {
        d1Time += totals.timeInActivitiesSeconds;
        d1Acts += totals.activities;
        d1Comp += totals.completions;
        d1Seals += seals;
        d1Firsts += firsts;
      } else {
        d2Time += totals.timeInActivitiesSeconds;
        d2Acts += totals.activities;
        d2Comp += totals.completions;
        d2Seals += seals;
        d2Firsts += firsts;
      }
    }

    const dup = findDuplicateSummaryTotals(fingerprints);
    if (dup) {
      throw new Error(
        `[Chronicle.xlsx] Duplicate Summary totals for ${dup[0]} and ${dup[1]} — refusing to export (likely D1/D2 mix-up).`
      );
    }

    rows.push([]);
    rows.push([
      'D1 total (combined)',
      '',
      '',
      '',
      durationExcelSerial(d1Time),
      d1Acts,
      d1Comp,
      d1Seals,
      d1Firsts,
    ]);
    rows.push([
      'D2 total (combined)',
      '',
      '',
      '',
      durationExcelSerial(d2Time),
      d2Acts,
      d2Comp,
      d2Seals,
      d2Firsts,
    ]);
    rows.push([
      'Grand total (combined)',
      '',
      '',
      '',
      durationExcelSerial(d1Time + d2Time),
      d1Acts + d2Acts,
      d1Comp + d2Comp,
      d1Seals + d2Seals,
      d1Firsts + d2Firsts,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    for (let r = 1; r < rows.length; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: 4 });
      const cell = ws[addr];
      if (cell && typeof cell.v === 'number') {
        cell.t = 'n';
        cell.z = '[h]:mm';
      }
      const idAddr = XLSX.utils.encode_cell({ r, c: 3 });
      const idCell = ws[idAddr];
      if (idCell && idCell.v != null && idCell.v !== '') {
        idCell.t = 's';
        idCell.v = String(idCell.v);
      }
    }
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    ws['!cols'] = [
      { wch: 22 },
      { wch: 12 },
      { wch: 16 },
      { wch: 20 },
      { wch: 16 },
      { wch: 12 },
      { wch: 12 },
      { wch: 8 },
      { wch: 8 },
    ];
    return ws;
  }

  private buildActivitiesSheet(
    XLSX: XlsxMod,
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
        instanceId != null && instanceId !== '' ? String(instanceId) : '',
        idAsText(instanceId),
        idAsText(refId),
        idAsText(activity.membershipId),
        idAsText(activity.characterId),
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const lastRow = rows.length;
    const lastCol = headers.length - 1;

    for (let r = 2; r <= lastRow; r++) {
      const durAddr = XLSX.utils.encode_cell({ r: r - 1, c: 7 });
      const durCell = ws[durAddr];
      if (durCell && typeof durCell.v === 'number') {
        durCell.t = 'n';
        durCell.z = '[h]:mm';
      }
      const activity = sorted[r - 2];
      const game = (activity.game || 'D2') as string;
      const url = chroniclePgcrUrl(activity.activityDetails?.instanceId, game);
      if (url) {
        const addr = XLSX.utils.encode_cell({ r: r - 1, c: 12 });
        ws[addr] = {
          t: 's',
          v: String(activity.activityDetails?.instanceId ?? 'Report'),
          l: { Target: url, Tooltip: 'Post Game Carnage Report' },
        };
      }
      for (const c of [13, 14, 15, 16]) {
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

  private buildFirstsSheet(
    XLSX: XlsxMod,
    accounts: ArchiveAccount[],
    firstsByAccount: Map<string, ActivityFirstCompletion[]>
  ) {
    const headers = [
      'Game',
      'Player',
      'Platform',
      'Activity',
      'Variant',
      'Date',
      'Solo',
      'Solo Flawless',
      'Flawless',
      'Fireteam size',
      'Report',
      'MembershipId',
      'InstanceId',
    ];
    const rows: unknown[][] = [headers];
    const linkMeta: Array<{ url: string; label: string } | null> = [null];

    for (const account of accounts) {
      const firsts = firstsByAccount.get(this.accountKey(account)) || [];
      const sorted = [...firsts].sort((a, b) => {
        const ta = a.completionDate ? new Date(a.completionDate).getTime() : 0;
        const tb = b.completionDate ? new Date(b.completionDate).getTime() : 0;
        return tb - ta;
      });
      for (const first of sorted) {
        const game = (first.game || account.game) as 'D1' | 'D2';
        const fullName =
          first.name ||
          this.manifest.getActivityName(first.referenceId, game === 'D1') ||
          'Unknown activity';
        const base = baseActivityNameFromVersioned(fullName);
        const variant = fullName.startsWith(base) ? fullName.slice(base.length).replace(/^:\s*/, '') : '';
        const url = chroniclePgcrUrl(first.instanceId, game);
        rows.push([
          game,
          account.displayName,
          account.platform,
          base,
          variant || first.type || '',
          localDateYmd(first.completionDate),
          first.isSolo ? '✓' : '',
          first.isSoloFlawless ? '✓' : '',
          first.isFlawless ? '✓' : '',
          first.fireteamSize ?? '',
          first.instanceId != null ? String(first.instanceId) : '',
          idAsText(account.membershipId),
          idAsText(first.instanceId),
        ]);
        linkMeta.push(url ? { url, label: String(first.instanceId) } : null);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    for (let r = 1; r < rows.length; r++) {
      const meta = linkMeta[r];
      if (meta) {
        const addr = XLSX.utils.encode_cell({ r, c: 10 });
        ws[addr] = {
          t: 's',
          v: meta.label,
          l: { Target: meta.url, Tooltip: 'First clear report' },
        };
      }
      for (const c of [11, 12]) {
        const addr = XLSX.utils.encode_cell({ r, c });
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
        e: { r: Math.max(0, rows.length - 1), c: headers.length - 1 },
      }),
    };
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    ws['!cols'] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 12 },
      { wch: 24 },
      { wch: 14 },
      { wch: 12 },
      { wch: 6 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 14 },
      { hidden: true, wch: 16 },
      { hidden: true, wch: 14 },
    ];
    return ws;
  }

  private async buildRaidsDungeonsSheet(
    XLSX: XlsxMod,
    accounts: ArchiveAccount[],
    activities: StoredActivity[],
    firstsByAccount: Map<string, ActivityFirstCompletion[]>
  ) {
    const columns = this.matrixColumns();
    const midSeen = new Set<string>();
    const dualScopes: BreakdownMembershipScope[] = [];
    for (const a of accounts) {
      if (midSeen.has(a.membershipId)) continue;
      midSeen.add(a.membershipId);
      dualScopes.push({ membershipId: a.membershipId, game: 'D1' });
      dualScopes.push({ membershipId: a.membershipId, game: 'D2' });
    }
    const counts = await this.breakdown.getActivityCountsForScopes(dualScopes);
    const statsByKey = this.aggregateRaidDungeonStats(counts);
    const firstByKey = this.firstClearsFromCollected(firstsByAccount);

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

    for (let c = 0; c < columns.length; c++) {
      const url = firstClearUrls[c];
      if (!url) continue;
      const addr = XLSX.utils.encode_cell({ r: 2, c: c + 1 });
      const cell = ws[addr];
      if (cell) cell.l = { Target: url, Tooltip: 'First clear report' };
    }
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

  private firstClearsFromCollected(
    firstsByAccount: Map<string, ActivityFirstCompletion[]>
  ): Map<string, { date: string; url: string }> {
    const out = new Map<string, { date: string; url: string; ts: number }>();
    for (const firsts of firstsByAccount.values()) {
      for (const first of firsts) {
        if (first.type !== 'raid' && first.type !== 'dungeon') continue;
        const game = (first.game || 'D2') as 'D1' | 'D2';
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
    for (const [k, v] of out) slim.set(k, { date: v.date, url: v.url });
    return slim;
  }

  private async buildBreakdownSheet(XLSX: XlsxMod, accounts: ArchiveAccount[]) {
    const midSeen = new Set<string>();
    const scopes: BreakdownMembershipScope[] = [];
    for (const a of accounts) {
      if (midSeen.has(a.membershipId)) continue;
      midSeen.add(a.membershipId);
      scopes.push({ membershipId: a.membershipId, game: 'D1' });
      scopes.push({ membershipId: a.membershipId, game: 'D2' });
    }
    const counts = await this.breakdown.getActivityCountsForScopes(scopes);
    const groups = this.breakdown.groupRowsByType(counts);

    const rows: unknown[][] = [
      ['Breakdown summary'],
      ['Group', 'Time', 'Runs', 'Clears', 'Clear %'],
    ];
    for (const g of groups) {
      const runs = g.rows.reduce((s, r) => s + (r.runs || 0), 0);
      const clears = g.rows.reduce((s, r) => s + (r.clears || 0), 0);
      const time = g.rows.reduce((s, r) => s + (r.timeSeconds || 0), 0);
      const clearPct = runs > 0 ? Math.round((clears / runs) * 1000) / 10 : 0;
      rows.push([g.label, durationExcelSerial(time), runs, clears, `${clearPct}%`]);
    }

    rows.push([]);
    rows.push(['Breakdown detail']);
    rows.push(['Group', 'Activity', 'Variant', 'Game', 'Runs', 'Clears', 'Fails', 'Time']);
    for (const g of groups) {
      for (const row of g.rows) {
        rows.push([
          g.label,
          row.baseName,
          row.variantName || '',
          row.game,
          row.runs,
          row.clears,
          row.fails,
          durationExcelSerial(row.timeSeconds),
        ]);
      }
      rows.push([]); // separator between groups (SheetJS outline is limited)
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Format time columns where values are day-fractions
    for (let r = 0; r < rows.length; r++) {
      for (const c of [1, 7]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && typeof cell.v === 'number' && cell.v > 0 && cell.v < 1000) {
          // Heuristic: duration serials are small day fractions
          if (cell.v < 50) {
            cell.t = 'n';
            cell.z = '[h]:mm';
          }
        }
      }
    }
    ws['!cols'] = [
      { wch: 28 },
      { wch: 24 },
      { wch: 16 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 10 },
    ];
    return ws;
  }

  private buildSealsSheet(
    XLSX: XlsxMod,
    accounts: ArchiveAccount[],
    titlesSnapshot: ArchiveTitlesSnapshot
  ) {
    const headers = [
      'Game',
      'Player',
      'Platform',
      'Seal',
      'Status',
      'Progress %',
      'Gilded',
      'Times gilded',
      'Date earned (my note)',
      '3D printed',
      'MembershipId',
      'Hash',
    ];
    const rows: unknown[][] = [headers];
    rows.push([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '← user-entered',
      '← user-entered',
      '',
      '',
    ]);

    for (const account of accounts) {
      const titles = this.titlesForAccount(titlesSnapshot, account);
      const sorted = [...titles].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      for (const title of sorted) {
        const status = title.completed ? 'Complete' : title.locked ? 'Locked' : 'In progress';
        rows.push([
          account.game,
          account.displayName,
          account.platform,
          title.name,
          status,
          title.progressPercent != null ? title.progressPercent : '',
          title.isGilded ? '✓' : '',
          title.timesGilded ?? '',
          '', // user note
          '', // user note
          idAsText(account.membershipId),
          idAsText(title.hash),
        ]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    for (let r = 2; r < rows.length; r++) {
      for (const c of [10, 11]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && cell.v != null && cell.v !== '') {
          cell.t = 's';
          cell.v = String(cell.v);
        }
      }
    }
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: Math.max(0, rows.length - 1), c: headers.length - 1 },
      }),
    };
    ws['!cols'] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 12 },
      { wch: 22 },
      { wch: 12 },
      { wch: 10 },
      { wch: 8 },
      { wch: 12 },
      { wch: 20 },
      { wch: 12 },
      { hidden: true, wch: 16 },
      { hidden: true, wch: 14 },
    ];
    return ws;
  }

  private buildOnThisDaySheet(XLSX: XlsxMod, activities: StoredActivity[]) {
    const grid = onThisDayCountGrid(activities);
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const header = ['Month', ...Array.from({ length: 31 }, (_, i) => i + 1)];
    const rows: unknown[][] = [header];
    for (let m = 0; m < 12; m++) {
      rows.push([months[m], ...grid[m]]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Grey invalid calendar days (non-leap Feb 29, Apr 31, etc.)
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 31; d++) {
        if (isValidCalendarMonthDay(m, d)) continue;
        const addr = XLSX.utils.encode_cell({ r: m, c: d });
        const cell = ws[addr] || { t: 's', v: '' };
        cell.v = '';
        cell.t = 's';
        cell.s = { fill: { fgColor: { rgb: 'FFD0D0D0' } } };
        ws[addr] = cell;
      }
    }

    ws['!freeze'] = { xSplit: 1, ySplit: 1 };
    ws['!cols'] = [{ wch: 6 }, ...Array.from({ length: 31 }, () => ({ wch: 4 }))];
    return ws;
  }

  private matrixColumns(): MatrixCol[] {
    const cols: MatrixCol[] = [];
    for (const baseName of D1_RAID_RELEASE_ORDER) {
      cols.push({ key: `D1|${baseName}`, game: 'D1', baseName, header: `D1 · ${baseName}` });
    }
    for (const baseName of D2_RAID_RELEASE_ORDER) {
      cols.push({ key: `D2|${baseName}`, game: 'D2', baseName, header: `D2 · ${baseName}` });
    }
    for (const baseName of D2_DUNGEON_RELEASE_ORDER) {
      cols.push({ key: `D2|${baseName}`, game: 'D2', baseName, header: `D2 · ${baseName}` });
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
}
