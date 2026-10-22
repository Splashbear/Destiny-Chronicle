import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  FireteamCoverage,
  FireteamPartnerRow,
  FireteamStatsService,
  FireteamStatsSession,
  PlayedWithSortColumn
} from '../../services/fireteam-stats.service';
import { PlayedWithPrefetchService } from '../../services/played-with-prefetch.service';
import { SiteAnalyticsService } from '../../services/site-analytics.service';
import { PrunedPgcr } from '../../utils/pgcr-prune';
import { DestinyLoaderComponent } from '../destiny-loader/destiny-loader.component';
import { UiI18nService } from '../../services/ui-i18n.service';
import { PlayedWithBuildProgress } from '../../services/pgcr-api.service';
import { PlayedWithAccountChoice } from '../../utils/played-with-accounts';
import { TextViewService } from '../../services/text-view.service';
import { pageSections, playedWithDisplayName } from '../../utils/text-tab-rows';
import { ActivityDbService } from '../../services/activity-db.service';
import { PGCRModalService } from '../../services/pgcr-modal.service';

/**
 * Stable key for a set of membership ids. The parent binds a getter that returns a new
 * array on every change-detection pass, so reference equality cannot be used.
 */
/**
 * Honest progress line from the server's real counts. Returns '' when the server reported none.
 * Stages: queued (position) → loading games per account → scanning archive batches → ranking.
 */
export function formatBuildProgress(
  status: string | undefined,
  position: number | null | undefined,
  p: PlayedWithBuildProgress | null | undefined
): string {
  const n = (x: number) => x.toLocaleString('en-US');
  if (p) {
    if (p.stage === 'loading_games') {
      return `Loading game history: ${n(p.accountsLoaded)} of ${n(p.accountsTotal)} accounts (${n(p.games)} games found)`;
    }
    if (p.stage === 'scanning' && p.batchesTotal) {
      const pct = Math.floor(((p.batchesDone || 0) / p.batchesTotal) * 100);
      return `Scanning ${n(p.games)} games for fireteam members: ${pct}% (${n(p.batchesDone || 0)} of ${n(p.batchesTotal)} archive batches)`;
    }
    if (p.stage === 'ranking') {
      return `Ranking players you've played with across ${n(p.games)} games…`;
    }
    if (p.stage === 'bungie_history') {
      return `Checking Bungie for games newer than the archive (${n(p.games)} archive games done)`;
    }
    if (p.stage === 'bungie_pgcrs') {
      return `Loading ${n(p.pgcrsTotal || 0)} newer games from Bungie: ${n(p.pgcrsDone || 0)} of ${n(p.pgcrsTotal || 0)}`;
    }
  }
  if (status === 'pending' && position) {
    return position === 1 ? 'Next in line to build' : `Waiting in line: #${n(position)}`;
  }
  if (status === 'running') {
    return 'Build started…';
  }
  return '';
}

export function membershipIdsKey(ids: readonly string[] | null | undefined): string {
  if (!Array.isArray(ids)) {
    return '';
  }
  return [...new Set(ids.map(String))].sort().join('+');
}

