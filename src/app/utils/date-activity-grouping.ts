import { ActivityWithMembership } from '../models/activity-with-membership.model';
import { gameInstanceKey } from './heatmap-filters';
import { SafeHtml } from '@angular/platform-browser';

/** Working / template type-group used by On this Day cards. */
export interface DateTypeGroup {
  name: string;
  type: string;
  icon: SafeHtml | null;
  activities: ActivityWithMembership[];
  image?: SafeHtml | string | null;
  isD1: boolean;
  seenInstanceIds?: Set<string>;
}

export interface DateYearGroupWorking {
  year: string;
  typeGroups: Map<string, DateTypeGroup>;
}

export interface DateGameGroup {
  game: 'D1' | 'D2';
  yearGroups: Array<{
    year: string;
    typeGroups: DateTypeGroup[];
  }>;
}

export interface DateGroupingNameResolvers {
  getActivityName(referenceId: any, isD1: boolean): string;
  getMappedActivityName(referenceId: string): string | null;
  getActivityType(referenceId: any, mode: any, isD1: boolean): string;
  getBaseActivityName(versionedName: string): string;
  getActivityImage(activity: ActivityWithMembership, isD1: boolean): SafeHtml | string | null;
}

export interface DateGroupingProgress {
  onProgress?(processed: number, total: number): void;
  /** Yield to UI every N activities (default 200) — weak-machine kindness. */
  progressEvery?: number;
}

/**
 * Group filtered date activities by game → year → base activity name,
 * deduping by game+instance across accounts. Pure except optional progress hook.
 */
export function groupActivitiesForDate(
  activities: ActivityWithMembership[],
  resolvers: DateGroupingNameResolvers,
  progress?: DateGroupingProgress
): DateGameGroup[] {
  const total = activities.length;
  if (total === 0) return [];

  const every = progress?.progressEvery ?? 200;
  const gameGroups = new Map<'D1' | 'D2', Map<string, DateYearGroupWorking>>();
  let processedCount = 0;

  for (const activity of activities) {
    const game = activity.game;
    if (!gameGroups.has(game)) {
      gameGroups.set(game, new Map());
    }
    const gameGroup = gameGroups.get(game)!;
    const year = new Date(activity.period).getFullYear().toString();
    if (!gameGroup.has(year)) {
      gameGroup.set(year, { year, typeGroups: new Map() });
    }
    const yearGroup = gameGroup.get(year)!;
    const referenceId = activity.activityDetails?.referenceId;
    const isD1 = activity.game === 'D1';

    let activityName = resolvers.getActivityName(referenceId, isD1);
    if (!activityName || activityName === 'Unknown Activity') {
      activityName = resolvers.getMappedActivityName(String(referenceId)) || 'Unknown Activity';
    }

    const activityType = resolvers.getActivityType(
      referenceId,
      activity.activityDetails?.mode,
      isD1
    );
    const baseActivityName = resolvers.getBaseActivityName(activityName);
    const groupKey = `${baseActivityName}`;

    if (!yearGroup.typeGroups.has(groupKey)) {
      yearGroup.typeGroups.set(groupKey, {
        name: baseActivityName,
        type: activityType,
        isD1,
        image: resolvers.getActivityImage(activity, isD1),
        icon: null,
        activities: [],
        seenInstanceIds: new Set<string>(),
      });
    }
    const typeGroup = yearGroup.typeGroups.get(groupKey)!;
    const instanceId = gameInstanceKey(activity);
    // Deduplicate by game + PGCR instance across platforms/accounts (D1/D2 ids overlap)
    if (instanceId) {
      if (typeGroup.seenInstanceIds!.has(instanceId)) {
        continue; // already included — do not bump processedCount (matches prior behavior)
      }
      typeGroup.seenInstanceIds!.add(instanceId);
    }
    typeGroup.activities.push(activity);

    processedCount++;
    if (every > 0 && processedCount % every === 0) {
      progress?.onProgress?.(processedCount, total);
    }
  }

  for (const yearMap of gameGroups.values()) {
    for (const yearGroup of yearMap.values()) {
      for (const typeGroup of yearGroup.typeGroups.values()) {
        typeGroup.activities.sort(
          (a, b) => new Date(b.period).getTime() - new Date(a.period).getTime()
        );
      }
    }
  }

  return Array.from(gameGroups.entries()).map(([game, years]) => ({
    game,
    yearGroups: Array.from(years.values()).map(yg => ({
      year: yg.year,
      typeGroups: Array.from(yg.typeGroups.values()),
    })),
  }));
}

/** Strip version suffix after ": " (e.g. "Vesper's Host: Master" → "Vesper's Host"). */
export function baseActivityNameFromVersioned(versionedName: string): string {
  const colonIndex = versionedName.indexOf(': ');
  if (colonIndex === -1) return versionedName;
  return versionedName.substring(0, colonIndex);
}
