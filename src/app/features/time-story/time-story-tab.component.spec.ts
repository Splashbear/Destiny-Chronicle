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
    comp = new TimeStoryTabComponent({ getYearBars } as any, cdr as any);
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
    const cdr = { markForCheck: jasmine.createSpy('markForCheck') };
    comp = new TimeStoryTabComponent({ getYearBars } as any, cdr as any);
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

  it('updates selection on hover or keyboard focus and keeps it on leave', async () => {
    await load();
    const raids2024 = mixedBars.years[0];
    comp.selectSegment(raids2024, 'raids', 2000, 1);
    expect(comp.selection?.group).toBe('raids');
    expect(comp.selection?.percent).toBe(40);
    expect(comp.selection?.games).toBe(1);
    comp.onSegmentLeave();
    expect(comp.selection?.year).toBe(2024);
    expect(comp.selection?.group).toBe('raids');
    expect(comp.selection?.seconds).toBe(2000);
    expect(opened).toEqual([]);
  });

  it('lets a tap or click select a segment without opening the activities filter', async () => {
    await load();
    const year2023 = mixedBars.years[1];
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

  it('emits the selected year and group only from View activities', async () => {
    await load();
    const year2023 = mixedBars.years[1];
    comp.selectSegment(year2023, 'raids', 4187, 1);
    comp.viewSelectedActivities();
    expect(opened).toEqual([{ group: 'raids', year: 2023 }]);
  });

  it('does not emit View activities when there is no selection', () => {
    comp.viewSelectedActivities();
    expect(opened).toEqual([]);
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
