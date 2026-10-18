import { ActivityCountRow } from '../services/activity-breakdown.service';

export const BREAKDOWN_PAGE_SIZE = 50;

export interface BreakdownGroup {
  type: string;
  label: string;
  game?: 'D1' | 'D2';
  rows: ActivityCountRow[];
}

export interface BreakdownCard {
  label: string;
  runs: number;
  clears: number;
  timeSeconds: number;
  clearRate: number;
}

const NO_ROWS: ActivityCountRow[] = [];

export function breakdownGroupKey(group: { label: string; game?: string }): string {
  return `${group.game || ''}|${group.label}`;
}

export function breakdownRowKey(row: { game?: string; baseName: string; variantName?: string }): string {
  return `${row.game || ''}|${row.baseName}|${row.variantName || ''}`;
}

export function breakdownCards(groups: BreakdownGroup[]): BreakdownCard[] {
  return groups.map(group => {
    let runs = 0;
    let clears = 0;
    let timeSeconds = 0;
    for (const row of group.rows) {
      runs += row.runs ?? 0;
      clears += row.clears ?? 0;
      timeSeconds += row.timeSeconds ?? 0;
    }
    return {
      label: group.label,
      runs,
      clears,
      timeSeconds,
      clearRate: runs > 0 ? (clears / runs) * 100 : 0,
    };
  });
}

function sortRows(rows: ActivityCountRow[], sort: 'asc' | 'desc'): ActivityCountRow[] {
  const dir = sort === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ta = a.lastPlayed ? new Date(a.lastPlayed).getTime() : 0;
    const tb = b.lastPlayed ? new Date(b.lastPlayed).getTime() : 0;
    if (ta === tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return (ta - tb) * dir;
  });
}

/**
 * Cached breakdown lists. The same array is returned until the groups, the
 * selected cards, or the sort change, so the tables are not rebuilt on every refresh.
 */
export class BreakdownView {
  cards: BreakdownCard[] = [];
  groups: BreakdownGroup[] = [];
  private source: BreakdownGroup[] | null = null;
  private selectionKey = '';
  private sort: 'asc' | 'desc' | null = null;
  private expanded = new Set<string>();
  private shown = new Map<string, number>();
  private visibleCache = new Map<string, ActivityCountRow[]>();

  sync(groups: BreakdownGroup[], selected: Set<string>, sort: 'asc' | 'desc' | null, retainExpansion = false): void {
    const selectionKey = Array.from(selected).sort().join('\n');
    if (groups === this.source && selectionKey === this.selectionKey && sort === this.sort) {
      return;
    }
    const sourceChanged = groups !== this.source;
    const selectionChanged = selectionKey !== this.selectionKey;
    this.source = groups;
    this.selectionKey = selectionKey;
    this.sort = sort;
    this.cards = breakdownCards(groups || []);
    const base = !groups?.length
      ? []
      : selected.size === 0
        ? groups
        : groups.filter(group => selected.has(group.label));
    this.groups = !sort ? base : base.map(group => ({ ...group, rows: sortRows(group.rows, sort) }));
    this.visibleCache.clear();
    if ((sourceChanged || selectionChanged) && !retainExpansion) {
      this.expanded = new Set();
      this.shown.clear();
      const initial = selected.size > 0 ? this.groups : this.groups.slice(0, 1);
      for (const group of initial) {
        this.expanded.add(breakdownGroupKey(group));
      }
    }
  }

  isExpanded(group: BreakdownGroup): boolean {
    return this.expanded.has(breakdownGroupKey(group));
  }

  visibleRows(group: BreakdownGroup): ActivityCountRow[] {
    const key = breakdownGroupKey(group);
    if (!this.expanded.has(key)) {
      return NO_ROWS;
    }
    const limit = this.shown.get(key) ?? BREAKDOWN_PAGE_SIZE;
    if (limit >= group.rows.length) {
      return group.rows;
    }
    const cached = this.visibleCache.get(key);
    if (cached && cached.length === limit) {
      return cached;
    }
    const slice = group.rows.slice(0, limit);
    this.visibleCache.set(key, slice);
    return slice;
  }

  hiddenCount(group: BreakdownGroup): number {
    if (!this.isExpanded(group)) {
      return 0;
    }
    return Math.max(0, group.rows.length - this.visibleRows(group).length);
  }

  toggle(group: BreakdownGroup): void {
    const key = breakdownGroupKey(group);
    if (this.expanded.has(key)) {
      this.expanded.delete(key);
    } else {
      this.expanded.add(key);
    }
    this.visibleCache.delete(key);
  }

  showMore(group: BreakdownGroup): void {
    const key = breakdownGroupKey(group);
    const next = (this.shown.get(key) ?? BREAKDOWN_PAGE_SIZE) + BREAKDOWN_PAGE_SIZE;
    this.shown.set(key, next);
    this.visibleCache.delete(key);
  }

  expandAll(): void {
    this.expanded = new Set(this.groups.map(breakdownGroupKey));
    this.shown.clear();
    this.visibleCache.clear();
    for (const group of this.groups) {
      this.shown.set(breakdownGroupKey(group), group.rows.length);
    }
  }
}

export function cardLabelFromEvent(event: { target: EventTarget | null }): string | null {
  const target = event.target as HTMLElement | null;
  const el = target?.closest?.('[data-card-label]');
  return el?.getAttribute('data-card-label') ?? null;
}

export function breakdownRowFromEvent(event: { target: EventTarget | null }, rows: ActivityCountRow[]): ActivityCountRow | undefined {
  const target = event.target as HTMLElement | null;
  if (!target?.closest?.('.breakdown-date-pgcr-link')) {
    return undefined;
  }
  const el = target.closest('[data-row-key]');
  const key = el?.getAttribute('data-row-key');
  if (!key) {
    return undefined;
  }
  return rows.find(row => breakdownRowKey(row) === key);
}

const breakdownCreateLog: number[] = [];
export const breakdownCreateCounts = { rows: 0, tiles: 0 };

export function noteBreakdownCreate(kind: 'row' | 'tile'): void {
  breakdownCreateCounts[kind === 'row' ? 'rows' : 'tiles']++;
  breakdownCreateLog.push(Date.now());
}

export function breakdownCreatesInLastSecond(now = Date.now()): number {
  return breakdownCreateLog.filter(at => now - at < 1000).length;
}

export function resetBreakdownCreates(): void {
  breakdownCreateCounts.rows = 0;
  breakdownCreateCounts.tiles = 0;
  breakdownCreateLog.length = 0;
}
