import {
  aggregateLookupGame,
  aggregateLookupPlatform,
  resolveLookupSource,
} from './lookup-analytics';

export interface LookupAnalyticsStatus {
  status: string;
  game: 'D1' | 'D2';
  platform: string;
}

/**
 * Build account_lookup payload once a load batch is terminal (CODE_CLEANUP_SPEC).
 * Returns null if not ready to send.
 */
export function buildAccountLookupPayload(input: {
  alreadySent: boolean;
  statuses: LookupAnalyticsStatus[];
  lookupStartedAtMs: number | null;
  lookupDataSources: Set<'archive' | 'bungie'>;
  bucketLoadMs: (ms: number) => string | number;
}): {
  track: {
    game: 'D1' | 'D2' | 'mixed';
    platform: string;
    account_count: number;
    source: 'archive' | 'bungie' | 'mixed';
    load_ms_bucket: string | number;
  };
  errorCount: number;
} | null {
  if (input.alreadySent) return null;
  if (!input.statuses.length) return null;
  const allDone = input.statuses.every(
    (s) => s.status === 'complete' || s.status === 'error'
  );
  if (!allDone) return null;

  const started = input.lookupStartedAtMs;
  const elapsed =
    started == null
      ? 0
      : (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        started;
  const games = input.statuses.map((s) => s.game);
  const platforms = input.statuses.map((s) => s.platform);
  const errorCount = input.statuses.filter((s) => s.status === 'error').length;

  return {
    track: {
      game: aggregateLookupGame(games),
      platform: aggregateLookupPlatform(platforms),
      account_count: input.statuses.length,
      source: resolveLookupSource(input.lookupDataSources),
      load_ms_bucket: input.bucketLoadMs(elapsed),
    },
    errorCount,
  };
}
