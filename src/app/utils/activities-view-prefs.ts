export type ActivitiesViewMode = 'cards' | 'chronological';
export type ActivitiesChronologicalSort = 'oldest' | 'newest';

export const ACTIVITY_COLLAPSE_GAMES_KEY = 'destiny-chronicle-collapsed-activity-games';
export const ACTIVITY_COLLAPSE_YEARS_KEY = 'destiny-chronicle-collapsed-activity-years';
export const ACTIVITIES_VIEW_MODE_KEY = 'destinyChronicle.activitiesViewMode';
export const ACTIVITIES_CHRON_SORT_KEY = 'destinyChronicle.activitiesChronSort';

export function loadCollapsedActivityGames(storage: Storage | undefined): Set<'D1' | 'D2'> {
  if (!storage) return new Set();
  try {
    const games = storage.getItem(ACTIVITY_COLLAPSE_GAMES_KEY);
    if (!games) return new Set();
    const parsed = JSON.parse(games) as ('D1' | 'D2')[];
    return new Set(parsed.filter(g => g === 'D1' || g === 'D2'));
  } catch {
    return new Set();
  }
}

export function loadCollapsedActivityYears(storage: Storage | undefined): Set<string> {
  if (!storage) return new Set();
  try {
    const years = storage.getItem(ACTIVITY_COLLAPSE_YEARS_KEY);
    if (!years) return new Set();
    return new Set(JSON.parse(years) as string[]);
  } catch {
    return new Set();
  }
}

export function persistActivityCollapseState(
  storage: Storage | undefined,
  games: Set<'D1' | 'D2'>,
  years: Set<string>
): void {
  if (!storage) return;
  storage.setItem(ACTIVITY_COLLAPSE_GAMES_KEY, JSON.stringify([...games]));
  storage.setItem(ACTIVITY_COLLAPSE_YEARS_KEY, JSON.stringify([...years]));
}

export function loadActivitiesViewPreferences(storage: Storage | undefined): {
  mode: ActivitiesViewMode;
  sort: ActivitiesChronologicalSort;
} {
  let mode: ActivitiesViewMode = 'cards';
  /** Match PlayerSearchComponent field default when storage is empty. */
  let sort: ActivitiesChronologicalSort = 'oldest';
  if (!storage) return { mode, sort };
  try {
    const m = storage.getItem(ACTIVITIES_VIEW_MODE_KEY);
    if (m === 'cards' || m === 'chronological') mode = m;
    const s = storage.getItem(ACTIVITIES_CHRON_SORT_KEY);
    if (s === 'oldest' || s === 'newest') sort = s;
  } catch {
    // ignore
  }
  return { mode, sort };
}

export function persistActivitiesViewPreferences(
  storage: Storage | undefined,
  mode: ActivitiesViewMode,
  sort: ActivitiesChronologicalSort
): void {
  if (!storage) return;
  storage.setItem(ACTIVITIES_VIEW_MODE_KEY, mode);
  storage.setItem(ACTIVITIES_CHRON_SORT_KEY, sort);
}
