/**
 * Trials detail aggregation for Activity Breakdown (history values only).
 * Flawless / Lighthouse / card wins are intentionally not derived here.
 */

import {
  classifyPvp,
  isTrialsBucket,
  pvpActivityKey,
  trialsSubBucketLabel,
  type DestinyGame,
  type TrialsSubBucket,
} from './classify-pvp';

export interface TrialsHistoryLike {
  period?: string;
  game?: DestinyGame | string;
  activityDetails?: {
    referenceId?: string | number;
    instanceId?: string | number;
    mode?: number;
    modes?: number[];
    directorActivityHash?: string | number;
  };
  modes?: number[];
  values?: {
    standing?: { basic?: { value?: number } } | number;
    kills?: { basic?: { value?: number } } | number;
    deaths?: { basic?: { value?: number } } | number;
    assists?: { basic?: { value?: number } } | number;
    timePlayedSeconds?: { basic?: { value?: number } } | number;
    secondsPlayed?: { basic?: { value?: number } } | number;
    activityDurationSeconds?: { basic?: { value?: number } } | number;
  };
  mapName?: string;
}

export interface TrialsStatBlock {
  matches: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  timeSeconds: number;
}

export interface TrialsSubRow extends TrialsStatBlock {
  bucket: TrialsSubBucket;
  label: string;
}

export interface TrialsWeekendRow extends TrialsStatBlock {
  key: string;
  startIso: string;
  endIso: string;
  /** Dominant / most-played map name for the weekend. */
  mapName: string;
  instanceIds: string[];
}

export interface TrialsTeammateRow {
  membershipId: string;
  displayName: string;
  matchesTogether: number;
}

export interface TrialsBreakdownDetail {
  totals: TrialsStatBlock;
  subRows: TrialsSubRow[];
  weekends: TrialsWeekendRow[];
  /** Newest Trials activity period (ISO), for "Trials through <date>" when load incomplete. */
  throughDate?: string;
  /** Deduped Trials instance ids (game|iid keys mapped to iid). */
  instanceIds: string[];
}

function basicValue(v: { basic?: { value?: number } } | number | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = v.basic?.value;
  return n != null && Number.isFinite(Number(n)) ? Number(n) : 0;
}

function durationSeconds(a: TrialsHistoryLike): number {
  const v = a.values;
  if (!v) return 0;
  return (
    basicValue(v.timePlayedSeconds) ||
    basicValue(v.secondsPlayed) ||
    basicValue(v.activityDurationSeconds) ||
    0
  );
}

/** Destiny standing: 0 = victory, 1 = defeat. */
export function isVictoryStanding(standing: number): boolean {
  return standing === 0;
}

export function emptyTrialsStatBlock(): TrialsStatBlock {
  return { matches: 0, wins: 0, losses: 0, kills: 0, deaths: 0, assists: 0, timeSeconds: 0 };
}

export function addTrialsStat(target: TrialsStatBlock, add: Partial<TrialsStatBlock>): void {
  target.matches += add.matches ?? 0;
  target.wins += add.wins ?? 0;
  target.losses += add.losses ?? 0;
  target.kills += add.kills ?? 0;
  target.deaths += add.deaths ?? 0;
  target.assists += add.assists ?? 0;
  target.timeSeconds += add.timeSeconds ?? 0;
}

export function trialsWinRate(block: TrialsStatBlock): number {
  const decided = block.wins + block.losses;
  return decided > 0 ? (block.wins / decided) * 100 : 0;
}

export function trialsKd(block: TrialsStatBlock): number {
  return block.deaths > 0 ? block.kills / block.deaths : block.kills;
}

/** Efficiency = (kills + assists) / max(deaths, 1) when deaths>0 else kills+assists. */
export function trialsEfficiency(block: TrialsStatBlock): number {
  const ka = block.kills + block.assists;
  return block.deaths > 0 ? ka / block.deaths : ka;
}

/**
 * Trials weekend starts Friday 17:00 UTC and ends Tuesday 17:00 UTC.
 * Returns the Friday start of the window that contains `period`.
 */
export function trialsWeekendStart(period: string | Date): Date {
  const d = new Date(period);
  if (Number.isNaN(d.getTime())) return new Date(0);
  const day = d.getUTCDay(); // 0 Sun … 5 Fri
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
  let daysSinceFriday = (day - 5 + 7) % 7;
  if (daysSinceFriday === 0 && hour < 17) {
    daysSinceFriday = 7;
  }
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 17, 0, 0, 0));
  start.setUTCDate(start.getUTCDate() - daysSinceFriday);
  return start;
}

export function trialsWeekendEnd(start: Date): Date {
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 4); // Tuesday 17:00 UTC
  return end;
}

export function trialsWeekendKey(start: Date): string {
  return start.toISOString().slice(0, 10);
}

