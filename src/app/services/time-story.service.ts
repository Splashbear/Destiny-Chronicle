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
    const unique: StoredActivity[] = [];
    const seen = new Set<string>();
    for (const activity of activities) {
      const key = breakdownActivityDedupeKey(activity, identityByMembership);
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      unique.push(activity);
    }
    return buildTimeStoryByYear(
      unique.map(activity => ({
        period: activity.period,
        timeSeconds: playerTimePlayedSeconds(activity),
        activity,
      })),
      activity => this.breakdown.timeStoryGroupForActivity(activity as unknown as StoredActivity),
      timeZone
    );
  }
}
