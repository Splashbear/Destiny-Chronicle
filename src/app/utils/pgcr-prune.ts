export interface PrunedPgcr {
  id: string;
  period: string;
  mode: number;
  duration: number;
  mapHash: number;
  member?: string; // membershipId of guardian that triggered the fetch (optional)
  teams?: { score: number; standing: number }[];
  players: {
    id: string;      // membershipId
    name: string;
    charId: string;
    class: string;
    kills: number;
    deaths: number;
    assists: number;
    timeSeconds: number;
  }[];
  entries: any[];
}

/**
 * Trim a full Post Game Carnage Report down to just the fields Destiny Chronicle needs
 * so we can store far more entries inside browser-quota-limited IndexedDB.
 */
export function prunePgcr(pgcr: any, requestedMemberId?: string): PrunedPgcr {
  const activity = pgcr?.activityDetails ?? {};
  // D2 has activityDetails.durationSeconds; D1 often only has duration in entries[].values
  const durationFromActivity = activity.durationSeconds;
  const durationFromFirstEntry =
    pgcr?.entries?.[0]?.values?.activityDurationSeconds?.basic?.value ??
    pgcr?.entries?.[0]?.values?.timePlayedSeconds?.basic?.value;
  const duration = durationFromActivity ?? durationFromFirstEntry ?? 0;
  return {
    id:        activity.instanceId?.toString() ?? '',
    period:    pgcr?.period ?? activity.period ?? '',
    mode:      activity.mode ?? 0,
    duration:  typeof duration === 'number' ? duration : 0,
    mapHash:   activity.referenceId ?? 0,
    member:    requestedMemberId,
    teams:     Array.isArray(pgcr.teams)
                  ? pgcr.teams.map((t: any) => ({ score: t.score, standing: t.standing }))
                  : undefined,
    players:   Array.isArray(pgcr.entries)
                  ? pgcr.entries.map((e: any) => ({
                      id:      e.player?.destinyUserInfo?.membershipId ?? '',
                      name:    e.player?.destinyUserInfo?.displayName
                                 ?? e.player?.destinyUserInfo?.bungieGlobalDisplayName
                                 ?? 'Guardian',
                      charId:  e.characterId ?? '',
                      class:   e.player?.characterClass ?? '',
                      kills:   e.values?.kills?.basic?.value ?? 0,
                      deaths:  e.values?.deaths?.basic?.value ?? 0,
                      assists: e.values?.assists?.basic?.value ?? 0,
                      timeSeconds:
                        e.values?.timePlayedSeconds?.basic?.value
                        ?? e.values?.activityDurationSeconds?.basic?.value
                        ?? 0
                    }))
                  : [],
    entries: Array.isArray(pgcr.entries)
                ? pgcr.entries.map((e: any) => ({
                    player: {
                      destinyUserInfo: {
                        membershipId: e.player?.destinyUserInfo?.membershipId ?? ''
                      },
                      characterClass: e.player?.characterClass ?? ''
                    },
                    characterId: e.characterId ?? '',
                    values: {
                      deaths:   { basic: { value: e.values?.deaths?.basic?.value ?? 0 } },
                      kills:    { basic: { value: e.values?.kills?.basic?.value ?? 0 } },
                      assists:  { basic: { value: e.values?.assists?.basic?.value ?? 0 } },
                    }
                  }))
                : []
  };
} 