import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TextViewService } from '../../services/text-view.service';
import { PlayedWithComponent, membershipIdsKey } from './played-with.component';

describe('PlayedWithComponent reload guard', () => {
  function makeComponent(createSession: jasmine.Spy) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: TextViewService, useValue: { enabled: () => false } }]
    });
    const cdr = { markForCheck: () => {} } as any;
    const prefetch = { cancel: () => {}, progress$: { subscribe: () => ({ unsubscribe() {} }) } } as any;
    const analytics = { trackFeatureView: () => {} } as any;
    const i18n = { t: (k: string) => k } as any;
    return TestBed.runInInjectionContext(
      () => new PlayedWithComponent(i18n, { createSession } as any, prefetch, cdr, analytics)
    );
  }

  function readySession() {
    return {
      fromApi: true,
      pendingBuild: false,
      coverage: { pgcrCached: 1, totalActivities: 1, percent: 100 },
      sortPartners: () => [{ membershipId: 'p1', displayName: 'P', activitiesTogether: 1, timeTogetherSeconds: 1 }]
    };
  }

  it('keys ids independent of order and duplicates', () => {
    expect(membershipIdsKey(['b', 'a', 'a'])).toBe(membershipIdsKey(['a', 'b']));
    expect(membershipIdsKey(['a'])).not.toBe(membershipIdsKey(['a', 'b']));
  });

  it('does not restart loading when the parent passes a new array with the same ids', async () => {
    const createSession = jasmine.createSpy('createSession').and.callFake(async () => readySession());
    const c = makeComponent(createSession);
    const ids = ['4611686018429785995', '4611686018465122437'];
    const choices = (list: string[]) => list.map(id => ({ id, label: id }));

    c.accounts = choices(ids);
    c.ngOnChanges({ accounts: new SimpleChange(undefined, c.accounts, true) });
    // Simulate repeated change detection with a fresh getter array.
    for (let i = 0; i < 5; i++) {
      const prev = c.accounts;
      c.accounts = choices([...ids].reverse());
      c.ngOnChanges({ accounts: new SimpleChange(prev, c.accounts, false) });
    }
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession.calls.mostRecent().args[0]).toEqual([ids[0]]);
    expect(c.loading).toBeFalse();
    expect(c.sortedPartners.length).toBe(1);
    c.ngOnDestroy();
  });

  it('stops polling and shows a timeout state when a build never finishes', async () => {
    const original = PlayedWithComponent.MAX_BUILD_WAIT_MS;
    PlayedWithComponent.MAX_BUILD_WAIT_MS = 0;
    const createSession = jasmine.createSpy('createSession').and.callFake(async () => ({
      fromApi: true, pendingBuild: true, pendingStatus: 'queued', coverage: null, sortPartners: () => []
    }));
    const c = makeComponent(createSession);
    c.accounts = [{ id: 'a', label: 'A' }];
    c.ngOnChanges({ accounts: new SimpleChange(undefined, c.accounts, true) });
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    expect(c.buildTimedOut).toBeTrue();
    expect(c.building).toBeFalse();
    PlayedWithComponent.MAX_BUILD_WAIT_MS = original;
    c.ngOnDestroy();
  });

  it('loads only the account chosen in the dropdown', async () => {
    const createSession = jasmine.createSpy('createSession').and.callFake(async () => readySession());
    const c = makeComponent(createSession);
    c.accounts = [
      { id: 'xbox', label: 'Splashbear#1078 (Xbox)' },
      { id: 'psn', label: 'Splashbear#1078 (PSN)' }
    ];
    c.ngOnChanges({ accounts: new SimpleChange(undefined, c.accounts, true) });
    await new Promise(r => setTimeout(r, 0));
    c.selectAccount('psn');
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    expect(createSession.calls.allArgs().map(args => args[0])).toEqual([['xbox'], ['psn']]);
    c.ngOnDestroy();
  });
});

import { formatBuildProgress } from './played-with.component';

describe('formatBuildProgress', () => {
  it('uses the server counts per stage', () => {
    expect(formatBuildProgress('running', null, { stage: 'loading_games', accountsLoaded: 2, accountsTotal: 4, games: 12345 }))
      .toBe('Loading game history: 2 of 4 accounts (12,345 games found)');
    expect(formatBuildProgress('running', null, { stage: 'scanning', accountsLoaded: 4, accountsTotal: 4, games: 27215, batchesDone: 10, batchesTotal: 40 }))
      .toBe('Scanning 27,215 games for fireteam members: 25% (10 of 40 archive batches)');
    expect(formatBuildProgress('running', null, { stage: 'ranking', accountsLoaded: 4, accountsTotal: 4, games: 27215 }))
      .toContain('27,215 games');
  });
  it('falls back to queue position, never invents numbers', () => {
    expect(formatBuildProgress('pending', 3, null)).toBe('Waiting in line: #3');
    expect(formatBuildProgress('requested', null, null)).toBe('');
  });
});

describe('formatBuildProgress Bungie step', () => {
  it('reports the Bungie fill with real counts', () => {
    expect(formatBuildProgress('running', null, { stage: 'bungie_pgcrs', accountsLoaded: 1, accountsTotal: 1, games: 9000, pgcrsDone: 40, pgcrsTotal: 1600 }))
      .toBe('Loading 1,600 newer games from Bungie: 40 of 1,600');
  });
});
