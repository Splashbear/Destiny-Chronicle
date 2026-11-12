import { timeStoryGroupFromSection, type TimeStoryGroupId } from './time-story-groups';
import {
  TIME_STORY_RESULTS_PAGE_SIZE,
  buildTimeStoryYearGroupResults,
  formatTimeStoryResultDate,
  pageTimeStoryYearGroupResults,
  type TimeStoryYearGroupResultRow,
} from './time-story-year-group-results';

const TZ = 'America/New_York';
const PAGE = 25;

function row(
  period: string,
  group: TimeStoryGroupId,
  extras: {
    game?: 'D1' | 'D2';
    membershipId?: string;
    instanceId?: string;
    timeSeconds?: number;
    activityHash?: number;
  } = {}
) {
  return {
    period,
    group,
    game: extras.game ?? 'D2',
    membershipId: extras.membershipId ?? 'mid',
    instanceId: extras.instanceId ?? period,
    timeSeconds: extras.timeSeconds ?? 600,
    activityHash: extras.activityHash ?? 1,
  };
}

function classify(activity: { group?: TimeStoryGroupId | null }): TimeStoryGroupId | null {
  return activity.group ?? null;
}

/** 2019 Story/Patrol/Seasonal across three dates, plus noise (Trials, D1, other years). */
function fixture2019Story(count = 55) {
  const story: ReturnType<typeof row>[] = [];
  // 20 games on 2019-12-15 (newest day), 20 on 2019-06-01, remainder on 2019-01-02.
  const days = [
    { date: '2019-12-15', n: 20 },
    { date: '2019-06-01', n: 20 },
    { date: '2019-01-02', n: count - 40 },
  ];
  let i = 0;
  for (const day of days) {
    for (let n = 0; n < day.n; n++) {
      i += 1;
      const hour = 12 + (n % 8);
      const minute = String(n).padStart(2, '0');
      story.push(
        row(`${day.date}T${String(hour).padStart(2, '0')}:${minute}:00Z`, 'story-patrol-seasonal', {
          instanceId: `story-${i}`,
          timeSeconds: 100 + i,
        })
      );
    }
  }
  const noise = [
    row('2019-12-15T20:00:00Z', 'trials', { instanceId: 'trials-1' }),
    row('2019-12-15T20:30:00Z', 'crucible', { instanceId: 'crucible-1' }),
    row('2019-06-01T15:00:00Z', 'story-patrol-seasonal', { game: 'D1', membershipId: 'd1', instanceId: 'd1-story' }),
    row('2018-07-04T16:00:00Z', 'story-patrol-seasonal', { instanceId: 'y2018' }),
    row('2026-11-10T16:00:00Z', 'story-patrol-seasonal', { instanceId: 'today' }),
    row('2019-12-31T16:00:00Z', 'unknown', { instanceId: 'unk' }),
    // UTC New Year instant that is still 2018 in America/New_York.
    row('2019-01-01T04:59:59Z', 'story-patrol-seasonal', { instanceId: 'tz-2018' }),
    // First instant of 2019 in America/New_York.
    row('2019-01-01T05:00:00Z', 'story-patrol-seasonal', { instanceId: 'tz-2019' }),
  ];
  return { story, noise, all: [...story, ...noise] };
}

