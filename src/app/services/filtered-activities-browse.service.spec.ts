import {
  FilteredActivitiesBrowseHost,
  FilteredActivitiesBrowseService,
} from './filtered-activities-browse.service';
import { PlayerSearchDisplay } from '../models/player-search-display.model';

function player(id: string): PlayerSearchDisplay {
  return {
    displayName: id,
    membershipId: id,
    membershipType: 2,
    game: 'D2',
    platform: 'PlayStation',
  } as PlayerSearchDisplay;
}

describe('FilteredActivitiesBrowseService', () => {
  let svc: FilteredActivitiesBrowseService;

  beforeEach(() => {
    svc = new FilteredActivitiesBrowseService();
  });

  it('does not bump load token on incremental refresh and skips complete marking', async () => {
    let token = 5;
    const statuses: string[] = [];
    const host: FilteredActivitiesBrowseHost = {
      beginLoadToken: (markComplete) => (markComplete ? ++token : token),
      getCurrentLoadToken: () => token,
      getSelectedPlayers: () => [player('a')],
      getSelectedDate: () => '2024-01-01',
      getPlayerKey: (p) => `D2|${p.membershipId}`,
      isD1Player: () => false,
      getPlatformName: () => 'PlayStation',
      updateAccountLoadingStatus: (_k, _n, _p, _g, _m, status) => {
        statuses.push(status);
      },
      getAccountLoadingStatus: () => ({
        status: 'fetching-activities',
        displayName: 'a',
        platform: 'PlayStation',
        game: 'D2',
        membershipType: 2,
      }),
      updateLoadingProgress: () => undefined,
      clearLoadingProgress: () => undefined,
      detectChanges: () => undefined,
      fetchFilteredActivities: async () => [],
      buildReportCountMessage: () => '0',
      getReportSummaryLine: () => 'none',
      enrichActivitiesWithCharacterClass: async () => undefined,
      setFilteredActivitiesForDate: () => undefined,
      getFilteredActivitiesForDateLength: () => 0,
      scheduleBatchedUpdate: () => undefined,
      ensureManifestLoaded: async () => undefined,
      processAndGroupActivities: () => undefined,
      startBackgroundProcessing: () => undefined,
      updateActivityDisplay: () => undefined,
      setDateActivityLoading: () => undefined,
      checkAndShowAnniversaryBanner: () => undefined,
    };

    // Skip the 800ms pause by stubbing setTimeout for this test window.
    const realSetTimeout = globalThis.setTimeout;
    spyOn(globalThis, 'setTimeout').and.callFake(((fn: TimerHandler) => {
      if (typeof fn === 'function') {
        fn();
      }
      return 0 as any;
    }) as any);

    await svc.loadAllFilteredActivities(host, false, false);
    expect(token).toBe(5);
    expect(statuses).not.toContain('complete');
    expect(statuses).not.toContain('displaying-activities');

    (globalThis as any).setTimeout = realSetTimeout;
  });

  it('marks complete on final load after displaying-activities', async () => {
    let token = 1;
    const statuses: string[] = [];
    const host: FilteredActivitiesBrowseHost = {
      beginLoadToken: (markComplete) => (markComplete ? ++token : token),
      getCurrentLoadToken: () => token,
      getSelectedPlayers: () => [player('a')],
      getSelectedDate: () => '2024-01-01',
      getPlayerKey: (p) => `D2|${p.membershipId}`,
      isD1Player: () => false,
      getPlatformName: () => 'PlayStation',
      updateAccountLoadingStatus: (_k, _n, _p, _g, _m, status) => {
        statuses.push(status);
      },
      getAccountLoadingStatus: () => ({
        status: 'displaying-activities',
        displayName: 'a',
        platform: 'PlayStation',
        game: 'D2',
        membershipType: 2,
      }),
      updateLoadingProgress: () => undefined,
      clearLoadingProgress: () => undefined,
      detectChanges: () => undefined,
      fetchFilteredActivities: async () => [],
      buildReportCountMessage: () => '0',
      getReportSummaryLine: () => 'none',
      enrichActivitiesWithCharacterClass: async () => undefined,
      setFilteredActivitiesForDate: () => undefined,
      getFilteredActivitiesForDateLength: () => 0,
      scheduleBatchedUpdate: () => undefined,
      ensureManifestLoaded: async () => undefined,
      processAndGroupActivities: () => undefined,
      startBackgroundProcessing: () => undefined,
      updateActivityDisplay: () => undefined,
      setDateActivityLoading: () => undefined,
      checkAndShowAnniversaryBanner: () => undefined,
    };

    spyOn(globalThis, 'setTimeout').and.callFake(((fn: TimerHandler) => {
      if (typeof fn === 'function') {
        fn();
      }
      return 0 as any;
    }) as any);

    await svc.loadAllFilteredActivities(host, false, true);
    expect(token).toBe(2);
    expect(statuses[0]).toBe('displaying-activities');
    expect(statuses).toContain('complete');
  });
});
