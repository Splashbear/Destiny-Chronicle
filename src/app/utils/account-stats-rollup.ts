import { getCharacterMinutesPlayed } from './character-profile';
import { PlatformStats } from '../models/platform-stats.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { ActivityHistory } from '../models/activity-history.model';

const ALLOWED_PER_TYPES = [
  'raid',
  'dungeon',
  'strike',
  'nightfall',
  'crucible',
  'gambit',
  'sparrow-racing-league',
  'other',
] as const;

export type PerTypeStats = { [type: string]: { count: number; time: number } };

/** Bucket in-memory activities into per-type count/time for Account Summary. */
export function aggregatePerTypeFromActivities(
  activitiesByKey: { [key: string]: ActivityHistory[] | undefined },
  getActivityType: (referenceId: any, mode: any) => string,
  getDurationSeconds: (act: ActivityHistory) => number
): PerTypeStats {
  const perType: PerTypeStats = {};
  for (const key of Object.keys(activitiesByKey)) {
    const list = activitiesByKey[key] || [];
    for (const act of list) {
      const typeName = getActivityType(act.activityDetails?.referenceId, act.activityDetails?.mode);
      const safeType = (ALLOWED_PER_TYPES as readonly string[]).includes(typeName)
        ? typeName
        : 'other';
      if (!perType[safeType]) perType[safeType] = { count: 0, time: 0 };
      perType[safeType].count++;
      perType[safeType].time += getDurationSeconds(act);
    }
  }
  return perType;
}

export function sumPlaytimeSecondsFromCharacters(
  players: PlayerSearchDisplay[],
  charactersByKey: { [key: string]: any[] | undefined },
  getPlayerKey: (p: PlayerSearchDisplay) => string
): number {
  let totalTime = 0;
  for (const pl of players) {
    const chars = charactersByKey[getPlayerKey(pl)];
    if (!chars || chars.length === 0) continue;
    const minutes = chars.reduce((sum, c) => {
      return sum + getCharacterMinutesPlayed(c, pl.game as 'D1' | 'D2');
    }, 0);
    totalTime += minutes * 60;
  }
  return totalTime;
}

export function totalActivityTimeOrFallback(perType: PerTypeStats, totalTime: number): number {
  const fromActivities = Object.values(perType).reduce((sum, s) => sum + s.time, 0);
  return fromActivities || totalTime;
}

export function countSealsForPlatform(
  aggregatedTitles: any[] | null | undefined,
  displayName: string,
  platform: string
): number {
  if (!aggregatedTitles || aggregatedTitles.length === 0) return 0;
  let seals = 0;
  for (const t of aggregatedTitles) {
    if (t.locked) continue;
    if (
      Array.isArray(t.holders) &&
      t.holders.some((h: any) => h.displayName === displayName && h.platform === platform)
    ) {
      seals++;
    }
  }
  return seals;
}

function pickMostRecentlyPlayedCharacter(chars: any[]): any | undefined {
  if (!chars?.length) return undefined;
  return [...chars].sort((a, b) => {
    const aDate = new Date(
      a.dateLastPlayed || a.dateLastPlayedTime || a.lastPlayed || 0
    ).getTime();
    const bDate = new Date(
      b.dateLastPlayed || b.dateLastPlayedTime || b.lastPlayed || 0
    ).getTime();
    return bDate - aDate;
  })[0];
}

export interface PlatformRollupInput {
  players: PlayerSearchDisplay[];
  charactersByKey: { [key: string]: any[] | undefined };
  aggregatedTitles: any[] | null | undefined;
  activityCountByKey: Map<string, number>; // `${membershipId}|${game}` → count
  getPlayerKey: (p: PlayerSearchDisplay) => string;
  getClassName: (classType: number) => string;
}

/** Build per-account PlatformStats rows (emblem from most recently played character). */
export function rollupPlatformStats(input: PlatformRollupInput): PlatformStats[] {
  const platformStatsMap: { [key: string]: PlatformStats } = {};

  for (const pl of input.players) {
    const platformName = pl.platform;
    const key = `${pl.game}-${platformName}-${pl.membershipId}`;
    const chars = input.charactersByKey[input.getPlayerKey(pl)];
    let time = 0;
    if (chars && chars.length > 0) {
      const minutes = chars.reduce((sum, c) => {
        return sum + getCharacterMinutesPlayed(c, pl.game as 'D1' | 'D2');
      }, 0);
      time = minutes * 60;
    }

    const sealsForPlatform = countSealsForPlatform(
      input.aggregatedTitles,
      pl.displayName,
      pl.platform
    );
    const acts = input.activityCountByKey.get(`${pl.membershipId}|${pl.game}`) ?? 0;

    if (!platformStatsMap[key]) {
      platformStatsMap[key] = {
        accountKey: key,
        platform: platformName,
        game: pl.game as 'D1' | 'D2',
        totalTime: 0,
        totalActivities: 0,
        totalSeals: 0,
      };
    }

    const s = platformStatsMap[key];
    s.totalTime += time;
    s.totalActivities += acts;
    s.totalSeals += sealsForPlatform;

    if (!s.emblemBackground && chars && chars.length > 0) {
      const top = pickMostRecentlyPlayedCharacter(chars);
      if (top) {
        s.emblemBackground = top.emblemBackgroundPath || top.emblemPath || undefined;
        s.emblemIcon = top.emblemPath || undefined;
        s.displayName = pl.displayName;
        if (top.classType !== undefined) {
          s.className = input.getClassName(top.classType);
        }
        s.lightLevel = top.light || top.lightLevel || undefined;
      }
    }
  }

  return Object.values(platformStatsMap).filter(
    s => (s.totalTime || 0) > 0 || (s.totalActivities || 0) > 0
  );
}
