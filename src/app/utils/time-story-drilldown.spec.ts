import { FilteredActivitiesForDateService } from '../services/filtered-activities-for-date.service';
import { timeStoryGroupFromSection, type TimeStoryGroupId } from './time-story-groups';
import {
  calendarDateInTimeZone,
  clearTimeStoryDrilldownOnHost,
  filterActivitiesForTimeStoryDrilldown,
  landingDateForTimeStoryYear,
  localYearWindow,
  openTimeStoryGroupOnHost,
  type TimeStoryOpenGroupHost,
} from './time-story-drilldown';

const TZ = 'America/New_York';

function act(
  period: string,
  group: TimeStoryGroupId,
  extras: { game?: 'D1' | 'D2'; membershipId?: string } = {}
) {
  return {
    period,
    game: extras.game ?? 'D2',
    membershipId: extras.membershipId ?? 'mid',
    group,
    activityDetails: { instanceId: period, referenceId: '1', mode: 0 },
  };
}

function classify(row: { group?: TimeStoryGroupId }): TimeStoryGroupId | null {
  return row.group ?? null;
}

describe('local year bounds (same rule as the Time Story chart)', () => {
  it('places a late UTC New Year instant in the previous America/New_York year', () => {
    const { start, end } = localYearWindow(2018, TZ);
    expect(Date.parse('2018-01-01T04:59:59Z') < Date.parse(start)).toBe(true);
    expect(Date.parse('2018-01-01T05:00:00Z') >= Date.parse(start)).toBe(true);
    expect(Date.parse('2019-01-01T04:59:59Z') < Date.parse(end)).toBe(true);
    expect(Date.parse('2019-01-01T05:00:00Z') >= Date.parse(end)).toBe(true);
    expect(calendarDateInTimeZone('2018-01-01T05:00:00Z', TZ)).toBe('2018-01-01');
    expect(calendarDateInTimeZone('2019-01-01T04:59:59Z', TZ)).toBe('2018-12-31');
  });
});

describe('filterActivitiesForTimeStoryDrilldown', () => {
  const rows = [
    act('2018-06-15T16:00:00Z', 'story-patrol-seasonal'),
    act('2018-06-15T18:00:00Z', 'crucible'),
    act('2018-07-04T16:00:00Z', 'story-patrol-seasonal'),
    act('2026-11-10T16:00:00Z', 'story-patrol-seasonal'),
    act('2018-08-01T16:00:00Z', 'trials'),
    act('2018-08-01T17:00:00Z', 'crucible'),
    act('2018-03-01T16:00:00Z', 'story-patrol-seasonal', { game: 'D1' }),
  ];

  it('keeps 2018 Story/Patrol/Seasonal and drops today and other groups', () => {
    const kept = filterActivitiesForTimeStoryDrilldown(rows, {
      year: 2018,
      group: 'story-patrol-seasonal',
      timeZone: TZ,
      classify,
    });
    expect(kept.map(row => row.period)).toEqual([
      '2018-06-15T16:00:00Z',
      '2018-07-04T16:00:00Z',
      '2018-03-01T16:00:00Z',
    ]);
  });

  it('keeps Trials separate from Crucible', () => {
    expect(timeStoryGroupFromSection('trials-osiris')).toBe('trials');
    expect(timeStoryGroupFromSection('pvp')).toBe('crucible');
    const trials = filterActivitiesForTimeStoryDrilldown(rows, {
      year: 2018,
      group: 'trials',
      timeZone: TZ,
      classify,
    });
    const crucible = filterActivitiesForTimeStoryDrilldown(rows, {
      year: 2018,
      group: 'crucible',
      timeZone: TZ,
      classify,
    });
    expect(trials.map(row => row.period)).toEqual(['2018-08-01T16:00:00Z']);
    expect(crucible.map(row => row.period)).toEqual([
      '2018-06-15T18:00:00Z',
      '2018-08-01T17:00:00Z',
    ]);
  });

  it('isolates D2 when the chart scope is D2 only', () => {
    const kept = filterActivitiesForTimeStoryDrilldown(rows, {
      year: 2018,
      group: 'story-patrol-seasonal',
      timeZone: TZ,
      allowedGames: ['D2'],
      classify,
    });
    expect(kept.every(row => row.game === 'D2')).toBe(true);
    expect(kept.some(row => row.period === '2018-03-01T16:00:00Z')).toBe(false);
  });
});

