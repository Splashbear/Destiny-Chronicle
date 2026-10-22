import { Injectable } from '@angular/core';
import { ActivityWithMembership } from '../models/activity-with-membership.model';
import {
  DateGameGroup,
  DateGroupingNameResolvers,
  groupActivitiesForDate,
} from '../utils/date-activity-grouping';

/**
 * Host for On this Day process/group phase (CODE_CLEANUP_SPEC).
 * Preserves progress ticks every 200 rows + detectChanges for weak machines.
 */
export interface DateActivityGroupingHost extends DateGroupingNameResolvers {
  getFilteredActivitiesForDate(): ActivityWithMembership[];
  setGroupedActivitiesByAccount(groups: DateGameGroup[]): void;
  clearFirstEverActivity(): void;
  setFirstEverActivityFromDb(): Promise<void>;
  updateLoadingProgress(
    phase: 'process',
    current: number,
    total: number,
    message: string
  ): void;
  detectChanges(): void;
}

/**
 * Process + group filtered activities for the selected date.
 * Extracted from PlayerSearchComponent.processAndGroupActivities.
 */
@Injectable({ providedIn: 'root' })
export class DateActivityGroupingService {
  async processAndGroupActivities(
    host: DateActivityGroupingHost,
    progressMessage?: string
  ): Promise<void> {
    const activities = host.getFilteredActivitiesForDate();
    const totalToProcess = activities.length;
    if (totalToProcess === 0) {
      host.setGroupedActivitiesByAccount([]);
      host.clearFirstEverActivity();
      host.detectChanges();
      await host.setFirstEverActivityFromDb();
      return;
    }

    const processLabel = progressMessage ?? 'Processing activities…';
    host.updateLoadingProgress('process', 0, totalToProcess, processLabel);

    const grouped = groupActivitiesForDate(
      activities,
      {
        getActivityName: (ref, isD1) => host.getActivityName(ref, isD1),
        getMappedActivityName: ref => host.getMappedActivityName(ref),
        getActivityType: (ref, mode, isD1) => host.getActivityType(ref, mode, isD1),
        getBaseActivityName: name => host.getBaseActivityName(name),
        getActivityImage: (a, isD1) => host.getActivityImage(a, isD1),
      },
      {
        progressEvery: 200,
        onProgress: (processed, total) => {
          const pct = ((processed / total) * 100).toFixed(0);
          host.updateLoadingProgress(
            'process',
            processed,
            total,
            progressMessage
              ? `${progressMessage} (${pct}%)`
              : `Processing activities (${pct}%)…`
          );
          host.detectChanges();
        },
      }
    );

    host.updateLoadingProgress(
      'process',
      totalToProcess,
      totalToProcess,
      progressMessage ?? 'Processing complete'
    );
    host.setGroupedActivitiesByAccount(grouped);
    host.detectChanges();
    await host.setFirstEverActivityFromDb();
  }
}
