import { type SeasonStartYmd } from './season-starts';
import { timeStoryEraNameForYmd, timeStoryEraRanges } from './time-story-era-starts';

export interface TimeStoryEraRow {
  period?: string;
  game?: 'D1' | 'D2';
  activityHash?: string | number;
  timeSeconds: number;
}

export interface TimeStoryEraItem {
  game: 'D1' | 'D2';
  eraName: string;
  eraStart: SeasonStartYmd;
  activityHash: string;
  activityName: string;
  seconds: number;
  games: number;
  hoursLabel: string;
  /** Example: "Forsaken · Last Wish · 140h" */
  label: string;
}

export const TIME_STORY_UNKNOWN_ACTIVITY = 'Unknown activity';

export function ymdInTimeZone(
  period: string | undefined | null,
  timeZone?: string
): { year: number; month: number; day: number } | null {
  if (!period) return null;
  const date = new Date(period);
  if (Number.isNaN(date.getTime())) return null;
  if (!timeZone) {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const num = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const year = num('year');
  const month = num('month');
  const day = num('day');
  if (![year, month, day].every(n => Number.isFinite(n) && n > 0)) return null;
  return { year, month, day };
}

export function eraNameForPeriod(
  game: 'D1' | 'D2',
  period: string | undefined | null,
  timeZone?: string
): string | null {
  const ymd = ymdInTimeZone(period, timeZone);
  if (!ymd) return null;
  return timeStoryEraNameForYmd(game, ymd.year, ymd.month, ymd.day);
}

/** Compact hours for the era strip (spec example: "140h"). Under one hour, show minutes. */
export function formatTimeStoryEraHours(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0h';
  const hours = Math.floor(seconds / 3600);
  if (hours <= 0) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  }
  return `${hours}h`;
}

/**
 * Prefer a canonical family name: drop variant suffixes after ": "
 * (e.g. "Last Wish: Standard" -> "Last Wish"). Live data should already
 * come from getActivityFamilyName; this keeps local aliases short too.
 */
export function canonicalEraActivityName(name: string | undefined | null): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return TIME_STORY_UNKNOWN_ACTIVITY;
  const colon = trimmed.indexOf(': ');
  const base = (colon !== -1 ? trimmed.slice(0, colon) : trimmed).trim();
  return base || TIME_STORY_UNKNOWN_ACTIVITY;
}

export function formatTimeStoryEraLabel(eraName: string, activityName: string, seconds: number): string {
  return `${eraName} · ${activityName} · ${formatTimeStoryEraHours(seconds)}`;
}

export function buildTimeStoryEras(
  rows: TimeStoryEraRow[],
  options: {
    timeZone?: string;
    games?: Array<'D1' | 'D2'>;
    resolveActivityName?: (game: 'D1' | 'D2', activityHash: string) => string;
  } = {}
): TimeStoryEraItem[] {
  const games = options.games?.length ? options.games : (['D1', 'D2'] as Array<'D1' | 'D2'>);
  const gameSet = new Set(games);
  const resolve = options.resolveActivityName;

  const buckets = new Map<
    string,
    { game: 'D1' | 'D2'; eraName: string; activityHash: string; seconds: number; games: number }
  >();

  for (const row of rows) {
    const game = row.game === 'D1' ? 'D1' : row.game === 'D2' ? 'D2' : null;
    if (!game || !gameSet.has(game)) continue;
    const hash = row.activityHash != null && String(row.activityHash) !== '' ? String(row.activityHash) : '';
    if (!hash) continue;
    const eraName = eraNameForPeriod(game, row.period, options.timeZone);
    if (!eraName) continue;
    const seconds = row.timeSeconds;
    if (!Number.isFinite(seconds) || seconds < 0) continue;
    const key = `${game}|${eraName}|${hash}`;
    const prev = buckets.get(key);
    if (!prev) {
      buckets.set(key, { game, eraName, activityHash: hash, seconds, games: 1 });
    } else {
      prev.seconds += seconds;
      prev.games += 1;
    }
  }

  const winners = new Map<string, { game: 'D1' | 'D2'; eraName: string; activityHash: string; seconds: number; games: number }>();
  for (const bucket of buckets.values()) {
    const eraKey = `${bucket.game}|${bucket.eraName}`;
    const prev = winners.get(eraKey);
    if (!prev || isBetterEraActivity(bucket, prev)) {
      winners.set(eraKey, bucket);
    }
  }

  const ranges = games.flatMap(game => timeStoryEraRanges(game));
  const items: TimeStoryEraItem[] = [];
  for (const range of ranges) {
    const winner = winners.get(`${range.game}|${range.name}`);
    if (!winner) continue;
    const activityName = canonicalEraActivityName(
      resolve?.(winner.game, winner.activityHash) || TIME_STORY_UNKNOWN_ACTIVITY
    );
    const hoursLabel = formatTimeStoryEraHours(winner.seconds);
    items.push({
      game: winner.game,
      eraName: winner.eraName,
      eraStart: range.start,
      activityHash: winner.activityHash,
      activityName,
      seconds: winner.seconds,
      games: winner.games,
      hoursLabel,
      label: formatTimeStoryEraLabel(winner.eraName, activityName, winner.seconds),
    });
  }

  items.sort((a, b) => {
    const startCmp =
      b.eraStart.year - a.eraStart.year ||
      b.eraStart.month - a.eraStart.month ||
      b.eraStart.day - a.eraStart.day;
    if (startCmp !== 0) return startCmp;
    return a.game.localeCompare(b.game);
  });
  return items;
}

/** Higher time wins; ties prefer more games, then a stable activity hash. */
function isBetterEraActivity(
  candidate: { seconds: number; games: number; activityHash: string },
  current: { seconds: number; games: number; activityHash: string }
): boolean {
  if (candidate.seconds !== current.seconds) return candidate.seconds > current.seconds;
  if (candidate.games !== current.games) return candidate.games > current.games;
  return candidate.activityHash < current.activityHash;
}
