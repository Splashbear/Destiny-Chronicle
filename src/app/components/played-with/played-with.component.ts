import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
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
import { PlayedWithAccount, PlayedWithBuildProgress } from '../../services/pgcr-api.service';

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
  @Input() membershipIds: string[] = [];

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

  /** Looked-up accounts (server v2) and which ones are counted. */
  accounts: PlayedWithAccount[] = [];
  included = new Set<string>();
  /** '' = sort by total, else one account id. */
  sortAccount = '';
  expanded = new Set<string>();

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
    if (changes['membershipIds']) {
      // Parent passes a fresh array each change-detection pass; only reload when the set
      // of ids actually changes. Otherwise every CD cycle restarted the load and discarded
      // the in-flight result, leaving the tab blank forever.
      const key = membershipIdsKey(this.membershipIds);
      if (key === this.idsKey && !changes['membershipIds'].firstChange) {
        return;
      }
      this.idsKey = key;
      this.included = new Set(this.membershipIds.map(String));
      this.sortAccount = '';
      this.expanded.clear();
      this.buildWaitStartedAt = null;
      this.buildTimedOut = false;
      // Count views when the feature is shown with accounts; never send the IDs.
      if (Array.isArray(this.membershipIds) && this.membershipIds.length > 0) {
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
      this.sortDirection = column === 'lastPlayed' ? 'desc' : 'desc';
    }
    this.applySort();
    this.cdr.markForCheck();
  }

  accountLabel(a: PlayedWithAccount): string {
    const name = a.name || `Account …${a.id.slice(-4)}`;
    return a.platform ? `${name} (${a.platform})` : name;
  }

  accountName(id: string): string {
    const a = this.accounts.find(x => x.id === id);
    return a ? this.accountLabel(a) : id;
  }

  /** Toggle one account in or out of the merged list (at least one stays on). */
  toggleAccount(id: string): void {
    if (this.included.has(id)) {
      if (this.included.size <= 1) {
        return;
      }
      this.included.delete(id);
      if (this.sortAccount === id) {
        this.sortAccount = '';
      }
    } else {
      this.included.add(id);
    }
    this.buildWaitStartedAt = null;
    void this.reload();
  }

  setSortAccount(id: string): void {
    this.sortAccount = id;
    this.sortColumn = 'activities';
    this.sortDirection = 'desc';
    void this.reload();
  }

  toggleExpanded(id: string): void {
    if (this.expanded.has(id)) {
      this.expanded.delete(id);
    } else {
      this.expanded.add(id);
    }
    this.cdr.markForCheck();
  }

  get includedAccounts(): PlayedWithAccount[] {
    return this.accounts.filter(a => this.included.has(a.id));
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

    if (!this.membershipIds.length) {
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

    const all = this.membershipIds.map(String);
    const include = all.filter(id => this.included.has(id));
    const session = await this.fireteamStats.createSession(
      this.membershipIds,
      s => {
        if (token !== this.reloadToken) {
          return;
        }
        this.applySession(s);
      },
      {
        include: include.length && include.length < all.length ? include : undefined,
        sortBy: this.sortAccount || undefined
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

    void this.prefetch.prefetchForMemberships(this.membershipIds, (pgcrs: PrunedPgcr[]) => {
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
    if (session.accounts?.length) {
      this.accounts = session.accounts;
    }
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
    this.sortedPartners = this.session.sortPartners(this.sortColumn, this.sortDirection, this.sortAccount || undefined);
  }
}
