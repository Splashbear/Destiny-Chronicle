import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { BungieApiService } from '../../services/bungie-api.service';
import { PGCRCacheService } from '../../services/pgcr-cache.service';
import { ArchiveRuntimeService } from '../../services/archive-runtime.service';
import { UiI18nService } from '../../services/ui-i18n.service';
import { LocaleService } from '../../services/locale.service';
import { DestinyLoaderComponent } from '../destiny-loader/destiny-loader.component';
import { firstValueFrom } from 'rxjs';
import { pickBestPlayerDisplayName } from '../../utils/pgcr-player-name';
import {
  extractPrunedPlayers,
  filterPrunedPlayersToFireteam,
  isUsablePrunedPgcr,
  PrunedPgcr,
  pgcrPeriodMatches,
  normalizePgcrPeriodKey,
  pgcrPeriodMatchesForD1,
  prunePgcr,
  resolvePgcrPeriod,
} from '../../utils/pgcr-prune';

export interface PgcrLiteDialogData {
  instanceId: string;
  isD1: boolean;
  membershipId?: string;
  activityLabel?: string;
  period?: string;
  preferredDisplayName?: string;
}

interface LitePlayerRow {
  name: string;
  className: string;
  timeSeconds: number;
}

@Component({
  selector: 'app-pgcr-lite',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, DestinyLoaderComponent],
  template: `
    <div class="pgcr-lite pgcr-modal-enter p-0 text-white min-w-[280px] max-w-[480px] overflow-hidden">
      <div class="pgcr-modal-header-band px-4 pt-4 pb-3">
        <div class="flex items-start justify-between gap-2 relative z-10">
          <div>
            <h2 class="text-lg font-semibold m-0 font-d2-headline text-gradient">{{ data.activityLabel || i18n.t('pgcr.title') }}</h2>
            <p *ngIf="period" class="text-sm text-slate-400 m-0 mt-1">{{ period | date:'medium':'':intlLocale }}</p>
            <p *ngIf="durationSeconds > 0" class="text-xs text-slate-500 m-0 mt-0.5">
              Activity duration: {{ formatTime(durationSeconds) }}
            </p>
          </div>
          <button type="button" mat-dialog-close class="text-slate-400 hover:text-white text-xl leading-none" [attr.aria-label]="i18n.t('common.close')">&times;</button>
        </div>
      </div>

      <div class="px-4 pb-4">
      <div *ngIf="loading" class="py-6 flex justify-center">
        <app-destiny-loader [label]="i18n.t('pgcr.loading')"></app-destiny-loader>
      </div>
      <div *ngIf="!loading && error" class="py-4 px-3 rounded bg-amber-900/30 border border-amber-600/40 text-amber-200 text-sm mb-3">{{ error }}</div>

      <ul *ngIf="!loading && !error && players.length" class="space-y-2 max-h-[50vh] overflow-y-auto mb-4">
        <li *ngFor="let p of players"
            class="flex items-center justify-between gap-2 destiny-panel rounded px-3 py-2 text-sm">
          <span class="text-slate-200 truncate" [title]="p.name">{{ p.name }}</span>
          <span class="text-slate-400 shrink-0 font-mono text-xs">{{ formatTime(p.timeSeconds) }}</span>
        </li>
      </ul>
      <p *ngIf="!loading && !error && !players.length" class="text-slate-400 text-sm mb-4">{{ i18n.t('pgcr.noPlayers') }}</p>

      <div class="flex flex-wrap gap-2 justify-end border-t border-slate-700 pt-3">
        <button type="button" mat-dialog-close class="px-3 py-1.5 text-sm text-slate-300 hover:text-white rounded">
          {{ i18n.t('pgcr.close') }}
        </button>
        <button *ngIf="!isOfflineMode" type="button"
                (click)="openFullPgcr()"
                class="px-3 py-1.5 text-sm bg-[var(--destiny-gold)] hover:brightness-110 text-slate-900 font-medium rounded">
          {{ i18n.t('pgcr.full') }}
        </button>
      </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .pgcr-lite { background: #0c0a14; }
  `]
})
export class PgcrLiteComponent implements OnInit {
  loading = true;
  error: string | null = null;
  players: LitePlayerRow[] = [];
  durationSeconds = 0;
  period = '';
  intlLocale = 'en-US';
  isOfflineMode = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: PgcrLiteDialogData,
    private dialogRef: MatDialogRef<PgcrLiteComponent>,
    private bungie: BungieApiService,
    private pgcrCache: PGCRCacheService,
    public i18n: UiI18nService,
    locale: LocaleService,
    private archiveRuntime: ArchiveRuntimeService
  ) {
    this.intlLocale = locale.intlLocale;
    this.isOfflineMode = archiveRuntime.isOfflineMode;
  }

  async ngOnInit(): Promise<void> {
    this.period = this.data.period || '';
    try {
      let pruned = await this.loadCached();
      if (pruned && this.needsFreshPgcr(pruned)) {
        pruned = undefined;
      }

      if (!pruned) {
        if (this.archiveRuntime.isReadOnly) {
          this.error = this.i18n.t('archive.pgcrNotArchived');
          return;
        }
        const raw = await firstValueFrom(this.bungie.getPGCR(this.data.instanceId, this.data.isD1));
        const fromRaw = this.pruneRaw(raw);

        if (!this.acceptPgcrForActivity(raw, fromRaw)) {
          this.error = this.i18n.t('pgcr.error');
          return;
        }

        if (this.data.isD1) {
          await this.pgcrCache.cacheD1PGCR(
            this.data.instanceId,
            raw,
            this.data.membershipId,
            this.data.period
          );
        } else {
          await this.pgcrCache.cacheD2PGCR(this.data.instanceId, raw);
        }
        pruned = fromRaw;
      }

      if (!pruned || !isUsablePrunedPgcr(pruned)) {
        this.error = this.i18n.t('pgcr.error');
        return;
      }

      this.applyPruned(pruned);
    } catch {
      this.error = this.i18n.t('pgcr.errorRetry');
    } finally {
      this.loading = false;
    }
  }

  private pruneRaw(raw: any): PrunedPgcr {
    return prunePgcr(raw, this.data.membershipId, { isD1: this.data.isD1 });
  }

  /** True when the Bungie payload matches the activity row the user clicked. */
  private acceptPgcrForActivity(raw: any, pruned: PrunedPgcr): boolean {
    if (!isUsablePrunedPgcr(pruned)) {
      return false;
    }
    if (!this.data.period) {
      return true;
    }
    const rawPeriod = resolvePgcrPeriod(raw) || pruned.period;
    if (this.data.isD1) {
      const activityYear = new Date(normalizePgcrPeriodKey(this.data.period)).getUTCFullYear();
      const pgcrYear = new Date(normalizePgcrPeriodKey(rawPeriod)).getUTCFullYear();
      if (!Number.isNaN(activityYear) && activityYear === pgcrYear) {
        return true;
      }
    }
    const periodOk = this.data.isD1
      ? pgcrPeriodMatchesForD1(this.data.period, rawPeriod)
      : pgcrPeriodMatches(this.data.period, rawPeriod);
    if (periodOk) {
      return true;
    }
    return this.anchorInRawEntries(raw?.entries);
  }

  private anchorInRawEntries(entries: unknown): boolean {
    if (!Array.isArray(entries)) {
      return false;
    }
    const mid = this.data.membershipId ? String(this.data.membershipId) : '';
    const preferred = this.data.preferredDisplayName?.trim().toLowerCase();
    for (const e of entries as Array<{ player?: { destinyUserInfo?: { membershipId?: string; displayName?: string } } }>) {
      const info = e?.player?.destinyUserInfo;
      if (mid && String(info?.membershipId ?? '') === mid) {
        return true;
      }
      if (preferred && info?.displayName?.trim().toLowerCase() === preferred) {
        return true;
      }
    }
    return false;
  }

  private async loadCached(): Promise<PrunedPgcr | undefined> {
    return this.data.isD1
      ? this.pgcrCache.getD1PGCR(this.data.instanceId, this.data.period)
      : this.pgcrCache.getD2PGCR(this.data.instanceId);
  }

  private needsFreshPgcr(pruned: PrunedPgcr): boolean {
    if (!isUsablePrunedPgcr(pruned)) {
      return true;
    }
    if (this.data.period) {
      const periodOk = this.data.isD1
        ? pgcrPeriodMatchesForD1(this.data.period, pruned.period)
        : pgcrPeriodMatches(this.data.period, pruned.period);
      if (!periodOk && !this.anchorInPrunedPlayers(pruned)) {
        return true;
      }
    }
    const players = extractPrunedPlayers(pruned);
    if (!players.some(p => !!p.name && p.name !== 'Guardian')) {
      return true;
    }
    const anchorId = this.resolveAnchorMembershipId(players);
    if (this.data.isD1 && anchorId) {
      if (!players.some(p => String(p.id) === anchorId)) {
        return true;
      }
      if (players.length > 6 && !players.some(p => p.team !== undefined)) {
        return true;
      }
    }
    return false;
  }

  private anchorInPrunedPlayers(pruned: PrunedPgcr): boolean {
    return this.anchorInRawEntries(
      pruned.entries?.length
        ? pruned.entries.map(e => ({
            player: {
              destinyUserInfo: {
                membershipId: e.player?.destinyUserInfo?.membershipId,
                displayName: e.player?.destinyUserInfo?.displayName,
              },
            },
          }))
        : extractPrunedPlayers(pruned).map(p => ({
            player: { destinyUserInfo: { membershipId: p.id, displayName: p.name } },
          }))
    );
  }

  private resolveAnchorMembershipId(players: PrunedPgcr['players']): string | undefined {
    if (this.data.membershipId) {
      return String(this.data.membershipId);
    }
    const preferred = this.data.preferredDisplayName?.trim().toLowerCase();
    if (!preferred) {
      return undefined;
    }
    const hit = players.find(p => p.name?.trim().toLowerCase() === preferred);
    return hit?.id || undefined;
  }

  private applyPruned(pruned: PrunedPgcr): void {
    this.durationSeconds = pruned.duration || 0;
    this.period = this.data.period || pruned.period || '';

    let sourcePlayers = extractPrunedPlayers(pruned);
    const anchorId = this.resolveAnchorMembershipId(sourcePlayers);
    if (this.data.isD1 && anchorId && sourcePlayers.length > 0) {
      const fireteam = filterPrunedPlayersToFireteam(sourcePlayers, anchorId);
      // If team metadata is missing, show everyone in the instance rather than one player.
      sourcePlayers = fireteam.length > 1 ? fireteam : sourcePlayers;
    }

    const seen = new Set<string>();
    this.players = [];
    const preferred = this.data.preferredDisplayName?.trim();

    for (const p of sourcePlayers) {
      const key = p.id || p.name || '';
      if (key && seen.has(key)) {
        continue;
      }
      if (key) {
        seen.add(key);
      }

      let name = p.name || 'Guardian';
      if (preferred && anchorId && String(p.id) === anchorId) {
        name = pickBestPlayerDisplayName(preferred, name);
      }

      const timeSeconds =
        p.timeSeconds != null && p.timeSeconds > 0 ? p.timeSeconds : this.durationSeconds;

      this.players.push({ name, className: p.class || '', timeSeconds });
    }

    this.players.sort((a, b) => b.timeSeconds - a.timeSeconds);
  }

  openFullPgcr(): void {
    const game = this.data.isD1 ? 'destiny1' : 'destiny2';
    window.open(`https://pgcr.eververse.trade/${game}/${this.data.instanceId}`, '_blank', 'noopener');
    this.dialogRef.close();
  }

  formatTime(seconds: number): string {
    if (!seconds || seconds <= 0) {
      return '—';
    }
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const rm = m % 60;
      return `${h}h ${rm}m`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
