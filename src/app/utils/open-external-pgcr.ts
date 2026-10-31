import { ActivityHistory } from '../models/activity-history.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';

export interface OpenExternalPgcrDeps {
  selectedPlayers: PlayerSearchDisplay[];
  activeTab: string;
  getActivityName(activity: ActivityHistory, isD1: boolean): string;
  openPgcrLiteFromActivity(
    activity: ActivityHistory,
    isD1: boolean,
    name: string
  ): void;
  openFullPgcrInNewTab(instanceId: string | number, isD1: boolean): void;
}

/**
 * Open PGCR lite modal or full PGCR tab from an activity row (CODE_CLEANUP_SPEC).
 */
export function openExternalPgcr(
  activity: ActivityHistory,
  isD1: boolean,
  event: MouseEvent | undefined,
  deps: OpenExternalPgcrDeps
): void {
  event?.preventDefault();
  event?.stopPropagation();
  const instanceId = activity.activityDetails?.instanceId;
  if (!instanceId) return;
  const row = activity as ActivityHistory & {
    membershipId?: string;
    displayName?: string;
  };
  if (row.membershipId && !row.displayName) {
    const match = deps.selectedPlayers.find(
      (player) =>
        String(player.membershipId) === String(row.membershipId) &&
        (!activity.game || player.game === activity.game)
    );
    if (match) {
      row.displayName = match.displayName;
    }
  }
  const d1 =
    activity.game === 'D1' ? true : activity.game === 'D2' ? false : isD1;
  if (
    deps.activeTab === 'activities' ||
    deps.activeTab === 'firsts' ||
    deps.activeTab === 'breakdown'
  ) {
    deps.openPgcrLiteFromActivity(
      activity,
      d1,
      deps.getActivityName(activity, d1)
    );
    return;
  }
  deps.openFullPgcrInNewTab(instanceId, d1);
}

export function openFullPgcrInNewTab(
  instanceId: string | number,
  isD1: boolean
): void {
  const game = isD1 ? 'destiny1' : 'destiny2';
  window.open(
    `https://pgcr.eververse.trade/${game}/${instanceId}`,
    '_blank',
    'noopener'
  );
}

/** Open PGCR from a Guardian Firsts row (CODE_CLEANUP_SPEC). */
export function openExternalPgcrForFirst(
  first: { instanceId?: string | number; game?: string },
  activeTab: string,
  openLite: () => void,
  openFull: (instanceId: string | number, isD1: boolean) => void
): void {
  if (!first.instanceId) return;
  const isD1 = first.game === 'D1';
  if (activeTab === 'firsts') {
    openLite();
    return;
  }
  openFull(first.instanceId, isD1);
}