describe('buildTimeStoryYearGroupResults', () => {
  const { story, all } = fixture2019Story(55);

  it('keeps all 2019 Story/Patrol/Seasonal games, newest first, with a stable count', () => {
    const result = buildTimeStoryYearGroupResults(all, {
      year: 2019,
      group: 'story-patrol-seasonal',
      timeZone: TZ,
      allowedGames: ['D2'],
      classify,
      chartGames: 56, // 55 dated story + tz-2019 boundary
    });
    // 55 constructed 2019 story rows + the 2019-01-01T05:00:00Z boundary, not the 04:59:59Z row, not D1, not Trials.
    expect(result.totalGames).toBe(56);
    expect(result.countMatchesChart).toBe(true);
    expect(result.rows.every(r => r.group === 'story-patrol-seasonal')).toBe(true);
    expect(result.rows.every(r => r.game === 'D2')).toBe(true);
    expect(result.rows.every(r => r.date.startsWith('2019-'))).toBe(true);
    expect(result.rows.some(r => r.instanceId === 'trials-1')).toBe(false);
    expect(result.rows.some(r => r.instanceId === 'crucible-1')).toBe(false);
    expect(result.rows.some(r => r.instanceId === 'd1-story')).toBe(false);
    expect(result.rows.some(r => r.instanceId === 'y2018' || r.instanceId === 'today')).toBe(false);
    expect(result.rows.some(r => r.instanceId === 'tz-2018')).toBe(false);
    // Newest 2019-12-15 row is n=15 (19:15Z), instance story-16.
    expect(result.rows[0].instanceId).toBe('story-16');
    expect(result.rows[0].date).toBe('2019-12-15');
    expect(result.rows.map(r => r.instanceId)).toEqual(
      buildTimeStoryYearGroupResults(all, {
        year: 2019,
        group: 'story-patrol-seasonal',
        timeZone: TZ,
        allowedGames: ['D2'],
        classify,
      }).rows.map(r => r.instanceId)
    );
  });

  it('pages every 2019 Story game in order without changing the total', () => {
    const result = buildTimeStoryYearGroupResults(all, {
      year: 2019,
      group: 'story-patrol-seasonal',
      timeZone: TZ,
      allowedGames: ['D2'],
      classify,
      chartGames: 56,
    });
    expect(result.totalGames).toBeGreaterThan(PAGE);
    const seen: string[] = [];
    const page1 = pageTimeStoryYearGroupResults(result.rows, 1, PAGE);
    const page2 = pageTimeStoryYearGroupResults(result.rows, 2, PAGE);
    const page3 = pageTimeStoryYearGroupResults(result.rows, 3, PAGE);
    expect(page1.pageCount).toBe(3);
    expect(page1.rows.length).toBe(25);
    expect(page2.rows.length).toBe(25);
    expect(page3.rows.length).toBe(6);
    expect(page1.startIndex).toBe(0);
    expect(page1.endIndex).toBe(25);
    expect(page3.endIndex).toBe(56);
    expect(page1.days[0].date).toBe('2019-12-15');
    expect(page3.days[page3.days.length - 1].date.startsWith('2019-01-')).toBe(true);
    for (const page of [page1, page2, page3]) {
      for (const row of page.rows) seen.push(row.instanceId || '');
    }
    expect(seen).toEqual(result.rows.map(r => r.instanceId || ''));
    expect(new Set(seen).size).toBe(56);
    // Out-of-range page clamps; total unchanged.
    expect(pageTimeStoryYearGroupResults(result.rows, 99, PAGE).page).toBe(3);
    expect(result.totalGames).toBe(56);
  });

  it('keeps Trials out of a Story or Crucible list and out of Unknown', () => {
    expect(timeStoryGroupFromSection('trials-osiris')).toBe('trials');
    const story = buildTimeStoryYearGroupResults(all, {
      year: 2019,
      group: 'story-patrol-seasonal',
      timeZone: TZ,
      classify,
    });
    const crucible = buildTimeStoryYearGroupResults(all, {
      year: 2019,
      group: 'crucible',
      timeZone: TZ,
      classify,
    });
    const trials = buildTimeStoryYearGroupResults(all, {
      year: 2019,
      group: 'trials',
      timeZone: TZ,
      classify,
    });
    const unknown = buildTimeStoryYearGroupResults(all, {
      year: 2019,
      group: 'unknown',
      timeZone: TZ,
      classify,
    });
    expect(story.rows.some(r => r.group === 'trials')).toBe(false);
    expect(crucible.rows.map(r => r.instanceId)).toEqual(['crucible-1']);
    expect(trials.rows.map(r => r.instanceId)).toEqual(['trials-1']);
    expect(unknown.rows.map(r => r.instanceId)).toEqual(['unk']);
  });

  it('isolates D2 accounts from D1 rows', () => {
    const result = buildTimeStoryYearGroupResults(all, {
      year: 2019,
      group: 'story-patrol-seasonal',
      timeZone: TZ,
      allowedGames: ['D2'],
      classify,
    });
    expect(result.rows.some(r => r.game === 'D1' || r.membershipId === 'd1')).toBe(false);
    const d1 = buildTimeStoryYearGroupResults(all, {
      year: 2019,
      group: 'story-patrol-seasonal',
      timeZone: TZ,
      allowedGames: ['D1'],
      classify,
    });
    expect(d1.rows.map(r => r.instanceId)).toEqual(['d1-story']);
  });

  it('uses America/New_York year bounds like the chart', () => {
    const result = buildTimeStoryYearGroupResults(all, {
      year: 2019,
      group: 'story-patrol-seasonal',
      timeZone: TZ,
      allowedGames: ['D2'],
      classify,
    });
    expect(result.rows.some(r => r.instanceId === 'tz-2019')).toBe(true);
    expect(result.rows.some(r => r.instanceId === 'tz-2018')).toBe(false);
    const y2018 = buildTimeStoryYearGroupResults(all, {
      year: 2018,
      group: 'story-patrol-seasonal',
      timeZone: TZ,
      allowedGames: ['D2'],
      classify,
    });
    expect(y2018.rows.map(r => r.instanceId).sort()).toEqual(['tz-2018', 'y2018']);
  });

  it('returns an honest empty list when nothing matches, and reports a chart-count mismatch', () => {
    const empty = buildTimeStoryYearGroupResults(all, {
      year: 2019,
      group: 'raids',
      timeZone: TZ,
      classify,
      chartGames: 0,
    });
    expect(empty.totalGames).toBe(0);
    expect(empty.rows).toEqual([]);
    expect(empty.countMatchesChart).toBe(true);
    const mismatch = buildTimeStoryYearGroupResults(all, {
      year: 2019,
      group: 'raids',
      timeZone: TZ,
      classify,
      chartGames: 12,
    });
    expect(mismatch.totalGames).toBe(0);
    expect(mismatch.countMatchesChart).toBe(false);
    expect(mismatch.chartGames).toBe(12);
  });

  it('skips invalid durations the same way the year bars do', () => {
    const result = buildTimeStoryYearGroupResults(
      [
        row('2019-06-01T12:00:00Z', 'story-patrol-seasonal', { instanceId: 'ok', timeSeconds: 10 }),
        row('2019-06-01T13:00:00Z', 'story-patrol-seasonal', { instanceId: 'bad', timeSeconds: -1 }),
      ],
      { year: 2019, group: 'story-patrol-seasonal', timeZone: TZ, classify, chartGames: 1 }
    );
    expect(result.rows.map(r => r.instanceId)).toEqual(['ok']);
    expect(result.countMatchesChart).toBe(true);
  });

  it('maps unified referenceId/baseName when activityHash is absent (Hours drilldown)', () => {
    const unified = [
      {
        period: '2024-12-28T04:18:00Z',
        group: 'raids' as TimeStoryGroupId,
        game: 'D2' as const,
        membershipId: 'mid',
        instanceId: '15990000001',
        timeSeconds: 4200,
        referenceId: '2122313384',
        baseName: "King's Fall",
        variantName: 'Normal',
        mode: 4,
      },
    ];
    const result = buildTimeStoryYearGroupResults(unified, {
      year: 2024,
      group: 'raids',
      timeZone: TZ,
      classify: a => a.group ?? null,
      chartGames: 1,
    });
    expect(result.totalGames).toBe(1);
    expect(result.rows[0].activityHash).toBe('2122313384');
    expect(result.rows[0].baseName).toBe("King's Fall");
    expect(result.rows[0].variantName).toBe('Normal');
    expect(result.rows[0].instanceId).toBe('15990000001');
  });

  it('prefers activityHash over referenceId when both are present', () => {
    const unified = [
      {
        period: '2024-12-28T04:18:00Z',
        group: 'raids' as TimeStoryGroupId,
        game: 'D2' as const,
        membershipId: 'mid',
        instanceId: 'x',
        timeSeconds: 600,
        activityHash: 111,
        referenceId: 222,
        baseName: 'Last Wish',
        mode: 4,
      },
    ];
    const result = buildTimeStoryYearGroupResults(unified, {
      year: 2024,
      group: 'raids',
      timeZone: TZ,
      classify: a => a.group ?? null,
    });
    expect(result.rows[0].activityHash).toBe(111);
    expect(result.rows[0].baseName).toBe('Last Wish');
  });
});

