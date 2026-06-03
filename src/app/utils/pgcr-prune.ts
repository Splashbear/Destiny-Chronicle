import { resolvePgcrPlayerName } from './pgcr-player-name';

export interface PrunedPgcr {
  id: string;
  period: string;
  mode: number;
  duration: number;
  mapHash: number;
  member?: string;
  teams?: { score: number; standing: number }[];
  players: {
    id: string;
    name: string;
    charId: string;
    class: string;
    kills: number;
    deaths: number;
    assists: number;
    timeSeconds: number;
    /** D1: values.team — used to filter fireteam in the Activities popup. */
    team?: number;
  }[];
  entries: any[];
}

export function resolvePgcrPeriod(
  pgcr: { period?: string; activityDetails?: { period?: string } } | null | undefined
): string {
  const body = unwrapD1PgcrBody(pgcr);
  return body?.period ?? body?.activityDetails?.period ?? '';
}

/** D1 PGCR API returns the report under `Response.data`, not on `Response` directly. */
export function unwrapD1PgcrBody(pgcr: unknown): any {
  if (!pgcr || typeof pgcr !== 'object') {
    return pgcr;
  }
  const wrapper = pgcr as { data?: unknown; entries?: unknown; period?: unknown };
  const inner = wrapper.data;
  if (
    inner &&
    typeof inner === 'object' &&
    (Array.isArray((inner as { entries?: unknown }).entries) ||
      (inner as { period?: unknown }).period != null ||
      (inner as { activityDetails?: unknown }).activityDetails != null)
  ) {
    return inner;
  }
  return pgcr;
}

export function normalizePgcrPeriodKey(period?: string): string {
  const raw = period?.trim();
  if (!raw) {
    return '';
  }
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    return raw;
  }
  return new Date(ms).toISOString();
}

/** D1 activity history vs PGCR timestamps can differ slightly; wrong-year PGCRs differ by years. */
export function pgcrPeriodMatches(
  expected?: string,
  actual?: string,
  toleranceMs = 120_000
): boolean {
  if (!expected || !actual) {
    return true;
  }
  const expectedMs = Date.parse(normalizePgcrPeriodKey(expected));
  const actualMs = Date.parse(normalizePgcrPeriodKey(actual));
  if (Number.isNaN(expectedMs) || Number.isNaN(actualMs)) {
    return true;
  }
  return Math.abs(expectedMs - actualMs) <= toleranceMs;
}

export function pgcrPeriodMatchesForD1(expected?: string, actual?: string): boolean {
  return pgcrPeriodMatches(expected, actual, 3_600_000);
}

export function d1PgcrCacheKey(instanceId: string, period: string): string {
  const id = String(instanceId);
  const p = normalizePgcrPeriodKey(period);
  if (!p) {
    return id;
  }
  return `d1|${id}|${p}`;
}

export function isUsablePrunedPgcr(pgcr: PrunedPgcr | null | undefined): boolean {
  if (!pgcr) {
    return false;
  }
  return extractPrunedPlayers(pgcr).some(p => !!(p.id || p.name));
}

export function extractPrunedPlayers(
  pgcr: PrunedPgcr | { players?: PrunedPgcr['players']; entries?: any[] }
): PrunedPgcr['players'] {
  if (Array.isArray(pgcr.players) && pgcr.players.length > 0) {
    return pgcr.players;
  }
  if (!Array.isArray(pgcr.entries) || pgcr.entries.length === 0) {
    return [];
  }
  return pgcr.entries.map(mapEntryToPlayer);
}

export interface PrunePgcrOptions {
  isD1?: boolean;
  /** When true with membershipId, only keep fireteam entries (Played With prefetch should leave false). */
  fireteamOnly?: boolean;
}

export function isD1PgcrShape(pgcr: any): boolean {
  const activity = pgcr?.activityDetails ?? {};
  return activity.durationSeconds === undefined && Array.isArray(pgcr?.entries);
}

export function filterToFireteamEntries(entries: any[], anchorMembershipId?: string): any[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const anchor =
    anchorMembershipId
      ? entries.find(
          e => String(e.player?.destinyUserInfo?.membershipId ?? '') === String(anchorMembershipId)
        )
      : undefined;
  const anchorEntry = anchor ?? entries[0];
  if (!anchorEntry) {
    return entries;
  }

  const teamVal = anchorEntry.values?.team?.basic?.value;
  let filtered = entries;

  if (teamVal !== undefined && teamVal !== null) {
    const byTeam = entries.filter(e => e.values?.team?.basic?.value === teamVal);
    if (byTeam.length > 0) {
      filtered = byTeam;
    }
  }

  const anchorTime =
    anchorEntry.values?.timePlayedSeconds?.basic?.value
    ?? anchorEntry.values?.activityDurationSeconds?.basic?.value
    ?? 0;

  if (filtered.length > 6 && anchorTime > 0) {
    const threshold = Math.max(60, anchorTime * 0.25);
    const byTime = filtered.filter(e => {
      const t =
        e.values?.timePlayedSeconds?.basic?.value
        ?? e.values?.activityDurationSeconds?.basic?.value
        ?? 0;
      return t >= threshold;
    });
    if (byTime.length > 0) {
      filtered = byTime;
    }
  }

  if (filtered.length > 6) {
    const anchorId = anchorEntry.player?.destinyUserInfo?.membershipId;
    const sorted = [...filtered].sort((a, b) => {
      const ta =
        a.values?.timePlayedSeconds?.basic?.value
        ?? a.values?.activityDurationSeconds?.basic?.value
        ?? 0;
      const tb =
        b.values?.timePlayedSeconds?.basic?.value
        ?? b.values?.activityDurationSeconds?.basic?.value
        ?? 0;
      return tb - ta;
    });
    const keep = new Set<any>();
    for (const e of sorted) {
      if (keep.size >= 6) {
        break;
      }
      keep.add(e);
    }
    if (anchorId) {
      const anchorInList = sorted.find(
        e => String(e.player?.destinyUserInfo?.membershipId ?? '') === String(anchorId)
      );
      if (anchorInList) {
        keep.add(anchorInList);
      }
    }
    filtered = [...keep];
  }

  return filtered.length > 0 ? filtered : [anchorEntry];
}

