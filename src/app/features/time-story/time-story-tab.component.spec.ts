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
