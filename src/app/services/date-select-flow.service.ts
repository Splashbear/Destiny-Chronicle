import { Injectable } from '@angular/core';
import { ActivityWithMembership } from '../models/activity-with-membership.model';

/** Host for calendar date change + instant cache paint (CODE_CLEANUP_SPEC). */
export interface DateSelectFlowHost {
  getSelectedYear(): number;
  setSelectedYear(year: number): void;
  getSelectedMonth(): number;
  setSelectedMonth(month: number): void;
  getSelectedDay(): number;
  setSelectedDay(day: number): void;
  getSelectedDate(): string;
  setSelectedDate(date: string): void;
  bumpLoadToken(): void;
  setInitialDisplayShown(shown: boolean): void;
  clearFilteredActivitiesForDate(): void;
  clearGroupedActivitiesByAccount(): void;
  clearFilteredActivitiesCache(): void;
  updateUrlForPermalink(): void;
  clearAccountLoadingStatuses(): void;
  getSelectedPlayersLength(): number;
  setDateActivityLoading(loading: boolean): void;
  updateLoadingProgress(
    phase: 'fetch',
    current: number,
    total: number,
    message: string
  ): void;
  detectChanges(): void;
  loadAllFilteredActivities(force?: boolean): Promise<void>;
  getActivitiesMap(): { [playerKey: string]: ActivityWithMembership[] };
  filterActivitiesByDate(
    activities: ActivityWithMembership[],
    date: string
  ): ActivityWithMembership[];
  formatActivitiesForDisplay(map: {
    [playerKey: string]: ActivityWithMembership[];
  }): ActivityWithMembership[];
  setFilteredActivitiesForDate(list: ActivityWithMembership[]): void;
  computeAccountStats(): void;
}

/**
 * Date picker change: same-day refresh vs full reset + optional instant cache paint.
 */
@Injectable({ providedIn: 'root' })
export class DateSelectFlowService {
  async onDateSelect(
    host: DateSelectFlowHost,
    month: string,
    day: string
  ): Promise<void> {
    const newMonth = parseInt(month, 10);
    const newDay = parseInt(day, 10);
    if (!newMonth || !newDay) {
      return;
    }

    const selectedYear = host.getSelectedYear() || new Date().getFullYear();
    host.setSelectedYear(selectedYear);
    const paddedMonth = String(newMonth).padStart(2, '0');
    const paddedDay = String(newDay).padStart(2, '0');
    const newSelectedDate = `${selectedYear}-${paddedMonth}-${paddedDay}`;

    const sameDate =
      host.getSelectedMonth() === newMonth &&
      host.getSelectedDay() === newDay &&
      host.getSelectedDate() === newSelectedDate;
    if (sameDate) {
      await host.loadAllFilteredActivities(true);
      return;
    }

    host.bumpLoadToken();
    host.setInitialDisplayShown(false);
    host.clearFilteredActivitiesForDate();
    host.clearGroupedActivitiesByAccount();
    host.clearFilteredActivitiesCache();
    host.setSelectedMonth(newMonth);
    host.setSelectedDay(newDay);
    host.setSelectedDate(newSelectedDate);
    host.updateUrlForPermalink();
    host.clearAccountLoadingStatuses();

    if (host.getSelectedPlayersLength() > 0) {
      await this.showInstantDateChange(host);
    } else {
      host.setDateActivityLoading(true);
      host.updateLoadingProgress(
        'fetch',
        0,
        1,
        'Loading activities for selected date…'
      );
      host.detectChanges();
    }

    try {
      await host.loadAllFilteredActivities();
    } catch (error) {
      console.error('Error loading activities for date:', error);
    } finally {
      host.setDateActivityLoading(false);
      host.detectChanges();
    }
  }

  async showInstantDateChange(host: DateSelectFlowHost): Promise<void> {
    try {
      const newFilteredActivities: { [playerKey: string]: ActivityWithMembership[] } =
        {};
      let hasAnyActivities = false;
      const activitiesMap = host.getActivitiesMap();
      const selectedDate = host.getSelectedDate();

      for (const playerKey in activitiesMap) {
        const playerActivities = activitiesMap[playerKey] || [];
        const dateFilteredActivities = host.filterActivitiesByDate(
          playerActivities,
          selectedDate
        );
        if (dateFilteredActivities.length > 0) {
          newFilteredActivities[playerKey] = dateFilteredActivities;
          hasAnyActivities = true;
        }
      }

      if (hasAnyActivities) {
        host.setFilteredActivitiesForDate(
          host.formatActivitiesForDisplay(newFilteredActivities)
        );
        host.computeAccountStats();
        host.setDateActivityLoading(false);
        host.detectChanges();
        console.log(`Instantly displayed cached activities for ${selectedDate}`);
      } else {
        host.setDateActivityLoading(true);
        host.updateLoadingProgress(
          'fetch',
          0,
          1,
          'Loading activities for selected date…'
        );
        host.detectChanges();
      }
    } catch (error) {
      console.error('Error showing instant date change:', error);
      host.setDateActivityLoading(true);
      host.detectChanges();
    }
  }
}
