import '@angular/compiler';
import { SimpleChange } from '@angular/core';
import { TimeStoryTabComponent } from './time-story-tab.component';
import type { TimeStoryByYearResult } from '../../utils/time-story-by-year';

const bars: TimeStoryByYearResult = {
  years: [
    {
      year: 2023,
      seconds: 4187,
      games: 1,
      groups: [{ group: 'raids', seconds: 4187, games: 1 }],
    },
  ],
  totalSeconds: 4187,
  totalGames: 1,
};

describe('TimeStoryTabComponent sync and manifest-independent render', () => {
  let getYearBars: jasmine.Spy;
  let comp: TimeStoryTabComponent;

  beforeEach(() => {
    getYearBars = jasmine.createSpy('getYearBars').and.resolveTo(bars);
    const cdr = { markForCheck: jasmine.createSpy('markForCheck') };
    comp = new TimeStoryTabComponent(
      { getYearBars, getYearGroupResults: jasmine.createSpy('getYearGroupResults'), activityNameForSource: () => 'Raid' } as any,
      cdr as any
    );
    comp.hasSelectedPlayers = true;
    comp.scopes = [{ membershipId: 'mid', game: 'D2' }];
    comp.identityByMembership = {};
    comp.effectiveGame = 'D2';
  });

  it('does not compute bars while syncInProgress is still true, even if lean data could be ready', async () => {
    comp.syncInProgress = true;
    await comp.ngOnChanges({
      scopes: new SimpleChange(undefined, comp.scopes, true),
      hasSelectedPlayers: new SimpleChange(false, true, true),
      syncInProgress: new SimpleChange(false, true, true),
    });
    expect(getYearBars).not.toHaveBeenCalled();
    expect(comp.result).toBeNull();
    expect(comp.loading).toBe(true);
  });

  it('computes year bars from the service after sync completes even when the manifest was rejected', async () => {
    comp.syncInProgress = true;
    await comp.ngOnChanges({
      scopes: new SimpleChange(undefined, comp.scopes, true),
      syncInProgress: new SimpleChange(false, true, true),
    });
    expect(getYearBars).not.toHaveBeenCalled();

    comp.syncInProgress = false;
    await comp.ngOnChanges({
      syncInProgress: new SimpleChange(true, false, false),
    });

    expect(getYearBars).toHaveBeenCalled();
    expect(comp.loading).toBe(false);
    expect(comp.result?.years.map(y => y.year)).toEqual([2023]);
    expect(comp.result?.totalSeconds).toBe(4187);
  });

  it('does not start a second getYearBars for the same keys while one is already in flight', async () => {
    let release: (value: TimeStoryByYearResult) => void = () => {};
    getYearBars.and.returnValue(new Promise<TimeStoryByYearResult>(resolve => {
      release = resolve;
    }));
    comp.syncInProgress = false;
    const first = comp.ngOnChanges({
      syncInProgress: new SimpleChange(true, false, false),
    });
    await Promise.resolve();
    expect(getYearBars.calls.count()).toBe(1);

    const second = comp.ngOnChanges({
      syncInProgress: new SimpleChange(true, false, false),
    });
    await Promise.resolve();
    expect(getYearBars.calls.count()).toBe(1);

    release(bars);
    await first;
    await second;
    expect(comp.result?.totalSeconds).toBe(4187);
    expect(getYearBars.calls.count()).toBe(1);
  });
});

const mixedBars: TimeStoryByYearResult = {
  years: [
    {
      year: 2024,
      seconds: 5000,
      games: 4,
      groups: [
        { group: 'raids', seconds: 2000, games: 1 },
        { group: 'strikes', seconds: 3000, games: 3 },
      ],
    },
    {
      year: 2023,
      seconds: 4187,
      games: 1,
      groups: [{ group: 'raids', seconds: 4187, games: 1 }],
    },
  ],
  totalSeconds: 9187,
  totalGames: 5,
};

