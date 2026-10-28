/**
 * Activity Breakdown chart selection (pure, unit-tested).
 * Group labels look like "Raid \u2013 D2"; filter on group.game, never on label text.
 */

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
