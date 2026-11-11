import type { ActivityCountRow } from '../services/activity-breakdown.service';
import {
  buildTimeStoryByYear,
  groupSharePercent,
  yearOfPeriod,
  type TimeStoryByYearResult,
  type TimeStoryYearFilter,
} from './time-story-by-year';

/** One classified lean activity used by the year chart and the detailed table. */
export interface UnifiedBreakdownSource {
  instanceId?: string;
  period?: string;
  membershipId?: string;
  game: 'D1' | 'D2';
  sectionKey: string;
  sectionLabel: string;
  referenceId: string;
  baseName: string;
  variantName: string;
  mode: number;
  seconds: number;
  completed: boolean;
}

export function filterUnifiedByYear(
  records: UnifiedBreakdownSource[],
  year: TimeStoryYearFilter,
  timeZone?: string
): UnifiedBreakdownSource[] {
  return records.filter(row => {
    const y = yearOfPeriod(row.period, timeZone);
    if (y == null) return false;
    return year === 'all' || y === year;
  });
}

export function buildUnifiedYearBars(
  records: UnifiedBreakdownSource[],
  timeZone?: string,
  groupOrder?: readonly string[]
): TimeStoryByYearResult {
  return buildTimeStoryByYear(
    records.map(row => ({ period: row.period, timeSeconds: row.seconds, activity: row })),
    row => row.sectionKey,
    timeZone,
    groupOrder
  );
}

/** Same (referenceId, game, mode) roll-up the detailed Breakdown table uses. */
export function aggregateUnifiedCountRows(records: UnifiedBreakdownSource[]): ActivityCountRow[] {
  const agg = new Map<string, ActivityCountRow>();
  for (const row of records) {
    const key = `${row.referenceId}|${row.game}|${row.mode}`;
    const clear = row.completed ? 1 : 0;
    const existing = agg.get(key);
    if (!existing) {
      agg.set(key, {
        referenceId: row.referenceId,
        game: row.game,
        baseName: row.baseName,
        variantName: row.variantName,
        mode: row.mode,
        runs: 1,
        clears: clear,
        fails: 1 - clear,
        timeSeconds: row.seconds,
        lastPlayed: row.period,
        lastPlayedInstanceId: row.instanceId,
      });
      continue;
    }
    existing.runs += 1;
    existing.clears += clear;
    existing.fails = Math.max(0, existing.runs - existing.clears);
    existing.timeSeconds += row.seconds;
    if (row.period && (!existing.lastPlayed || new Date(row.period).getTime() > new Date(existing.lastPlayed).getTime())) {
      existing.lastPlayed = row.period;
      existing.lastPlayedInstanceId = row.instanceId;
    }
  }
  return Array.from(agg.values());
}

export function sectionTotalsFromRecords(
  records: UnifiedBreakdownSource[]
): Map<string, { label: string; seconds: number; games: number }> {
  const bySection = new Map<string, { label: string; seconds: number; games: number }>();
  for (const row of records) {
    const cur = bySection.get(row.sectionKey) || { label: row.sectionLabel, seconds: 0, games: 0 };
    cur.seconds += row.seconds;
    cur.games += 1;
    if (!cur.label) cur.label = row.sectionLabel;
    bySection.set(row.sectionKey, cur);
  }
  return bySection;
}

export function childRowsReconcileToSections(
  rows: ActivityCountRow[],
  sectionKeyOf: (row: ActivityCountRow) => string
): Map<string, { seconds: number; games: number }> {
  const bySection = new Map<string, { seconds: number; games: number }>();
  for (const row of rows) {
    const key = sectionKeyOf(row);
    const cur = bySection.get(key) || { seconds: 0, games: 0 };
    cur.seconds += row.timeSeconds;
    cur.games += row.runs;
    bySection.set(key, cur);
  }
  return bySection;
}

export function instanceIdsForSection(
  records: UnifiedBreakdownSource[],
  sectionKey: string
): string[] {
  return records
    .filter(row => row.sectionKey === sectionKey && row.instanceId)
    .map(row => String(row.instanceId));
}

const SECTION_COLORS: Record<string, string> = {
  dungeon: '#C4843A',
  nightfall: '#3E6FBF',
  strikes: '#5B8AD6',
  battlegrounds: '#4A9B8C',
  'story-strikes': '#7B6BB0',
  'exotic-story-missions': '#9B7AC8',
  'seasonal-arena': '#8A6BC4',
  'prison-of-elders': '#C4843A',
  gambit: '#3D9B6E',
  'trials-osiris': '#EDE6DA',
  'trials-nine': '#D8C4A0',
  pvp: '#D4544A',
  'sparrow-racing-league': '#E8A54A',
  'mode-2': '#9B7AC8',
  'mode-4': '#E8C36A',
  'mode-6': '#6B8F71',
  'mode-0': '#C4B8A4',
};

const PALETTE = ['#E8C36A', '#5B8AD6', '#D4544A', '#3D9B6E', '#9B7AC8', '#C4843A', '#EDE6DA', '#8A8276', '#4A9B8C', '#E8A54A'];

export function breakdownSectionColor(sectionKey: string): string {
  if (SECTION_COLORS[sectionKey]) return SECTION_COLORS[sectionKey];
  let hash = 0;
  for (let i = 0; i < sectionKey.length; i++) {
    hash = (hash * 31 + sectionKey.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function unifiedTableAndBarsReconcile(
  records: UnifiedBreakdownSource[],
  year: TimeStoryYearFilter,
  timeZone?: string,
  groupOrder?: readonly string[],
  toleranceSeconds = 0
): boolean {
  const filtered = filterUnifiedByYear(records, year, timeZone);
  const bars = buildUnifiedYearBars(records, timeZone, groupOrder);
  const table = year === 'all'
    ? { seconds: bars.totalSeconds, games: bars.totalGames, groups: sectionTotalsFromRecords(filtered) }
    : (() => {
        const bar = bars.years.find(item => item.year === year);
        return {
          seconds: bar?.seconds ?? 0,
          games: bar?.games ?? 0,
          groups: sectionTotalsFromRecords(filtered),
        };
      })();
  if (Math.abs(filtered.reduce((s, r) => s + r.seconds, 0) - table.seconds) > toleranceSeconds) return false;
  if (filtered.length !== table.games) return false;
  const rows = aggregateUnifiedCountRows(filtered);
  const childGames = rows.reduce((s, r) => s + r.runs, 0);
  const childSeconds = rows.reduce((s, r) => s + r.timeSeconds, 0);
  if (childGames !== table.games) return false;
  if (Math.abs(childSeconds - table.seconds) > toleranceSeconds) return false;
  const bySection = childRowsReconcileToSections(rows, row => {
    const rec = filtered.find(item => item.referenceId === row.referenceId && item.game === row.game && item.mode === row.mode);
    return rec?.sectionKey || '';
  });
  for (const [key, tot] of table.groups) {
    const child = bySection.get(key);
    if (!child || child.games !== tot.games || Math.abs(child.seconds - tot.seconds) > toleranceSeconds) return false;
  }
  return true;
}
