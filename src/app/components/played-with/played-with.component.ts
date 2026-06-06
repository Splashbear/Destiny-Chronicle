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
import { PrunedPgcr } from '../../utils/pgcr-prune';
import { DestinyLoaderComponent } from '../destiny-loader/destiny-loader.component';
import { UiI18nService } from '../../services/ui-i18n.service';

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
  prefetchActive = false;
  prefetchRemaining = 0;

  sortColumn: PlayedWithSortColumn = 'activities';
  sortDirection: 'asc' | 'desc' = 'desc';

  private subs = new Subscription();
  private reloadToken = 0;

  constructor(
    public uiI18n: UiI18nService,
    private fireteamStats: FireteamStatsService,
    private prefetch: PlayedWithPrefetchService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['membershipIds']) {
      void this.reload();
    }
  }

  ngOnDestroy(): void {
    this.prefetch.cancel();
    this.subs.unsubscribe();
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

    if (!this.membershipIds.length) {
      this.session = null;
      this.coverage = null;
      this.sortedPartners = [];
      this.loading = false;
      this.prefetchActive = false;
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
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
      this.session = s;
      this.coverage = s.coverage;
      this.applySort();
      this.loading = false;
      this.cdr.markForCheck();
    });

    if (token !== this.reloadToken) {
      return;
    }

    this.session = session;
    this.coverage = session.coverage;
    this.applySort();
    this.loading = false;
    this.cdr.markForCheck();

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

  private applySort(): void {
    if (!this.session) {
      this.sortedPartners = [];
      return;
    }
    this.sortedPartners = this.session.sortPartners(this.sortColumn, this.sortDirection);
  }
}
