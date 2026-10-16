/** Identity shared by the full On this Day list and the text view. */
export interface DayActivityIdentity {
  instanceId: string;
  period: string;
  membershipId: string;
}

export function dayActivityKey(row: DayActivityIdentity): string {
  return `${row.membershipId}|${row.instanceId}|${row.period}`;
}

/** First N pages of a list. Order is unchanged, so a full window matches the source. */
export function windowRows<T>(rows: T[], pageSize: number, pages: number): T[] {
  const count = Math.max(0, pageSize) * Math.max(0, pages);
  return rows.slice(0, count);
}

export function sameDayRows(full: DayActivityIdentity[], text: DayActivityIdentity[]): boolean {
  if (full.length !== text.length) {
    return false;
  }
  return full.every((row, i) => dayActivityKey(row) === dayActivityKey(text[i]));
}

interface ActivityLike {
  membershipId?: string;
  period?: string;
  instanceId?: string;
  activityDetails?: { instanceId?: string };
}

interface DisplayedGroups {
  yearGroups?: Array<{
    typeGroups?: Array<{ activities?: ActivityLike[] }>;
  }>;
}

/** Every activity the On this Day panels show, in panel order. */
export function displayedActivityKeys(groups: DisplayedGroups[]): string[] {
  const keys: string[] = [];
  for (const group of groups) {
    for (const year of group.yearGroups ?? []) {
      for (const type of year.typeGroups ?? []) {
        for (const activity of type.activities ?? []) {
          keys.push(dayActivityKey({
            membershipId: String(activity.membershipId ?? ''),
            instanceId: String(activity.activityDetails?.instanceId ?? activity.instanceId ?? ''),
            period: String(activity.period ?? ''),
          }));
        }
      }
    }
  }
  return keys;
}