function mapEntryToPlayer(e: any) {
  const teamRaw = e.values?.team?.basic?.value;
  return {
    id: e.player?.destinyUserInfo?.membershipId ?? '',
    name: resolvePgcrPlayerName(e.player?.destinyUserInfo),
    charId: e.characterId ?? '',
    class: e.player?.characterClass ?? '',
    kills: e.values?.kills?.basic?.value ?? 0,
    deaths: e.values?.deaths?.basic?.value ?? 0,
    assists: e.values?.assists?.basic?.value ?? 0,
    timeSeconds:
      e.values?.timePlayedSeconds?.basic?.value
      ?? e.values?.activityDurationSeconds?.basic?.value
      ?? 0,
    team: teamRaw !== undefined && teamRaw !== null ? Number(teamRaw) : undefined,
  };
}

function mapEntryToLiteEntry(e: any) {
  return {
    player: {
      destinyUserInfo: {
        membershipId: e.player?.destinyUserInfo?.membershipId ?? '',
        displayName: e.player?.destinyUserInfo?.displayName,
        bungieGlobalDisplayName: e.player?.destinyUserInfo?.bungieGlobalDisplayName,
        bungieGlobalDisplayNameCode: e.player?.destinyUserInfo?.bungieGlobalDisplayNameCode,
      },
      characterClass: e.player?.characterClass ?? '',
    },
    characterId: e.characterId ?? '',
    values: {
      deaths: { basic: { value: e.values?.deaths?.basic?.value ?? 0 } },
      kills: { basic: { value: e.values?.kills?.basic?.value ?? 0 } },
      assists: { basic: { value: e.values?.assists?.basic?.value ?? 0 } },
      team: e.values?.team,
    },
  };
}

export function prunePgcr(
  pgcr: any,
  requestedMemberId?: string,
  options?: PrunePgcrOptions
): PrunedPgcr {
  const source = unwrapD1PgcrBody(pgcr);
  const isD1 = options?.isD1 ?? isD1PgcrShape(source);
  const activity = source?.activityDetails ?? {};
  const durationFromActivity = activity.durationSeconds;
  const durationFromFirstEntry =
    source?.entries?.[0]?.values?.activityDurationSeconds?.basic?.value
    ?? source?.entries?.[0]?.values?.timePlayedSeconds?.basic?.value;
  const duration = durationFromActivity ?? durationFromFirstEntry ?? 0;

  let entries: any[] = Array.isArray(source.entries) ? source.entries : [];
  if (isD1 && options?.fireteamOnly && entries.length > 0) {
    entries = filterToFireteamEntries(entries, requestedMemberId);
  }

  return {
    id: activity.instanceId?.toString() ?? '',
    period: source?.period ?? activity.period ?? '',
    mode: activity.mode ?? 0,
    duration: typeof duration === 'number' ? duration : 0,
    mapHash: activity.referenceId ?? 0,
    member: requestedMemberId,
    teams: Array.isArray(source.teams)
      ? source.teams.map((t: any) => ({ score: t.score, standing: t.standing }))
      : undefined,
    players: entries.map(mapEntryToPlayer),
    entries: entries.map(mapEntryToLiteEntry),
  };
}

/** Filter pruned players to the anchor guardian's D1 fireteam (display-time only). */
export function filterPrunedPlayersToFireteam(
  players: PrunedPgcr['players'],
  membershipId: string
): PrunedPgcr['players'] {
  if (!players.length) {
    return players;
  }
  const anchor = players.find(p => String(p.id) === String(membershipId));
  if (!anchor) {
    return players;
  }
  const team = anchor.team;
  let filtered = players;
  if (team !== undefined && team !== null) {
    const withTeam = players.filter(
      p => p.team === team || (p.team === undefined && team === 0)
    );
    if (withTeam.length > 0) {
      filtered = withTeam;
    }
  }
  if (filtered.length > 6 && anchor.timeSeconds > 0) {
    const threshold = Math.max(60, anchor.timeSeconds * 0.25);
    const byTime = filtered.filter(p => p.timeSeconds >= threshold);
    if (byTime.length > 0) {
      filtered = byTime;
    }
  }
  if (filtered.length > 6) {
    const sorted = [...filtered].sort((a, b) => b.timeSeconds - a.timeSeconds);
    const top = sorted.slice(0, 6);
    if (!top.some(p => String(p.id) === String(membershipId))) {
      top.push(anchor);
    }
    filtered = top;
  }
  return filtered.length > 0 ? filtered : [anchor];
}
