import { ChartConfiguration } from 'chart.js';
import { formatSecondsToHoursMinutes } from './format-duration';

/**
 * Activity Breakdown chart selection (pure, unit-tested).
 * Group labels look like "Raid \u2013 D2"; filter on group.game, never on label text.
 */

/** Display names for chart category dropdown. */
export const BREAKDOWN_CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  Story: 'Story missions',
  Raid: 'Raids',
  Dungeon: 'Dungeons',
  Strike: 'Strikes',
  Patrol: 'Patrol',
  Nightfall: 'Nightfall',
  Gambit: 'Gambit',
  PvP: 'PvP',
  'Seasonal Arena': 'Seasonal Arenas',
  'Seasonal Arenas': 'Seasonal Arenas',
  'Prison of Elders': 'Prison of Elders',
  'Renegade Activities': 'Renegade Activities',
  'Vehicle PVP': 'Vehicle PVP',
  'D1 Crucible': 'D1 Crucible',
  'Sparrow Racing League': 'Sparrow Racing League',
  Battlegrounds: 'Battlegrounds',
  'Story Strikes': 'Story Strikes',
  'Exotic Story Missions': 'Exotic Story Missions',
  LostSector: 'Lost Sectors',
  Relic: 'Relic',
};

export function buildBreakdownPieChartOptions(): ChartConfiguration['options'] {
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        align: 'start',
        labels: {
          color: '#e2e8f0',
          font: { size: 12 },
          padding: 10,
          boxWidth: 14,
          usePointStyle: true,
          pointStyle: 'circle',
          textAlign: 'left',
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a: any, b: any) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${label}: ${formatSecondsToHoursMinutes(value)} (${percentage}%)`;
          },
        },
      },
    },
  };
}

export function buildBreakdownBarChartOptions(): ChartConfiguration['options'] {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            return `${formatSecondsToHoursMinutes(context.parsed.x)}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#e2e8f0',
          callback: (value) => formatSecondsToHoursMinutes(value as number),
        },
        grid: { color: '#334155' },
      },
      y: {
        ticks: { color: '#e2e8f0' },
        grid: { color: '#334155' },
      },
    },
  };
}

export interface BreakdownRowLike {
  baseName: string;
  variantName?: string | null;
  timeSeconds: number;
}

export interface BreakdownGroupLike {
  label: string;
  game?: 'D1' | 'D2';
  rows: BreakdownRowLike[];
}

export interface ChartItem {
  label: string;
  timeSeconds: number;
}

/** "Raid \u2013 D1" / "Raid - D1" -> "Raid". */
export function breakdownCategoryFromLabel(label: string): string {
  if (!label) return '';
  const parts = label.split(/\s*[\u2013\u2014-]\s*/);
  return (parts[0] ?? label).trim();
}

/** One category when every selected tile is that type, otherwise all. */
export function chartCategoryForSelectedTiles(labels: readonly string[]): string {
  const categories = new Set(labels.map(breakdownCategoryFromLabel).filter(Boolean));
  return categories.size === 1 ? [...categories][0] : 'all';
}

/** Tile labels for a chart category. All clears the selection. Optional game keeps D1/D2 tiles from crossing. */
export function tileLabelsForChartCategory(
  cardLabels: readonly string[],
  category: string,
  game: 'all' | 'D1' | 'D2' = 'all'
): string[] {
  if (!category || category === 'all') {
    return [];
  }
  const byGame =
    game === 'all'
      ? cardLabels
      : cardLabels.filter(label => label.endsWith(`– ${game}`) || label.endsWith(`- ${game}`));
  // Legacy "Trials" chart category → both Osiris and Nine tiles after the split.
  if (category === 'Trials') {
    return byGame.filter(label => breakdownCategoryFromLabel(label).startsWith('Trials'));
  }
  return byGame.filter(label => breakdownCategoryFromLabel(label) === category);
}

/** Keep only groups for the chart/game dropdown (tiles + tables must match the chart). */
export function filterBreakdownGroupsByGame<T extends BreakdownGroupLike>(
  groups: readonly T[],
  game: 'all' | 'D1' | 'D2'
): T[] {
  if (game === 'all') return [...groups];
  return groups.filter(g => g.game === game);
}

export function labelMatchesBreakdownGame(label: string, game: 'D1' | 'D2'): boolean {
  return label.endsWith(`– ${game}`) || label.endsWith(`- ${game}`);
}

export function buildBreakdownCategoryOptions(
  groups: readonly BreakdownGroupLike[],
  displayNames: Record<string, string> = {}
): { value: string; label: string }[] {
  const base = [{ value: 'all', label: 'All activity types' }];
  const seen = new Set<string>();
  for (const g of groups) {
    const cat = breakdownCategoryFromLabel(g.label) || g.label;
    if (cat && !seen.has(cat)) {
      seen.add(cat);
      base.push({ value: cat, label: displayNames[cat] ?? (cat.endsWith('s') ? cat : cat + 's') });
    }
  }
  return base;
}

/**
 * groups: groups already narrowed by selected tiles (if any).
 * Returns summary items (one per group) when nothing narrows to a category,
 * otherwise per-activity drill-down items. Game and category filters always apply.
 */
export function selectBreakdownChartItems(
  groups: readonly BreakdownGroupLike[],
  opts: { tilesSelected: boolean; category: string; game: 'all' | 'D1' | 'D2' }
): { summary: boolean; items: ChartItem[] } {
  const byGame = groups.filter(g => opts.game === 'all' || g.game === opts.game);
  const byCat = opts.category === 'all'
    ? byGame
    : opts.category === 'Trials'
      ? byGame.filter(g => breakdownCategoryFromLabel(g.label).startsWith('Trials'))
      : byGame.filter(g => breakdownCategoryFromLabel(g.label) === opts.category);
  const sortDesc = (xs: ChartItem[]) => xs.sort((a, b) => b.timeSeconds - a.timeSeconds);
  if (!opts.tilesSelected && opts.category === 'all') {
    return {
      summary: true,
      items: sortDesc(byCat.map(g => ({ label: g.label, timeSeconds: g.rows.reduce((s, r) => s + (r.timeSeconds ?? 0), 0) }))),
    };
  }
  const items: ChartItem[] = [];
  for (const g of byCat) {
    for (const r of g.rows) {
      items.push({ label: r.variantName ? `${r.baseName} (${r.variantName})` : r.baseName, timeSeconds: r.timeSeconds });
    }
  }
  return { summary: false, items: sortDesc(items) };
}
