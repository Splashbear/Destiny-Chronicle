import { Injectable } from '@angular/core';
import {
  ActivityBreakdownService,
  BreakdownMembershipScope,
} from './activity-breakdown.service';
import { StoredActivity } from './activity-db.service';
import { playerTimePlayedSeconds } from '../utils/player-time-played-seconds';
import { breakdownActivityDedupeKey } from '../utils/breakdown-account-identity';
import {
  buildTimeStoryByYear,
  type TimeStoryByYearResult,
} from '../utils/time-story-by-year';
import type { TimeStoryGroupId } from '../utils/time-story-groups';

/** Lean fields the year chart needs; full activity objects are not kept. */
export interface TimeStoryLeanRow {
  instanceId?: string;
  period?: string;
  group: TimeStoryGroupId | null;
  timeSeconds: number;
}

@Injectable({ providedIn: 'root' })
export class TimeStoryService {
  constructor(private breakdown: ActivityBreakdownService) {}

  async getYearBars(
    scopes: BreakdownMembershipScope[],
    identityByMembership?: Record<string, string>,
    timeZone?: string
  ): Promise<TimeStoryByYearResult> {
    if (!scopes.length) {
      return { years: [], totalSeconds: 0, totalGames: 0 };
    }
    const activities = await this.breakdown.loadScopedActivities(scopes);
    const seen = new Set<string>();
    const lean: TimeStoryLeanRow[] = [];
    for (const activity of activities) {
      const key = breakdownActivityDedupeKey(activity, identityByMembership);
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      const instanceId = activity.activityDetails?.instanceId;
      lean.push({
        instanceId: instanceId != null && String(instanceId) !== '' ? String(instanceId) : undefined,
        period: activity.period,
        timeSeconds: playerTimePlayedSeconds(activity),
        group: this.breakdown.timeStoryGroupForActivity(activity as StoredActivity),
      });
    }
    return buildTimeStoryByYear(lean, row => row.group, timeZone);
  }
}
