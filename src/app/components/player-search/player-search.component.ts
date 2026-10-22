import {
  Component,
  OnInit,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router,
  ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { BungieApiService } from '../../core/data/bungie-api.service';
import { DestinyManifestService } from '../../core/data/manifest.service';
import { ActivityStore } from '../../core/state/activity.store';
import { ProfileStore } from '../../core/state/profile.store';
import { ActivityPgcrBatchService } from '../../services/activity-pgcr-batch.service';
import {   ActivityHistoryLoaderService,
} from '../../services/activity-history-loader.service';
import {   ProfileCharacterLoaderService,
} from '../../services/profile-character-loader.service';
import {   PlayerAccountSyncService,
} from '../../services/player-account-sync.service';
import { FavoritesLoadService } from '../../services/favorites-load.service';
import { PlayerSelectLoadService } from '../../services/player-select-load.service';
import { PlayerSearchFlowService } from '../../services/player-search-flow.service';
import {   FilteredActivitiesBrowseService,
} from '../../services/filtered-activities-browse.service';
import { FilteredActivitiesForDateService } from '../../services/filtered-activities-for-date.service';
import { GuardianFirstsLoadService } from '../../services/guardian-firsts-load.service';
import { ArchiveExportFlowService } from '../../services/archive-export-flow.service';
import { ActivityBreakdownLoadService } from '../../services/activity-breakdown-load.service';
import { TitlesTabLoadService } from '../../services/titles-tab-load.service';
import { ExportShareFlowService } from '../../services/export-share-flow.service';
import { AccountLoadingStatusService } from '../../services/account-loading-status.service';
import { CachedActivityHydrateService } from '../../services/cached-activity-hydrate.service';
import { PlayerSearchTabChangeService } from '../../services/player-search-tab-change.service';
import { DateSelectFlowService } from '../../services/date-select-flow.service';
import { PlayerSearchInitService } from '../../services/player-search-init.service';
import { ModalPlayerLoadService } from '../../services/modal-player-load.service';
import {   AccountStatsCalculatorService,
} from '../../services/account-stats-calculator.service';
import {   DateActivityGroupingService,
} from '../../services/date-activity-grouping.service';
import { PgcrCharacterClassEnrichService } from '../../services/pgcr-character-class-enrich.service';
import { PlayerSelectionClearService } from '../../services/player-selection-clear.service';
import { CoverageChipComponent } from '../../shared/ui/coverage-chip.component';
import { PGCRCacheService } from '../../services/pgcr-cache.service';
import { PgcrApiService } from '../../core/data/archive-api.service';
import { SiteAnalyticsService } from '../../services/site-analytics.service';
import { ArchiveService } from '../../services/archive.service';
import { ArchiveRuntimeService } from '../../services/archive-runtime.service';
import { AssetUrlService } from '../../services/asset-url.service';
import { ActivityDbService } from '../../services/activity-db.service';
import { FirstActivityService } from '../../services/first-activity.service';
import { debounceTime, from } from 'rxjs';
import { distinctUntilChanged, exhaustMap } from 'rxjs/operators';
import { TimezoneService } from '../../services/timezone.service';
import { ActivityIconService } from '../../services/activity-icon.service';
import { DatePickerComponent } from '../date-picker/date-picker.component';
import { ActivitiesTabComponent,
  ACTIVITIES_HOST } from '../../features/activities';
import { BreakdownTabComponent,
  BREAKDOWN_HOST } from '../../features/breakdown';
import { FirstsTabComponent,
  FIRSTS_HOST } from '../../features/firsts';
import { TitlesTabComponent,
  TITLES_HOST } from '../../features/titles';
import { AccomplishmentsTabComponent,
  ACCOMPLISHMENTS_HOST } from '../../features/accomplishments';
import { DestinyLoaderComponent } from '../destiny-loader/destiny-loader.component';
import { StatsService } from '../../services/stats.service';
import { TitleService } from '../../services/title.service';
import { SelectedAccountsService } from '../../services/selected-accounts.service';
import { ExportOptionsDialogComponent } from '../export-options-dialog.component';
import { ActivityBreakdownService } from '../../services/activity-breakdown.service';
import { SeasonService } from '../../services/season.service';
import { PGCRModalService } from '../../services/pgcr-modal.service';
import { UiI18nService } from '../../services/ui-i18n.service';
import { LocaleService } from '../../services/locale.service';
import { AnniversaryCelebrationBannerComponent } from '../anniversary-celebration-banner/anniversary-celebration-banner.component';
import {   type ActivitiesViewMode,
  type ActivitiesChronologicalSort,
  } from '../../utils/activities-view-prefs';
import {   type RegressionBaseline } from '../../utils/regression-baseline';
import { ActivityHeatmapComponent } from '../../features/heatmap';
import { PlayedWithComponent } from '../../features/played-with';
import { DecryptedShareCardComponent } from '../decrypted-share-card/decrypted-share-card.component';
import { LoadEngramComponent } from '../../shared/ui/load-engram.component';
import { DecryptLandingComponent } from '../decrypt-landing/decrypt-landing.component';
import { Engram3dComponent } from '../engram-3d/engram-3d.component';
import {
  installRegressionProbe as installRegressionProbeFn,
  uninstallRegressionProbe as uninstallRegressionProbeFn,
  ensureTitlesForRegression as ensureTitlesForRegressionFn,
  isRegressionSnapshotReady as isRegressionSnapshotReadyFn,
  getRegressionSnapshot as getRegressionSnapshotFn,
} from './player-search-regression';
import { build_asPlayerSelectionRemoveHost } from './player-search-host-adapters';
import { PlayerSearchUiMixin } from './player-search-ui-mixin';
import './player-search-charts';

const HIDE_GET_STARTED_KEY = 'destiny-chronicle-hide-get-started';

export type { ActivitiesViewMode, ActivitiesChronologicalSort };
export type {
  TypeGroup,
  YearGroup,
  ChronologicalActivityRow,
  GameGroup,
  CharacterWithGame,
  ActivityCache,
  VerificationResult,
  TitleObjective,
  TitleRecord,
  ProfileRecordsResponse,
} from './player-search.types';

// Phase 4: UI Rendering Optimization
@Component({
  selector: 'app-player-search',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ExportOptionsDialogComponent,
    DatePickerComponent,
    ActivitiesTabComponent,
    BreakdownTabComponent,
    FirstsTabComponent,
    TitlesTabComponent,
    AccomplishmentsTabComponent,
    DestinyLoaderComponent,
    CoverageChipComponent,
    LoadEngramComponent,
    DecryptLandingComponent,
    Engram3dComponent,
    DecryptedShareCardComponent,
    ActivityHeatmapComponent,
    PlayedWithComponent
  ],
  providers: [
    { provide: ACTIVITIES_HOST, useExisting: PlayerSearchComponent },
    { provide: BREAKDOWN_HOST, useExisting: PlayerSearchComponent },
    { provide: FIRSTS_HOST, useExisting: PlayerSearchComponent },
    { provide: TITLES_HOST, useExisting: PlayerSearchComponent },
    { provide: ACCOMPLISHMENTS_HOST, useExisting: PlayerSearchComponent },
  ],
  templateUrl: './player-search.component.html',
  styleUrls: ['./player-search.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerSearchComponent extends PlayerSearchUiMixin implements OnInit, OnDestroy {

  constructor(
    private bungieService: BungieApiService,
    public manifest: DestinyManifestService,
    private cdr: ChangeDetectorRef,
    private activityStore: ActivityStore,
    private profileStore: ProfileStore,
    private activityPgcrBatch: ActivityPgcrBatchService,
    private activityHistoryLoader: ActivityHistoryLoaderService,
    private profileCharacterLoader: ProfileCharacterLoaderService,
    private playerAccountSync: PlayerAccountSyncService,
    private favoritesLoad: FavoritesLoadService,
    private playerSelectLoad: PlayerSelectLoadService,
    private playerSearchFlow: PlayerSearchFlowService,
    private filteredActivitiesBrowse: FilteredActivitiesBrowseService,
    private filteredActivitiesForDateSvc: FilteredActivitiesForDateService,
    private guardianFirstsLoad: GuardianFirstsLoadService,
    private archiveExportFlow: ArchiveExportFlowService,
    private activityBreakdownLoad: ActivityBreakdownLoadService,
    private titlesTabLoad: TitlesTabLoadService,
    private exportShareFlow: ExportShareFlowService,
    private accountLoadingStatusSvc: AccountLoadingStatusService,
    private cachedActivityHydrate: CachedActivityHydrateService,
    private playerSearchTabChange: PlayerSearchTabChangeService,
    private dateSelectFlow: DateSelectFlowService,
    private playerSearchInit: PlayerSearchInitService,
    private modalPlayerLoad: ModalPlayerLoadService,
    private accountStatsCalculator: AccountStatsCalculatorService,
    private dateActivityGrouping: DateActivityGroupingService,
    private pgcrCharacterClassEnrich: PgcrCharacterClassEnrichService,
    private playerSelectionClear: PlayerSelectionClearService,
    private pgcrCacheService: PGCRCacheService,
    private activityDb: ActivityDbService,
    private timezoneService: TimezoneService,
    private activityIconService: ActivityIconService,
    private statsService: StatsService,
    private titleService: TitleService,
    private selectedAccounts: SelectedAccountsService,
    private firstActivityService: FirstActivityService,
    private activityBreakdownService: ActivityBreakdownService,
    private seasonService: SeasonService,
    private pgcrModalService: PGCRModalService,
    public uiI18n: UiI18nService,
    private locale: LocaleService,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    private archiveService: ArchiveService,
    public archiveRuntime: ArchiveRuntimeService,
    private assetUrl: AssetUrlService,
    private pgcrApiService: PgcrApiService,
    private siteAnalytics: SiteAnalyticsService
  ) {
    super();
    (window as any).activityDbService = this.activityDb;
    this.hideGetStartedBanner = typeof localStorage !== 'undefined' && localStorage.getItem(HIDE_GET_STARTED_KEY) === 'true';
    this.loadActivityCollapseState();
    this.loadActivitiesViewPreferences();
    this.updatePlatformTabs();
    this.loadDismissedAnniversaries();

    // Debounce username input changes (300 ms). No API hit yet; prepares for future live suggestions.
    this.searchTerm$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((term: string) => {
        this.searchUsername = term;
      });

    // Debounce heavy account-stats calculation; ignore new triggers while one is running
    this.statsDebounce$
      .pipe(
        debounceTime(1000),
        exhaustMap(() => from(this.calculateAccountStats()))
      )
      .subscribe();
  }

  /**
   * Formats a duration in seconds as Hh Mm (e.g. 7098h 08m).
   */
  async ngOnInit() {
    await this.playerSearchInit.runNgOnInit(this.asPlayerSearchInitHost());
  }

  ngOnDestroy() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    }
    this.uninstallRegressionProbe();
    // Clean up any subscriptions or timers
    this.statsDebounce$.complete();
    this.filteredActivities$.complete();
    if (this.breakdownRefreshTimer) {
      clearTimeout(this.breakdownRefreshTimer);
      this.breakdownRefreshTimer = null;
    }
  }

  /**
   * E2E regression probe (CODE_CLEANUP_SPEC Step 1).
   * Playwright reads window.__dcRegression.getSnapshot() after load.
   */
  private installRegressionProbe(): void {
    installRegressionProbeFn(this);
  }

  private uninstallRegressionProbe(): void {
    uninstallRegressionProbeFn();
  }

  /** Force-load D2 titles then refresh stats (e2e sealCount). Hard-capped. */
  async ensureTitlesForRegression(): Promise<void> {
    await ensureTitlesForRegressionFn(this);
  }

  /**
   * True when selected accounts have non-zero activity totals.
   * Firsts/titles/played-with may still be settling — e2e soft-skips those if empty.
   */
  isRegressionSnapshotReady(): boolean {
    return isRegressionSnapshotReadyFn(this);
  }

  /** Canonical regression snapshot for e2e baseline capture/compare. */
  getRegressionSnapshot(): RegressionBaseline {
    return getRegressionSnapshotFn(this);
  }


  /**
   * Handle ESC key press to close modals and other keyboard shortcuts
   */
  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        this.handleEscapeKey();
        break;
      case 'Enter':
        this.handleEnterKey(event);
        break;
      case 'Tab':
        this.handleTabKey(event);
        break;
    }
  }


  /**
   * Updates the loading status for a specific account
   */

  /** Keep on typed component — mixin @ts-nocheck collapses Observable type for the template. */
  get pgcrPrefetchProgress$() {
    return this.activityDb.pgcrPrefetchProgress$;
  }
}
