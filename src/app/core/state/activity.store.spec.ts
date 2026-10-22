import { TestBed } from '@angular/core/testing';
import { ActivityStore } from './activity.store';

describe('ActivityStore', () => {
  let store: ActivityStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(ActivityStore);
  });

  it('statsPending is true while loadingStats', () => {
    store.setSelectedPlayerCount(1);
    store.setLoadingStats(true);
    expect(store.statsPending()).toBe(true);
    expect(store.totalActivitiesDisplay()).toBeNull();
    expect(store.timeInLoadedActivitiesDisplay()).toBeNull();
  });

  it('statsPending is true during profile load with zero activities', () => {
    store.setSelectedPlayerCount(2);
    store.setProfileLoadInProgress(true);
    store.setAggregates({ totalActivities: 0 });
    expect(store.statsPending()).toBe(true);
  });

  it('statsPending clears once activities arrive', () => {
    store.setSelectedPlayerCount(1);
    store.setProfileLoadInProgress(true);
    store.setLoadingStats(false);
    store.setFromAccountStats(
      {
        totalActivityCount: 100,
        totalActivityTime: 3600,
        bungieTotalTime: 7200,
        totalSeals: 5,
        perType: { Raid: { count: 10, time: 1000 } }
      },
      [
        {
          accountKey: 'D2-PlayStation-1',
          platform: 'PlayStation',
          totalTime: 3600,
          totalActivities: 100,
          totalSeals: 5,
          game: 'D2' as const
        }
      ]
    );
    expect(store.statsPending()).toBe(false);
    expect(store.totalActivities()).toBe(100);
    expect(store.timeInLoadedActivities()).toBe(3600);
    expect(store.timeFromBungie()).toBe(7200);
    expect(store.totalActivitiesDisplay()).toBe(100);
    expect(store.perPlatformStats().length).toBe(1);
    expect(store.accountStatsSnapshot().totalActivityCount).toBe(100);
  });

  it('reset clears selection and aggregates', () => {
    store.setSelectedPlayerCount(1);
    store.setFromAccountStats({ totalActivityCount: 50, totalActivityTime: 10 });
    store.reset();
    expect(store.selectedPlayerCount()).toBe(0);
    expect(store.totalActivities()).toBe(0);
    expect(store.statsPending()).toBe(false);
  });
});
