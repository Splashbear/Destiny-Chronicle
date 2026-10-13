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

/**
 * Stable key for a set of membership ids. The parent binds a getter that returns a new
 * array on every change-detection pass, so reference equality cannot be used.
 */
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
    if (changes['membershipIds']) {
      // Parent passes a fresh array each change-detection pass; only reload when the set
      // of ids actually changes. Otherwise every CD cycle restarted the load and discarded
      // the in-flight result, leaving the tab blank forever.
      const key = membershipIdsKey(this.membershipIds);
      if (key === this.idsKey && !changes['membershipIds'].firstChange) {
        return;
      }
      this.idsKey = key;
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

    this.loading = true;
    this.building = false;
    this.buildingStatus = '';
    this.session = null;
    this.coverage = null;
    this.sortedPartners = [];
    this.cdr.markForCheck();

    this.subs.add(
      this.prefetch.progress$.subscribe(p => {
        this.prefetchActive = p.active;
        this.prefetchRemaining = p.remainingThisRun;
        this.cdr.markForCheck();
      })
    );

    const session = await this.fireteamStats.createSession(this.membershipIds, s => {
      if (token !== this.reloadToken) {
        return;
      }
      this.applySession(s);
    });

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
    this.coverage = session.coverage;
    this.applySort();
    this.loading = false;
    this.building = !!session.pendingBuild;
    this.buildingStatus = session.pendingStatus || '';
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