describe('openTimeStoryGroupOnHost integrated Activities filters', () => {
  let selectedDate: string;
  let yearFilter: number | null;
  let groupFilter: TimeStoryGroupId | string | null;
  let dateBefore: string | null;
  let loaded: Array<{ force: boolean; date: string; year: number | null; group: string | null }>;
  let filteredList: ReturnType<typeof act>[];
  let allRows: ReturnType<typeof act>[];
  const svc = new FilteredActivitiesForDateService();

  function host(): TimeStoryOpenGroupHost {
    return {
      getSelectedDate: () => selectedDate,
      setSelectedDate: date => {
        selectedDate = date;
      },
      getTimeStoryDateBeforeFilter: () => dateBefore,
      setTimeStoryDateBeforeFilter: date => {
        dateBefore = date;
      },
      getTimeStoryGroupFilter: () => groupFilter,
      getTimeStoryYearFilter: () => yearFilter,
      setTimeStoryGroupFilter: group => {
        groupFilter = group;
      },
      setTimeStoryYearFilter: year => {
        yearFilter = year;
      },
      clearFilteredActivitiesCache: () => undefined,
      changeToActivitiesTab: async () => undefined,
      loadActivities: async force => {
        const dateParts = selectedDate.split('-').map(Number);
        const [y, month, day] = dateParts;
        const onDay = allRows.filter(row => {
          const key = calendarDateInTimeZone(row.period, TZ);
          return key === selectedDate;
        });
        // Service path: year is passed so other years' same month/day are not included.
        const dayFetch = yearFilter ? onDay.filter(row => yearOf(row) === yearFilter) : onDay;
        const fakeHost = {
          getSelectedDate: () => selectedDate,
          getSelectedPlayers: () => [
            { membershipId: 'mid', membershipType: 2, displayName: 'P', platform: 'Xbox', game: 'D2' as const },
          ],
          getSelectedActivityType: () => ({ label: 'All' }),
          getCacheEntry: () => undefined,
          setCacheEntry: () => undefined,
          isFirstFullSyncDone: () => true,
          getCharacterIdsForPlayer: () => ['char'],
          fetchActivitiesForCharacters: async (_m: string, _c: string[], m: number, d: number, year?: number) => {
            expect(m).toBe(month);
            expect(d).toBe(day);
            if (year != null) expect(year).toBe(y);
            return dayFetch as any;
          },
          getManifest: () => ({
            getActivityType: () => 'story',
            getActivityName: () => 'Story',
            getActivityIcon: () => undefined,
          }),
          setFilteredActivitiesForDate: (list: any[]) => {
            filteredList = list as any;
          },
          computeAccountStats: () => undefined,
          getTimeStoryGroupFilter: () => groupFilter,
          getTimeStoryYearFilter: () => yearFilter,
          getTimeStoryTimeZone: () => TZ,
          getTimeStoryAllowedGames: () => ['D2'] as Array<'D1' | 'D2'>,
          activityMatchesTimeStoryGroup: (activity: any, group: string) => activity.group === group,
        };
        await svc.getAllFilteredActivitiesForDate(fakeHost as any, force);
        loaded.push({ force, date: selectedDate, year: yearFilter, group: groupFilter });
      },
      fetchYearActivities: async () => allRows,
      classify,
      allowedGames: () => ['D2'],
      timeZone: () => TZ,
      detectChanges: () => undefined,
    };
  }

  function yearOf(row: { period?: string }): number | null {
    const key = calendarDateInTimeZone(row.period, TZ);
    return key ? Number(key.slice(0, 4)) : null;
  }

  beforeEach(() => {
    selectedDate = '2026-11-10';
    yearFilter = null;
    groupFilter = null;
    dateBefore = null;
    loaded = [];
    filteredList = [];
    allRows = [
      act('2026-11-10T16:00:00Z', 'crucible'),
      act('2026-11-10T17:00:00Z', 'story-patrol-seasonal'),
      act('2018-06-15T16:00:00Z', 'story-patrol-seasonal'),
      act('2018-07-04T20:00:00Z', 'story-patrol-seasonal'),
      act('2018-06-15T18:00:00Z', 'crucible'),
      act('2018-08-01T16:00:00Z', 'trials'),
      act('2018-03-01T16:00:00Z', 'story-patrol-seasonal', { game: 'D1' }),
    ];
  });

  it('opens 2018 Story/Patrol/Seasonal on a 2018 date with only that group, not today unfiltered', async () => {
    await openTimeStoryGroupOnHost(host(), { group: 'story-patrol-seasonal', year: 2018 });
    expect(yearFilter).toBe(2018);
    expect(groupFilter).toBe('story-patrol-seasonal');
    expect(selectedDate.startsWith('2018-')).toBe(true);
    expect(selectedDate).toBe('2018-07-04');
    expect(loaded[0]).toEqual({
      force: true,
      date: '2018-07-04',
      year: 2018,
      group: 'story-patrol-seasonal',
    });
    expect(filteredList.map(row => row.period)).toEqual(['2018-07-04T20:00:00Z']);
    expect(filteredList.every(row => row.group === 'story-patrol-seasonal')).toBe(true);
    expect(filteredList.some(row => row.period.startsWith('2026-'))).toBe(false);
  });

  it('keeps Trials out of a Crucible drilldown', async () => {
    await openTimeStoryGroupOnHost(host(), { group: 'crucible', year: 2018 });
    expect(selectedDate).toBe('2018-06-15');
    expect(filteredList.map(row => row.group)).toEqual(['crucible']);
    expect(filteredList.some(row => row.group === 'trials')).toBe(false);
  });

  it('does not include D1 rows when the chart scope is D2', async () => {
    await openTimeStoryGroupOnHost(host(), { group: 'story-patrol-seasonal', year: 2018 });
    expect(filteredList.some(row => row.game === 'D1')).toBe(false);
  });

  it('clear restores the previous date and an unfiltered reload', async () => {
    await openTimeStoryGroupOnHost(host(), { group: 'story-patrol-seasonal', year: 2018 });
    await clearTimeStoryDrilldownOnHost(host());
    expect(yearFilter).toBeNull();
    expect(groupFilter).toBeNull();
    expect(selectedDate).toBe('2026-11-10');
    expect(loaded[loaded.length - 1].date).toBe('2026-11-10');
    expect(loaded[loaded.length - 1].year).toBeNull();
    expect(filteredList.map(row => row.period).sort()).toEqual([
      '2026-11-10T16:00:00Z',
      '2026-11-10T17:00:00Z',
    ]);
  });

  it('lands in the selected year with an empty list when nothing matches', async () => {
    allRows = [act('2026-11-10T16:00:00Z', 'crucible')];
    await openTimeStoryGroupOnHost(host(), { group: 'unknown', year: 2018 });
    expect(selectedDate).toBe('2018-12-31');
    expect(yearFilter).toBe(2018);
    expect(groupFilter).toBe('unknown');
    expect(filteredList).toEqual([]);
  });

  it('chooses the latest matching local day in the year as the landing date', () => {
    expect(
      landingDateForTimeStoryYear(
        ['2018-06-15T16:00:00Z', '2018-07-04T20:00:00Z', '2019-01-01T04:59:59Z'],
        2018,
        TZ
      )
    ).toBe('2018-12-31');
  });
});