describe('TimeStoryTabComponent details panel selection', () => {
  let getYearBars: jasmine.Spy;
  let getYearGroupResults: jasmine.Spy;
  let comp: TimeStoryTabComponent;
  let opened: Array<{ group: string; year: number }>;

  async function load(result: TimeStoryByYearResult = mixedBars): Promise<void> {
    getYearBars.and.resolveTo(result);
    comp.syncInProgress = false;
    await comp.ngOnChanges({
      syncInProgress: new SimpleChange(true, false, false),
    });
  }

  beforeEach(() => {
    getYearBars = jasmine.createSpy('getYearBars').and.resolveTo(mixedBars);
    getYearGroupResults = jasmine.createSpy('getYearGroupResults').and.resolveTo({
      year: 2023,
      group: 'raids',
      rows: [
        { instanceId: 'r1', period: '2023-06-01T12:00:00Z', date: '2023-06-01', game: 'D2', seconds: 4187, group: 'raids' },
      ],
      totalGames: 1,
      chartGames: 1,
      countMatchesChart: true,
      allowedGames: ['D2'],
      timeZone: 'UTC',
    });
    const cdr = { markForCheck: jasmine.createSpy('markForCheck') };
    comp = new TimeStoryTabComponent(
      { getYearBars, getYearGroupResults, activityNameForSource: () => 'Raid' } as any,
      cdr as any
    );
    comp.hasSelectedPlayers = true;
    comp.scopes = [{ membershipId: 'mid', game: 'D2' }];
    comp.identityByMembership = {};
    comp.effectiveGame = 'D2';
    opened = [];
    comp.openGroup.subscribe(event => opened.push(event));
  });

  it("selects the newest year's largest group by default after load", async () => {
    await load();
    expect(comp.selection).toEqual({
      year: 2024,
      group: 'strikes',
      seconds: 3000,
      games: 3,
      percent: 60,
    });
    expect(comp.isSelected(mixedBars.years[0], 'strikes')).toBe(true);
    expect(comp.isSelected(mixedBars.years[0], 'raids')).toBe(false);
  });

  it('keeps the default card when another segment is hovered or focused, and only click switches it', async () => {
    await load();
    expect(comp.selection?.year).toBe(2024);
    expect(comp.selection?.group).toBe('strikes');
    const raids2024 = mixedBars.years[0];
    const year2023 = mixedBars.years[1];
    // Hover or focus alone must not change the pinned details card.
    expect(comp.selection).toEqual({
      year: 2024,
      group: 'strikes',
      seconds: 3000,
      games: 3,
      percent: 60,
    });
    expect(comp.isSelected(raids2024, 'raids')).toBe(false);
    // Click/tap (and native button Enter/Space, which dispatch click) switch the card.
    comp.selectSegment(raids2024, 'raids', 2000, 1);
    expect(comp.selection).toEqual({
      year: 2024,
      group: 'raids',
      seconds: 2000,
      games: 1,
      percent: 40,
    });
    expect(comp.isSelected(raids2024, 'raids')).toBe(true);
    expect(comp.isSelected(mixedBars.years[0], 'strikes')).toBe(false);
    // Selection stays pinned while the pointer travels toward View activities.
    expect(comp.selection?.group).toBe('raids');
    expect(opened).toEqual([]);
    comp.selectSegment(year2023, 'raids', 4187, 1);
    expect(comp.selection).toEqual({
      year: 2023,
      group: 'raids',
      seconds: 4187,
      games: 1,
      percent: 100,
    });
    expect(opened).toEqual([]);
  });

  it('binds segment selection to click only on native buttons, not hover or focus', () => {
    const { readFileSync } = require('fs') as { readFileSync: (path: string, enc: string) => string };
    const { resolve } = require('path') as { resolve: (...parts: string[]) => string };
    const html = readFileSync(resolve('src/app/features/time-story/time-story-tab.component.html'), 'utf8');
    const scss = readFileSync(resolve('src/app/features/time-story/time-story-tab.component.scss'), 'utf8');
    const start = html.indexOf('time-story__chart-wrap');
    const end = html.indexOf('time-story__detail', start);
    const chart = html.slice(start, end);
    expect(chart).toContain('type="button"');
    expect(chart).toContain('class="time-story__seg"');
    expect(chart).toContain('(click)="selectSegment(');
    expect(chart).not.toContain('(mouseenter)');
    expect(chart).not.toContain('(mouseleave)');
    expect(chart).not.toContain('(focus)');
    expect(chart).not.toContain('(pointerenter)');
    expect(scss).toContain('.time-story__seg:focus-visible');
    expect(scss).toContain('.time-story__seg--selected');
    expect(scss).toContain('box-shadow: inset 0 0 0 2px var(--destiny-gold-bright, #e8c36a)');
    expect(scss).not.toMatch(/:focus-visible[^{]*\.time-story__seg--selected/);
    expect(scss).not.toMatch(/--selected[^{]*\.time-story__seg:focus-visible/);
  });

  it('opens an in-tab year+group results view from View activities without leaving Hours', async () => {
    await load();
    const year2023 = mixedBars.years[1];
    comp.selectSegment(year2023, 'raids', 4187, 1);
    await comp.viewSelectedActivities();
    expect(opened).toEqual([{ group: 'raids', year: 2023 }]);
    expect(getYearGroupResults).toHaveBeenCalled();
    expect(comp.results?.totalGames).toBe(1);
    expect(comp.resultsPage?.rows.map(r => r.instanceId)).toEqual(['r1']);
    expect(comp.resultsLoading).toBe(false);
  });

  it('does not emit View activities when there is no selection', () => {
    comp.viewSelectedActivities();
    expect(opened).toEqual([]);
    expect(comp.results).toBeNull();
  });

  it('pages results, reports an empty match honestly, and Back to hours restores the chart', async () => {
    const many = Array.from({ length: 55 }, (_, i) => ({
      instanceId: `g-${54 - i}`,
      period: `2019-06-01T${String(12 + (i % 8)).padStart(2, '0')}:00:00Z`,
      date: i < 40 ? '2019-12-15' : '2019-06-01',
      game: 'D2' as const,
      seconds: 100,
      group: 'story-patrol-seasonal' as const,
    }));
    getYearGroupResults.and.resolveTo({
      year: 2019,
      group: 'story-patrol-seasonal',
      rows: many,
      totalGames: 55,
      chartGames: 55,
      countMatchesChart: true,
      allowedGames: ['D2'],
      timeZone: 'UTC',
    });
    await load();
    comp.selectSegment(mixedBars.years[1], 'raids', 4187, 1);
    // Override selection to the 2019 story case after load.
    comp.selection = { year: 2019, group: 'story-patrol-seasonal', seconds: 1, games: 55, percent: 10 };
    await comp.viewSelectedActivities();
    expect(comp.resultsPage?.page).toBe(1);
    expect(comp.resultsPage?.rows.length).toBe(40);
    expect(comp.resultsPage?.pageCount).toBe(2);
    comp.setResultsPage(2);
    expect(comp.resultsPage?.rows.length).toBe(15);
    expect(comp.resultsPage?.endIndex).toBe(55);
    expect(comp.result?.years.length).toBeGreaterThan(0);

    getYearGroupResults.and.resolveTo({
      year: 2019,
      group: 'unknown',
      rows: [],
      totalGames: 0,
      chartGames: 0,
      countMatchesChart: true,
      allowedGames: ['D2'],
      timeZone: 'UTC',
    });
    comp.selection = { year: 2019, group: 'unknown', seconds: 0, games: 0, percent: 0 };
    await comp.viewSelectedActivities();
    expect(comp.results?.totalGames).toBe(0);
    expect(comp.resultsPage?.rows).toEqual([]);

    comp.clearResultsView();
    expect(comp.results).toBeNull();
    expect(comp.resultsPage).toBeNull();
    expect(comp.resultsLoading).toBe(false);
    expect(comp.result?.years.length).toBeGreaterThan(0);
    expect(comp.selection?.year).toBe(2019);
  });

  it('clears selection when there are no years', async () => {
    await load();
    expect(comp.selection).not.toBeNull();
    getYearBars.and.resolveTo({ years: [], totalSeconds: 0, totalGames: 0 });
    comp.effectiveGame = 'D1';
    await comp.ngOnChanges({
      effectiveGame: new SimpleChange('D2', 'D1', false),
    });
    expect(comp.result?.years).toEqual([]);
    expect(comp.selection).toBeNull();
    expect(opened).toEqual([]);
  });

  it('clears selection when a year-bar load fails or players are cleared', async () => {
    await load();
    getYearBars.and.rejectWith(new Error('nope'));
    comp.effectiveGame = 'Both';
    await comp.ngOnChanges({
      effectiveGame: new SimpleChange('D2', 'Both', false),
    });
    expect(comp.result).toEqual({ years: [], totalSeconds: 0, totalGames: 0 });
    expect(comp.selection).toBeNull();

    await load();
    expect(comp.selection).not.toBeNull();
    comp.hasSelectedPlayers = false;
    await comp.ngOnChanges({
      hasSelectedPlayers: new SimpleChange(true, false, false),
    });
    expect(comp.result).toBeNull();
    expect(comp.selection).toBeNull();
  });

  it('shows a zero game count honestly when that is the selected data', async () => {
    await load();
    const emptyCount = {
      year: 2024,
      seconds: 5000,
      games: 4,
      groups: [
        { group: 'raids' as const, seconds: 2000, games: 0 },
        { group: 'strikes' as const, seconds: 3000, games: 3 },
      ],
    };
    comp.selectSegment(emptyCount as any, 'raids', 2000, 0);
    expect(comp.selection?.games).toBe(0);
    expect(comp.selection?.seconds).toBe(2000);
    expect(comp.selection?.percent).toBe(40);
  });
});
