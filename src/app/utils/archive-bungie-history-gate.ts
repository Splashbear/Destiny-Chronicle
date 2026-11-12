/**
 * Decide whether D2 archive coverage should continue into Bungie activity-history.
 * D1 never uses this path (D1 always full-crawls via D1_HISTORY_MODES).
 *
 * - fill ON + stop line: delta catch-up only
 * - fill OFF + full or leanPartial coverage: skip Bungie entirely
 * - otherwise: full Bungie crawl
 */
export type ArchiveBungieHistoryAction = 'delta' | 'skip' | 'full-crawl';

export function archiveBungieHistoryAction(input: {
  archiveBungieDeltaFill: boolean;
  game: 'D1' | 'D2';
  effectiveLevel: string | undefined;
  leanPartial: boolean;
  bungieStopAtIid: number | null;
}): ArchiveBungieHistoryAction {
  const { archiveBungieDeltaFill, game, effectiveLevel, leanPartial, bungieStopAtIid } = input;
  if (archiveBungieDeltaFill && game === 'D2' && bungieStopAtIid != null) {
    return 'delta';
  }
  if (game === 'D2' && (effectiveLevel === 'full' || leanPartial)) {
    return 'skip';
  }
  return 'full-crawl';
}
