/** Dossier header numbers that all share the account-card selection scope. */

export interface DossierHeaderPlatformRow {
  accountKey: string;
  totalTime: number;
  totalActivities: number;
  totalSeals: number;
}

export interface DossierHeaderStatsInput {
  /** Per-card rollups (canonical accountKey). */
  platformStats: DossierHeaderPlatformRow[];
  /** Empty = all cards (same rule as siteAccountFilterKeys). */
  selectedAccountKeys: string[];
  /** Unique-instance in-activity seconds for the scoped accounts. */
  activeSeconds: number;
  /** True when some scoped D1 rows still lack duration after cache backfill. */
  activeDurationIncomplete: boolean;
  /** True while scoped activity history is still writing. */
  historySyncInProgress: boolean;
  /** True while Bungie profile/character rollup is still pending. */
  accountStatsPending: boolean;
  /** Bungie character minutes→seconds by class for scoped accounts. */
  classSeconds: { Hunter: number; Titan: number; Warlock: number };
  /** At least one scoped account has character rows loaded. */
  haveCharacters: boolean;
  formatSeconds: (totalSeconds: number) => string;
}

export interface DossierHeaderStats {
  activeLabel: string;
  socialLabel: string;
  activityCountLabel: string;
  sealCountLabel: string;
  classTimes: Array<{ name: 'Hunter' | 'Titan' | 'Warlock'; label: string }>;
  /** Sum of scoped card played times (Bungie character minutes). */
  playedSeconds: number;
  /** Tooltip extras when Active is a lower bound / Orbit is an upper bound. */
  activeTitleExtra: string;
  socialTitleExtra: string;
  classTimesTitle: string;
  selectionNarrowed: boolean;
}

/** Filter platform cards to the header selection (empty keys = all). */
export function scopedPlatformStats<T extends DossierHeaderPlatformRow>(
  platformStats: T[],
  selectedAccountKeys: string[]
): T[] {
  if (!selectedAccountKeys.length) return platformStats || [];
  const set = new Set(selectedAccountKeys);
  return (platformStats || []).filter(row => set.has(row.accountKey));
}

export function buildDossierHeaderStats(input: DossierHeaderStatsInput): DossierHeaderStats {
  const scoped = scopedPlatformStats(input.platformStats, input.selectedAccountKeys);
  const selectionNarrowed = input.selectedAccountKeys.length > 0;
  const playedSeconds = scoped.reduce((sum, row) => sum + (Number(row.totalTime) || 0), 0);
  const activities = scoped.reduce((sum, row) => sum + (Number(row.totalActivities) || 0), 0);
  const seals = scoped.reduce((sum, row) => sum + (Number(row.totalSeals) || 0), 0);

  const historyPending = !!input.historySyncInProgress;
  const activeSeconds = Math.max(0, Number(input.activeSeconds) || 0);
  const incomplete = !!input.activeDurationIncomplete && activeSeconds > 0;

  let activeLabel = '—';
  let socialLabel = '—';
  let activityCountLabel = '—';
  let activeTitleExtra = '';
  let socialTitleExtra = '';

  if (!historyPending) {
    activityCountLabel = activities.toLocaleString();

    if (activeSeconds > 0 || incomplete) {
      const formatted = input.formatSeconds(activeSeconds);
      activeLabel = incomplete ? `≥ ${formatted}` : formatted;
      if (incomplete) {
        activeTitleExtra =
          'Some Destiny 1 activity durations are still unknown, so this is a lower bound.';
      }
    }

    if (playedSeconds > 0 && (activeSeconds > 0 || incomplete)) {
      const orbit = Math.max(0, playedSeconds - activeSeconds);
      const formatted = input.formatSeconds(orbit);
      if (incomplete) {
        // Missing Active time must not inflate Orbit — show an upper bound instead.
        socialLabel = `≤ ${formatted}`;
        socialTitleExtra =
          'Upper bound: unknown Destiny 1 activity time is not counted as orbit.';
      } else if (activeSeconds > 0) {
        socialLabel = formatted;
      }
    }
  }

  let sealCountLabel = String(seals);
  if (!scoped.length && input.accountStatsPending) {
    sealCountLabel = '—';
  }

  const classPending = !input.haveCharacters && input.accountStatsPending;
  const classTimes = (['Hunter', 'Titan', 'Warlock'] as const).map(name => ({
    name,
    label: classPending ? '—' : input.formatSeconds(input.classSeconds[name] || 0),
  }));

  const classTimesTitle = selectionNarrowed
    ? 'Bungie character playtime by class for the highlighted accounts (includes orbit).'
    : 'Bungie character playtime by class, summed across every searched account (includes orbit).';

  return {
    activeLabel,
    socialLabel,
    activityCountLabel,
    sealCountLabel,
    classTimes,
    playedSeconds,
    activeTitleExtra,
    socialTitleExtra,
    classTimesTitle,
    selectionNarrowed,
  };
}