export function classifyTrialsActivity(a: TrialsHistoryLike): ReturnType<typeof classifyPvp> {
  const game: DestinyGame = a.game === 'D1' ? 'D1' : 'D2';
  const details = a.activityDetails;
  const modes = details?.modes ?? a.modes;
  return classifyPvp({
    game,
    modes,
    mode: details?.mode,
    directorActivityHash: details?.directorActivityHash,
    referenceId: details?.referenceId,
  });
}

/**
 * Aggregate Trials-only stats from stored history rows.
 * Dedupes by game|instanceId. Non-Trials rows are ignored.
 */
export function aggregateTrialsBreakdown(
  activities: TrialsHistoryLike[],
  mapNameFor: (referenceId: string, game: DestinyGame) => string = () => 'Unknown activity'
): TrialsBreakdownDetail {
  const seen = new Set<string>();
  const totals = emptyTrialsStatBlock();
  const bySub = new Map<TrialsSubBucket, TrialsStatBlock>();
  const byWeekend = new Map<
    string,
    TrialsStatBlock & { start: Date; end: Date; mapCounts: Map<string, number>; instanceIds: string[] }
  >();
  let throughDate: string | undefined;
  const instanceIds: string[] = [];

  for (const a of activities) {
    const classified = classifyTrialsActivity(a);
    if (!isTrialsBucket(classified.bucket)) continue;

    const game: DestinyGame = a.game === 'D1' ? 'D1' : 'D2';
    const iid = a.activityDetails?.instanceId;
    const key = pvpActivityKey(game, iid);
    if (iid != null && seen.has(key)) continue;
    if (iid != null) {
      seen.add(key);
      instanceIds.push(String(iid));
    }

    const standing = basicValue(a.values?.standing);
    const win = isVictoryStanding(standing);
    const loss = standing === 1;
    const inc: TrialsStatBlock = {
      matches: 1,
      wins: win ? 1 : 0,
      losses: loss ? 1 : 0,
      kills: basicValue(a.values?.kills),
      deaths: basicValue(a.values?.deaths),
      assists: basicValue(a.values?.assists),
      timeSeconds: durationSeconds(a),
    };
    addTrialsStat(totals, inc);

    const sub = classified.bucket as TrialsSubBucket;
    if (!bySub.has(sub)) bySub.set(sub, emptyTrialsStatBlock());
    addTrialsStat(bySub.get(sub)!, inc);

    if (a.period) {
      if (!throughDate || new Date(a.period).getTime() > new Date(throughDate).getTime()) {
        throughDate = a.period;
      }
      const start = trialsWeekendStart(a.period);
      const wKey = trialsWeekendKey(start);
      if (!byWeekend.has(wKey)) {
        byWeekend.set(wKey, {
          ...emptyTrialsStatBlock(),
          start,
          end: trialsWeekendEnd(start),
          mapCounts: new Map(),
          instanceIds: [],
        });
      }
      const w = byWeekend.get(wKey)!;
      addTrialsStat(w, inc);
      const ref = String(a.activityDetails?.referenceId ?? '');
      const mapName =
        a.mapName ||
        (ref ? mapNameFor(ref, game) : '') ||
        'Unknown activity';
      w.mapCounts.set(mapName, (w.mapCounts.get(mapName) || 0) + 1);
      if (iid != null) w.instanceIds.push(String(iid));
    }
  }

  const subOrder: TrialsSubBucket[] = ['trials-too', 'trials-freelance', 'trials-nine', 'trials-d1'];
  const subRows: TrialsSubRow[] = subOrder
    .filter(b => (bySub.get(b)?.matches ?? 0) > 0)
    .map(b => ({
      bucket: b,
      label: trialsSubBucketLabel(b),
      ...(bySub.get(b) || emptyTrialsStatBlock()),
    }));

  const weekends: TrialsWeekendRow[] = [...byWeekend.entries()]
    .map(([key, w]) => {
      let mapName = 'Unknown activity';
      let best = -1;
      for (const [name, count] of w.mapCounts) {
        if (count > best) {
          best = count;
          mapName = name;
        }
      }
      return {
        key,
        startIso: w.start.toISOString(),
        endIso: w.end.toISOString(),
        mapName,
        instanceIds: w.instanceIds,
        matches: w.matches,
        wins: w.wins,
        losses: w.losses,
        kills: w.kills,
        deaths: w.deaths,
        assists: w.assists,
        timeSeconds: w.timeSeconds,
      };
    })
    .sort((a, b) => new Date(b.startIso).getTime() - new Date(a.startIso).getTime());

  return { totals, subRows, weekends, throughDate, instanceIds };
}

/**
 * Invariant: trialsRuns + crucibleRuns must equal combined legacy PvP runs.
 * Used by unit tests and debug checks.
 */
export function pvpSplitInvariant(trialsRuns: number, crucibleRuns: number, legacyPvpRuns: number): boolean {
  return trialsRuns + crucibleRuns === legacyPvpRuns;
}
