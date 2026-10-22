// @ts-nocheck
/** Activities tab collapse / view preference helpers (CODE_CLEANUP_SPEC). */
import {
  loadCollapsedActivityGames,
  loadCollapsedActivityYears,
  persistActivityCollapseState,
  loadActivitiesViewPreferences,
  persistActivitiesViewPreferences,
} from '../../utils/activities-view-prefs';
import { toggleSetMember } from '../../utils/toggle-set-member';

export function loadActivityCollapseState(c: any): void {
  const storage = typeof localStorage !== 'undefined' ? localStorage : undefined;
  c.collapsedActivityGames = loadCollapsedActivityGames(storage);
  c.collapsedActivityYears = loadCollapsedActivityYears(storage);
}

export function persistActivityCollapseStateFn(c: any): void {
  persistActivityCollapseState(
    typeof localStorage !== 'undefined' ? localStorage : undefined,
    c.collapsedActivityGames,
    c.collapsedActivityYears
  );
}

export function loadActivitiesViewPreferencesFn(c: any): void {
  const prefs = loadActivitiesViewPreferences(
    typeof localStorage !== 'undefined' ? localStorage : undefined
  );
  c.activitiesViewMode = prefs.mode;
  c.activitiesChronologicalSort = prefs.sort;
}

export function persistActivitiesViewPreferencesFn(c: any): void {
  persistActivitiesViewPreferences(
    typeof localStorage !== 'undefined' ? localStorage : undefined,
    c.activitiesViewMode,
    c.activitiesChronologicalSort
  );
}

export function toggleActivityGameCollapsed(c: any, game: 'D1' | 'D2'): void {
  c.collapsedActivityGames = toggleSetMember(c.collapsedActivityGames, game);
  persistActivityCollapseStateFn(c);
  c.refreshActivitiesTabView();
}

export function toggleActivityYearCollapsed(
  c: any,
  game: 'D1' | 'D2',
  year: string
): void {
  const key = c.activityYearCollapseKey(game, year);
  c.collapsedActivityYears = toggleSetMember(c.collapsedActivityYears, key);
  persistActivityCollapseStateFn(c);
  c.refreshActivitiesTabView();
}

export function setActivitiesViewMode(c: any, mode: any): void {
  if (c.activitiesViewMode === mode) return;
  c.activitiesViewMode = mode;
  persistActivitiesViewPreferencesFn(c);
  c.refreshActivitiesTabView();
}

export function setActivitiesChronologicalSort(c: any, sort: any): void {
  if (c.activitiesChronologicalSort === sort) return;
  c.activitiesChronologicalSort = sort;
  persistActivitiesViewPreferencesFn(c);
  c.refreshActivitiesTabView();
}

export function collapseAllActivityYears(c: any): void {
  for (const key of c.collectActivityYearKeys()) {
    c.collapsedActivityYears.add(key);
  }
  persistActivityCollapseStateFn(c);
  c.refreshActivitiesTabView();
}

export function expandAllActivityYears(c: any): void {
  for (const key of c.collectActivityYearKeys()) {
    c.collapsedActivityYears.delete(key);
  }
  persistActivityCollapseStateFn(c);
  c.refreshActivitiesTabView();
}
