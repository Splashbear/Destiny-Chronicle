import { Injectable, computed, signal } from '@angular/core';
import { PlayerSearchDisplay } from '../../models/player-search-display.model';
import { LoadingProgress } from '../../models/loading-progress.model';

/** Archive coverage chip state (CODE_CLEANUP_SPEC Step 3 / ProfileStore). */
export interface ArchiveCoverageSnapshot {
  level: 'full' | 'partial' | 'absent';
  through: string;
  instanceId: string;
}

/**
 * CODE_CLEANUP_SPEC — selected accounts, load progress, and archive coverage.
 * Player-search remains the writer; tabs/shared UI read these signals.
 */
@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly _selectedPlayers = signal<PlayerSearchDisplay[]>([]);
  private readonly _profileLoadInProgress = signal(false);
  private readonly _archiveCoverage = signal<ArchiveCoverageSnapshot | null>(null);
  private readonly _showLoadingModal = signal(false);
  private readonly _loadingProgress = signal<LoadingProgress | null>(null);

  readonly selectedPlayers = this._selectedPlayers.asReadonly();
  readonly profileLoadInProgress = this._profileLoadInProgress.asReadonly();
  readonly archiveCoverage = this._archiveCoverage.asReadonly();
  readonly showLoadingModal = this._showLoadingModal.asReadonly();
  readonly loadingProgress = this._loadingProgress.asReadonly();

  readonly selectedPlayerCount = computed(() => this._selectedPlayers().length);

  setSelectedPlayers(players: PlayerSearchDisplay[]): void {
    this._selectedPlayers.set(players ? [...players] : []);
  }

  setProfileLoadInProgress(v: boolean): void {
    this._profileLoadInProgress.set(!!v);
  }

  setArchiveCoverage(cov: ArchiveCoverageSnapshot | null): void {
    this._archiveCoverage.set(cov ? { ...cov } : null);
  }

  setShowLoadingModal(v: boolean): void {
    this._showLoadingModal.set(!!v);
  }

  setLoadingProgress(p: LoadingProgress | null): void {
    this._loadingProgress.set(p ? { ...p } : null);
  }

  /** Sync all profile UI fields from the player-search host (no fetch logic). */
  syncFromHost(host: {
    selectedPlayers: PlayerSearchDisplay[];
    profileLoadInProgress: boolean;
    archiveCoverage: ArchiveCoverageSnapshot | null;
    showLoadingModal: boolean;
    loadingProgress: LoadingProgress | null;
  }): void {
    this.setSelectedPlayers(host.selectedPlayers);
    this.setProfileLoadInProgress(host.profileLoadInProgress);
    this.setArchiveCoverage(host.archiveCoverage);
    this.setShowLoadingModal(host.showLoadingModal);
    this.setLoadingProgress(host.loadingProgress);
  }

  reset(): void {
    this._selectedPlayers.set([]);
    this._profileLoadInProgress.set(false);
    this._archiveCoverage.set(null);
    this._showLoadingModal.set(false);
    this._loadingProgress.set(null);
  }
}
