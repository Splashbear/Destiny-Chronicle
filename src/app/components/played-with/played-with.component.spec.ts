import { SimpleChange } from '@angular/core';
import { PlayedWithComponent, membershipIdsKey } from './played-with.component';

describe('PlayedWithComponent reload guard', () => {
  function makeComponent(createSession: jasmine.Spy) {
    const cdr = { markForCheck: () => {} } as any;
    const prefetch = { cancel: () => {}, progress$: { subscribe: () => ({ unsubscribe() {} }) } } as any;
    const analytics = { trackFeatureView: () => {} } as any;
    const i18n = { t: (k: string) => k } as any;
    return new PlayedWithComponent(i18n, { createSession } as any, prefetch, cdr, analytics);
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
    const ids = ['4611686018429785995', '4611686018452484164'];

    c.membershipIds = [...ids];
    c.ngOnChanges({ membershipIds: new SimpleChange(undefined, c.membershipIds, true) });
    // Simulate repeated change detection with a fresh getter array.
    for (let i = 0; i < 5; i++) {
      const prev = c.membershipIds;
      c.membershipIds = [...ids].reverse();
      c.ngOnChanges({ membershipIds: new SimpleChange(prev, c.membershipIds, false) });
    }
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    expect(createSession).toHaveBeenCalledTimes(1);
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
    c.membershipIds = ['a'];
    c.ngOnChanges({ membershipIds: new SimpleChange(undefined, c.membershipIds, true) });
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    expect(c.buildTimedOut).toBeTrue();
    expect(c.building).toBeFalse();
    PlayedWithComponent.MAX_BUILD_WAIT_MS = original;
    c.ngOnDestroy();
  });
});