describe('pageTimeStoryYearGroupResults', () => {
  it('uses the default page size in the 25–50 range and does not require rendering every row', () => {
    expect(TIME_STORY_RESULTS_PAGE_SIZE).toBeGreaterThanOrEqual(25);
    expect(TIME_STORY_RESULTS_PAGE_SIZE).toBeLessThanOrEqual(50);
    const rows = Array.from({ length: 1524 }, (_, i) =>
      row(`2019-06-01T00:00:00Z`, 'story-patrol-seasonal', { instanceId: `g-${i}` })
    ) as unknown as TimeStoryYearGroupResultRow[];
    // Fake dates required by the pager (it only slices).
    for (const r of rows) (r as TimeStoryYearGroupResultRow).date = '2019-06-01';
    const page = pageTimeStoryYearGroupResults(rows, 1);
    expect(page.rows.length).toBe(TIME_STORY_RESULTS_PAGE_SIZE);
    expect(page.pageCount).toBe(Math.ceil(1524 / TIME_STORY_RESULTS_PAGE_SIZE));
    expect(page.rows.length).toBeLessThan(1524);
  });

  it('formats a visible day heading from the local calendar date', () => {
    expect(formatTimeStoryResultDate('2019-12-15')).toBe('December 15, 2019');
  });
});
