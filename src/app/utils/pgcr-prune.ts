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
    charId: string;
    class: string;
    kills: number;
    deaths: number;
    assists: number;
  }[];
  entries: any[];
}

/**
 * Trim a full Post Game Carnage Report down to just the fields Destiny Chronicle needs
 * so we can store far more entries inside browser-quota-limited IndexedDB.
 */
export function prunePgcr(pgcr: any, requestedMemberId?: string): PrunedPgcr {
  const activity = pgcr?.activityDetails ?? {};
  return {
    id:        activity.instanceId?.toString() ?? '',
    period:    activity.period ?? '',
    mode:      activity.mode ?? 0,
    duration:  activity.durationSeconds ?? 0,
    mapHash:   activity.referenceId ?? 0,
    member:    requestedMemberId,
    teams:     Array.isArray(pgcr.teams)
                  ? pgcr.teams.map((t: any) => ({ score: t.score, standing: t.standing }))
                  : undefined,
    players:   Array.isArray(pgcr.entries)
                  ? pgcr.entries.map((e: any) => ({
                      id:      e.player?.destinyUserInfo?.membershipId ?? '',
                      charId:  e.characterId ?? '',
                      class:   e.player?.characterClass ?? '',
                      kills:   e.values?.kills?.basic?.value ?? 0,
                      deaths:  e.values?.deaths?.basic?.value ?? 0,
                      assists: e.values?.assists?.basic?.value ?? 0
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