import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { ActivityBreakdownService } from '../../services/activity-breakdown.service';
import { StoredActivity } from '../../services/activity-db.service';
import { BreakdownView } from '../../utils/breakdown-view';
import { PlayerSearchComponent } from './player-search.component';

/**
 * Breakdown is opened before history has finished writing. A later stored row
 * must increase the total without clearing the card the user selected.
 */
describe('Activity Breakdown late rows', () => {
  function stored(instanceId: string, seconds: number): StoredActivity {
    return {
      membershipId: 'm1',
      characterId: 'c1',
      game: 'D2',
      period: '2020-01-01T00:00:00Z',
      activityDetails: { instanceId, referenceId: '111', mode: 4 },
      values: {
        timePlayedSeconds: { basic: { value: seconds } },
        completed: { basic: { value: 1 } },
      },
    } as StoredActivity;
  }

  it('raises the total when a row is stored after the tab is open', fakeAsync(() => {
    const db = {
      rows: [stored('1', 3600)],
      getAllActivitiesForMembershipOptimized(membershipId: string) {
        return Promise.resolve(this.rows.filter(row => row.membershipId === membershipId));
      },
    };
    const manifest = {
      getActivityName: () => 'Vault of Glass',
      getActivityFamilyName: () => 'Vault of Glass',
    };
    const breakdown = new ActivityBreakdownService(db as any, manifest as any, { getBatch: async () => new Map() } as any);
    let reads = 0;
    let loadingOnSecondRead = true;
    const realCounts = breakdown.getActivityCounts.bind(breakdown);
    breakdown.getActivityCounts = async (ids: string[]) => {
      reads += 1;
      if (reads === 2) {
        loadingOnSecondRead = ps.loadingActivityBreakdown;
      }
      return realCounts(ids);
    };

    const unused = {} as any;
    const ps = Object.create(PlayerSearchComponent.prototype) as PlayerSearchComponent;
    Object.assign(ps, {
      selectedPlayers: [{ membershipId: 'm1', displayName: 'Guardian', membershipType: 2, game: 'D2' }],
      activeTab: 'breakdown',
      selectedAccountKeysForBreakdown: new Set<string>(),
      activityBreakdownGroups: [],
      activityBreakdownRows: null,
      selectedBreakdownCardLabels: new Set<string>(),
      loadingActivityBreakdown: false,
      breakdownView: new BreakdownView(),
      breakdownRetainExpansion: false,
      breakdownLoadGen: 0,
      breakdownLoadInFlight: false,
      breakdownDirty: false,
      breakdownRefreshTimer: null,
      BATCH_UPDATE_DELAY: 500,
      activityBreakdownService: breakdown,
      cdr: { markForCheck() {}, detectChanges() {} },
      breakdownChartCategory: 'all',
      breakdownChartGame: 'all',
      breakdownLastPlayedSort: null,
      perPlatformStats: [],
      accountStats: { totalTime: 0, totalActivityTime: 0, bungieTotalTime: 0 },
    });

    let opened = false;
    ps.loadActivityBreakdown().then(() => { opened = true; });
    flushMicrotasks();
    expect(opened).toBe(true);
    expect(ps.activityBreakdownTotalTimeSeconds).toBe(3600);
    expect(ps.loadingActivityBreakdown).toBe(false);

    const label = ps.activityBreakdownSummaryCards[0].label;
    ps.selectedBreakdownCardLabels = new Set([label]);

    db.rows.push(stored('2', 7200));
    (ps as any).noteActivitiesStored();
    tick(500);
    flushMicrotasks();

    expect(reads).toBe(2);
    expect(loadingOnSecondRead).toBe(false);
    expect(ps.loadingActivityBreakdown).toBe(false);
    expect(ps.activityBreakdownTotalTimeSeconds).toBe(10800);
    expect(ps.selectedBreakdownCardLabels.has(label)).toBe(true);
    expect(ps.activityBreakdownGroups[0].rows[0].runs).toBe(2);
  }));
});
