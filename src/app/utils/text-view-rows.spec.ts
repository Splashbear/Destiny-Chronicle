import { dayActivityKey, displayedActivityKeys, sameDayRows, windowRows } from './text-view-rows';

describe('text view rows', () => {
  const activities = [
    { membershipId: '1', period: '2021-10-16T18:00:00Z', activityDetails: { instanceId: 'a' } },
    { membershipId: '1', period: '2025-10-16T20:00:00Z', activityDetails: { instanceId: 'b' } },
    { membershipId: '2', period: '2023-10-16T19:00:00Z', activityDetails: { instanceId: 'c' } },
  ];

  const groups = [{
    yearGroups: [
      { typeGroups: [{ activities: [activities[0]] }] },
      { typeGroups: [{ activities: [activities[1], activities[2]] }] },
    ],
  }];

  it('uses the same activity keys as the full On this Day panels', () => {
    const full = displayedActivityKeys(groups);
    const text = activities.map(a => dayActivityKey({
      membershipId: a.membershipId,
      instanceId: a.activityDetails.instanceId,
      period: a.period,
    }));
    expect(sameDayRows(
      full.map(parseKey),
      text.map(parseKey),
    )).toBe(true);
  });

  it('shows every row once the pages cover the list', () => {
    const rows = [1, 2, 3, 4, 5];
    expect(windowRows(rows, 2, 1)).toEqual([1, 2]);
    expect(windowRows(rows, 2, 3)).toEqual(rows);
  });
});

function parseKey(key: string) {
  const [membershipId, instanceId, period] = key.split('|');
  return { membershipId, instanceId, period };
}
