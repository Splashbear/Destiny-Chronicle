// @ts-nocheck
/** ActivityHistoryLoadHost method bodies extracted from PlayerSearchComponent (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { activityCountStatusMessage } from '../../utils/activity-count-status-message';

export function build_setCharacterActivityLoading(
  c: any,
  loadingKey: string,
  loading: boolean
): void {
  c.loadingActivities[loadingKey] = loading;
}

export function build_setCharacterActivityError(
  c: any,
  loadingKey: string,
  message: string
): void {
  c.error[loadingKey] = message;
}

export function build_beginCharacterActivityFetch(c: any, character: any) {
  const accountKey = c.getPlayerKey(character);
  const existingStatus = accountKey
    ? c.accountLoadingStatus.get(accountKey)
    : undefined;
  if (character.game && existingStatus && accountKey) {
    c.updateAccountLoadingStatus(
      accountKey,
      existingStatus.displayName,
      existingStatus.platform,
      character.game,
      character.membershipType,
      'fetching-activities',
      `Fetching ${character.game} activities for ${existingStatus.displayName}...`
    );
  }
  if (accountKey && existingStatus) {
    return {
      accountKey,
      displayName: existingStatus.displayName,
      platform: existingStatus.platform,
    };
  }
  return undefined;
}

export function build_reportActivityCountDelta(
  c: any,
  accountKey: string,
  displayName: string,
  platform: string,
  game: 'D1' | 'D2',
  membershipType: number,
  delta: number,
  isDone: boolean
): void {
  const prev = c.activityCountByAccount.get(accountKey) ?? 0;
  const count = prev + delta;
  c.activityCountByAccount.set(accountKey, count);
  const msg = activityCountStatusMessage({
    count,
    isDone,
    game,
    displayName,
    platform,
  });
  c.updateAccountLoadingStatus(
    accountKey,
    displayName,
    platform,
    game,
    membershipType,
    'fetching-activities',
    msg
  );
  c.cdr.detectChanges();
}

export function build_refreshFilteredViewIfNeeded(
  c: any,
  newActivities: any[]
): void {
  if (
    c.selectedDate &&
    newActivities.some((act) => c.isActivityOnSelectedDate(act))
  ) {
    const cacheKey = `filtered-${c.selectedDate}-${c.selectedActivityType.label}`;
    const entry = c.filteredActivitiesCache.get(cacheKey);
    if (entry) {
      entry.dirty = true;
    }
    c.loadAllFilteredActivities(true, false);
  }
}

export function build_tryShowInitialDisplay(c: any, activities: any[]): void {
  if (!c.initialDisplayShown) {
    const foundToday = activities.some((act) =>
      c.isActivityOnSelectedDate(act)
    );
    if (foundToday) {
      c.initialDisplayShown = true;
      c.loadAllFilteredActivities(true, false);
    }
  }
}

export function build_updateLoadingProgress(
  c: any,
  phase: any,
  current: number,
  total: number,
  message: string
): void {
  if (c.loadingProgress) {
    Object.assign(c.loadingProgress, { phase, current, total, message });
  } else {
    c.loadingProgress = { phase, current, total, message };
  }
  c.cdr.detectChanges();
}
