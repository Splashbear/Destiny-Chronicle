/**
 * Aggregate runs/clears/time for a breakdown group (CODE_CLEANUP_SPEC).
 */
export function sumBreakdownGroupTotals(
  rows: Array<{ runs?: number; clears?: number; timeSeconds?: number }>
): { runs: number; clears: number; timeSeconds: number } {
  let runs = 0;
  let clears = 0;
  let timeSeconds = 0;
  for (const row of rows) {
    runs += row.runs ?? 0;
    clears += row.clears ?? 0;
    timeSeconds += row.timeSeconds ?? 0;
  }
  return { runs, clears, timeSeconds };
}
