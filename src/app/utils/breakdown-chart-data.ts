import type { ChartData, ChartType } from 'chart.js';

const BREAKDOWN_CHART_COLORS = [
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#6366f1',
  '#14b8a6',
  '#a855f7',
  '#eab308',
  '#22c55e',
  '#0ea5e9',
];

/** Build pie/bar Chart.js data from time-labeled items (CODE_CLEANUP_SPEC). */
export function buildBreakdownChartDataFromItems(
  items: { label: string; timeSeconds: number }[],
  chartType: ChartType | 'pie' | 'bar'
): ChartData<'pie' | 'bar'> {
  const colors = BREAKDOWN_CHART_COLORS;
  const sortedAll = [...items].sort((a, b) => b.timeSeconds - a.timeSeconds);
  if (chartType === 'pie') {
    return {
      labels: sortedAll.map((c) => c.label),
      datasets: [
        {
          data: sortedAll.map((c) => c.timeSeconds),
          backgroundColor: colors,
        },
      ],
    };
  }
  const sorted = sortedAll.slice(0, 30);
  return {
    labels: sorted.map((c) => c.label),
    datasets: [
      {
        label: 'Time Spent',
        data: sorted.map((c) => c.timeSeconds),
        backgroundColor: '#10b981',
      },
    ],
  };
}

/** Sum timeSeconds across summary cards, optionally filtered by selected labels. */
export function sumBreakdownCardTimeSeconds(
  cards: { label: string; timeSeconds?: number }[],
  selectedLabels: Set<string>
): number {
  const list =
    selectedLabels.size > 0
      ? cards.filter((c) => selectedLabels.has(c.label))
      : cards;
  if (!list?.length) return 0;
  return list.reduce((sum, c) => sum + (c.timeSeconds ?? 0), 0);
}
