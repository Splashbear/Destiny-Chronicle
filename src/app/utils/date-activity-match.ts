import { ActivityHistory } from '../models/activity-history.model';
import { ActivityWithMembership } from '../models/activity-with-membership.model';
import { isD1RaidReferenceId } from '../config/d1-raid-reference-ids';

/** Filter activities by YYYY-MM-DD month/day (all years) (CODE_CLEANUP_SPEC). */
export function filterActivitiesByMonthDay<T extends { period: string }>(
  activities: T[],
  targetDate: string
): T[] {
  const [, targetMonth, targetDay] = targetDate.split('-');
  return activities.filter((activity) => {
    const activityDate = new Date(activity.period);
    const activityMonth = (activityDate.getMonth() + 1)
      .toString()
      .padStart(2, '0');
    const activityDay = activityDate.getDate().toString().padStart(2, '0');
    return activityMonth === targetMonth && activityDay === targetDay;
  });
}

export function flattenAndSortActivitiesByPeriod(
  filteredActivities: Record<string, ActivityWithMembership[]>
): ActivityWithMembership[] {
  const allActivities: ActivityWithMembership[] = [];
  for (const playerKey in filteredActivities) {
    allActivities.push(...filteredActivities[playerKey]);
  }
  return allActivities.sort(
    (a, b) => new Date(b.period).getTime() - new Date(a.period).getTime()
  );
}

export function isActivityOnMonthDay(
  activity: ActivityHistory,
  selectedMonth: number,
  selectedDay: number
): boolean {
  if (!activity.period || !selectedMonth || !selectedDay) return false;
  const activityDate = new Date(activity.period);
  const activityMonth = activityDate.getMonth() + 1;
  const activityDay = activityDate.getDate();
  return activityMonth === selectedMonth && activityDay === selectedDay;
}

export function isD1ActivityByReferenceId(
  activity: ActivityHistory
): boolean {
  const refId = activity.activityDetails?.referenceId;
  if (!refId) return false;
  const refIdStr = String(refId);
  return (
    isD1RaidReferenceId(refIdStr) || parseInt(refIdStr, 10) < 1000000000
  );
}

export interface ValidatedSelectedDate {
  selectedDate: string;
  selectedMonth: number;
  selectedDay: number;
  selectedYear: number;
}

/** Parse MM-DD or YYYY-MM-DD and clamp future dates to today. */
export function validateSelectedDateString(
  dateStr: string
): ValidatedSelectedDate | null {
  const dateParts = dateStr.split('-').map(Number);
  let month: number, day: number, year: number;

  if (dateParts.length === 2) {
    [month, day] = dateParts;
    year = new Date().getFullYear();
  } else if (dateParts.length === 3) {
    [year, month, day] = dateParts;
  } else {
    console.warn('[DateFilter] Invalid date format:', dateStr);
    return null;
  }

  const selectedDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (selectedDate > today) {
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();
    return {
      selectedDate: `${todayYear}-${todayMonth
        .toString()
        .padStart(2, '0')}-${todayDay.toString().padStart(2, '0')}`,
      selectedMonth: todayMonth,
      selectedDay: todayDay,
      selectedYear: todayYear,
    };
  }

  return {
    selectedDate: `${year}-${month.toString().padStart(2, '0')}-${day
      .toString()
      .padStart(2, '0')}`,
    selectedMonth: month,
    selectedDay: day,
    selectedYear: year,
  };
}