@Component({
  selector: 'app-played-with',
  standalone: true,
  imports: [CommonModule, DestinyLoaderComponent],
  templateUrl: './played-with.component.html',
  styleUrls: ['./played-with.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlayedWithComponent implements OnChanges, OnDestroy {
  readonly text = inject(TextViewService);
  private readonly activityDb = inject(ActivityDbService);
  private readonly pgcrModal = inject(PGCRModalService);
  readonly pageSize = 40;
  textPages = 1;
  /** Destiny 2 accounts the parent loaded. The dropdown selects one; the list is that account only. */
  @Input() accounts: PlayedWithAccountChoice[] = [];
  selectedId = '';

  session: FireteamStatsSession | null = null;
  coverage: FireteamCoverage | null = null;
  sortedPartners: FireteamPartnerRow[] = [];
  loading = false;
  /** Archive API is building a summary; partners are not ready yet. */
  building = false;
  buildingStatus = '';
  /** Real progress line from the server (empty when it has none). */
  buildingProgress = '';
  /** Summary build exceeded MAX_BUILD_WAIT_MS; stop polling and tell the user. */
  buildTimedOut = false;
  prefetchActive = false;
  prefetchRemaining = 0;

  sortColumn: PlayedWithSortColumn = 'activities';
  sortDirection: 'asc' | 'desc' = 'desc';

  private subs = new Subscription();
  private reloadToken = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly POLL_MS = 15_000;
  static MAX_BUILD_WAIT_MS = 20 * 60_000;
  private idsKey = '';
  private buildWaitStartedAt: number | null = null;

  constructor(
    public uiI18n: UiI18nService,
    private fireteamStats: FireteamStatsService,
    private prefetch: PlayedWithPrefetchService,
    private cdr: ChangeDetectorRef,
    private siteAnalytics: SiteAnalyticsService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['accounts']) {
      // Parent passes a fresh array each change-detection pass; only reload when the set
      // of ids actually changes. Otherwise every CD cycle restarted the load and discarded
      // the in-flight result, leaving the tab blank forever.
      const key = membershipIdsKey((this.accounts || []).map(account => account.id));
      if (key === this.idsKey && !changes['accounts'].firstChange) {
        return;
      }
      const keepSelection = this.accounts.some(account => account.id === this.selectedId);
      this.idsKey = key;
      if (!keepSelection) {
        this.selectedId = this.accounts[0]?.id || '';
      }
      this.buildWaitStartedAt = null;
      this.buildTimedOut = false;
      // Count views when the feature is shown with accounts; never send the IDs.
      if (this.accounts.length > 0) {
        this.siteAnalytics.trackFeatureView('played_with');
      }
      void this.reload();
    }
  }

  ngOnDestroy(): void {
    this.clearPoll();
    this.prefetch.cancel();
    this.subs.unsubscribe();
  }

  private clearPoll(): void {
    if (this.pollTimer != null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) {
      return '0m';
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) {
      return `${h}h ${m}m`;
    }
    return `${m}m`;
  }

  formatDate(iso?: string): string {
    if (!iso) {
      return '—';
    }
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return iso;
    }
  }

  toggleSort(column: PlayedWithSortColumn): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'desc' ? 'asc' : 'desc';
    } else {
      this.sortColumn = column;
      this.sortDirection = column === 'firstPlayed' ? 'asc' : 'desc';
    }
    this.applySort();
    this.cdr.markForCheck();
  }

  showMoreTextRows(): void {
    this.textPages += 1;
    this.cdr.markForCheck();
  }

  partnerName(name: string | null | undefined): string {
    return playedWithDisplayName(name);
  }

  async openPartnerGame(row: FireteamPartnerRow, which: 'first' | 'last'): Promise<void> {
    const period = which === 'first' ? row.firstPlayedTogether : row.lastPlayedTogether;
    if (!period) {
      return;
    }
    let instanceId = which === 'first' ? row.firstInstanceId : row.lastInstanceId;
    if (!instanceId && this.selectedId) {
      const activity = await this.activityDb.findD2ActivityByMembershipPeriod(this.selectedId, period);
      instanceId = activity?.activityDetails?.instanceId || activity?.instanceId;
    }
    if (!instanceId) {
      return;
    }
    this.pgcrModal.openPgcrLite({
      instanceId: String(instanceId),
      isD1: false,
      membershipId: this.selectedId || undefined,
      period,
      activityLabel: which === 'first' ? 'First played together' : 'Last played together',
    });
  }

  textPartners(): { sections: Array<{ title: string; rows: FireteamPartnerRow[] }>; total: number; shown: number } {
    return pageSections([{ title: 'Played with', rows: this.sortedPartners }], this.pageSize, this.textPages);
  }

  selectAccount(id: string): void {
    if (!id || id === this.selectedId || !this.accounts.some(account => account.id === id)) {
      return;
    }
    this.selectedId = id;
    this.buildWaitStartedAt = null;
    this.buildTimedOut = false;
    void this.reload();
  }

  sortIndicator(column: PlayedWithSortColumn): string {
    if (this.sortColumn !== column) {
      return '';
    }
    return this.sortDirection === 'desc' ? ' ↓' : ' ↑';
  }

  private async reload(): Promise<void> {
    const token = ++this.reloadToken;
    this.subs.unsubscribe();
    this.subs = new Subscription();
    this.prefetch.cancel();
    this.clearPoll();

    if (!this.selectedId) {
      this.session = null;
      this.coverage = null;
      this.sortedPartners = [];
      this.loading = false;
      this.building = false;
      this.prefetchActive = false;
      this.cdr.markForCheck();
      return;
    }

    const keepTable = this.sortedPartners.length > 0;
    this.loading = !keepTable;
    if (!keepTable) {
      this.building = false;
      this.buildingStatus = '';
      this.session = null;
      this.coverage = null;
      this.sortedPartners = [];
    }
    this.cdr.markForCheck();

    this.subs.add(
      this.prefetch.progress$.subscribe(p => {
        this.prefetchActive = p.active;
        this.prefetchRemaining = p.remainingThisRun;
        this.cdr.markForCheck();
      })
    );

    const session = await this.fireteamStats.createSession(
      [this.selectedId],
      s => {
        if (token !== this.reloadToken) {
          return;
        }
        this.applySession(s);
      }
    );

    if (token !== this.reloadToken) {
      return;
    }

    this.applySession(session);

    if (session.pendingBuild) {
      if (this.buildWaitStartedAt == null) {
        this.buildWaitStartedAt = Date.now();
      }
      if (Date.now() - this.buildWaitStartedAt >= PlayedWithComponent.MAX_BUILD_WAIT_MS) {
        this.building = false;
        this.buildTimedOut = true;
        this.cdr.markForCheck();
        return;
      }
      this.pollTimer = setTimeout(() => {
        if (token === this.reloadToken) {
          void this.reload();
        }
      }, PlayedWithComponent.POLL_MS);
      return;
    }

    if (session.fromApi) {
      // Some accounts still building (or refreshing newer games): keep polling so they join the list.
      const busy = !!session.partial || (session.accounts || []).some(a => a.refreshing);
      if (busy) {
        this.pollTimer = setTimeout(() => {
          if (token === this.reloadToken) {
            void this.reload();
          }
        }, PlayedWithComponent.POLL_MS);
      }
      return;
    }

    void this.prefetch.prefetchForMemberships([this.selectedId], (pgcrs: PrunedPgcr[]) => {
      if (token !== this.reloadToken || !this.session) {
        return;
      }
      this.session.mergePgcrBatch(pgcrs);
      this.coverage = this.session.coverage;
      this.applySort();
      this.cdr.markForCheck();
    });
  }

  private applySession(session: FireteamStatsSession): void {
    this.session = session;
    this.coverage = session.coverage;
    this.applySort();
    this.loading = false;
    this.building = !!session.pendingBuild;
    this.buildingStatus = session.pendingStatus || '';
    this.buildingProgress = session.pendingBuild
      ? formatBuildProgress(session.pendingStatus, session.pendingPosition, session.pendingProgress)
      : '';
    this.cdr.markForCheck();
  }

  private applySort(): void {
    if (!this.session) {
      this.sortedPartners = [];
      return;
    }
    this.sortedPartners = this.session.sortPartners(this.sortColumn, this.sortDirection);
  }
}
