import { Component, Inject, OnInit } from '@angular/core';

import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { MatButtonModule } from '@angular/material/button';

import { CommonModule } from '@angular/common';

import { BungieApiService } from '../../services/bungie-api.service';

import { PGCRCacheService } from '../../services/pgcr-cache.service';

import { UiI18nService } from '../../services/ui-i18n.service';

import { LocaleService } from '../../services/locale.service';

import { firstValueFrom } from 'rxjs';

import { PrunedPgcr } from '../../utils/pgcr-prune';



export interface PgcrLiteDialogData {

  instanceId: string;

  isD1: boolean;

  activityLabel?: string;

  period?: string;

}



interface LitePlayerRow {

  name: string;

  className: string;

  timeSeconds: number;

}



@Component({

  selector: 'app-pgcr-lite',

  standalone: true,

  imports: [CommonModule, MatDialogModule, MatButtonModule],

  template: `

    <div class="pgcr-lite p-4 text-white min-w-[280px] max-w-[480px]">

      <div class="flex items-start justify-between gap-2 mb-3">

        <div>

          <h2 class="text-lg font-semibold m-0">{{ data.activityLabel || i18n.t('pgcr.title') }}</h2>

          <p *ngIf="period" class="text-sm text-slate-400 m-0 mt-1">{{ period | date:'medium':'':intlLocale }}</p>

          <p *ngIf="durationSeconds > 0" class="text-xs text-slate-500 m-0 mt-0.5">

            Activity duration: {{ formatTime(durationSeconds) }}

          </p>

        </div>

        <button type="button" mat-dialog-close class="text-slate-400 hover:text-white text-xl leading-none" [attr.aria-label]="i18n.t('common.close')">&times;</button>

      </div>



      <div *ngIf="loading" class="py-6 text-center text-slate-400 text-sm">{{ i18n.t('pgcr.loading') }}</div>

      <div *ngIf="!loading && error" class="py-4 px-3 rounded bg-amber-900/30 border border-amber-600/40 text-amber-200 text-sm mb-3">{{ error }}</div>



      <ul *ngIf="!loading && !error && players.length" class="space-y-2 max-h-[50vh] overflow-y-auto mb-4">

        <li *ngFor="let p of players"

            class="flex items-center justify-between gap-2 bg-slate-800/80 rounded px-3 py-2 text-sm">

          <span class="text-slate-200 truncate" [title]="p.name">{{ p.name }}</span>

          <span class="text-slate-400 shrink-0 font-mono text-xs">{{ formatTime(p.timeSeconds) }}</span>

        </li>

      </ul>

      <p *ngIf="!loading && !error && !players.length" class="text-slate-400 text-sm mb-4">{{ i18n.t('pgcr.noPlayers') }}</p>



      <div class="flex flex-wrap gap-2 justify-end border-t border-slate-700 pt-3">

        <button type="button" mat-dialog-close class="px-3 py-1.5 text-sm text-slate-300 hover:text-white rounded">

          {{ i18n.t('pgcr.close') }}

        </button>

        <button type="button"

                (click)="openFullPgcr()"

                class="px-3 py-1.5 text-sm bg-yellow-600 hover:bg-yellow-500 text-black font-medium rounded">

          {{ i18n.t('pgcr.full') }}

        </button>

      </div>

    </div>

  `,

  styles: [`

    :host { display: block; }

    .pgcr-lite { background: #1a1f2e; }

  `]

})

export class PgcrLiteComponent implements OnInit {

  loading = true;

  error: string | null = null;

  players: LitePlayerRow[] = [];

  durationSeconds = 0;

  period = '';

  intlLocale = 'en-US';



  constructor(

    @Inject(MAT_DIALOG_DATA) public data: PgcrLiteDialogData,

    private dialogRef: MatDialogRef<PgcrLiteComponent>,

    private bungie: BungieApiService,

    private pgcrCache: PGCRCacheService,

    public i18n: UiI18nService,

    locale: LocaleService

  ) {

    this.intlLocale = locale.intlLocale;

  }



  async ngOnInit(): Promise<void> {

    this.period = this.data.period || '';

    try {

      let pruned = await this.loadCached();

      const needsFetch = !pruned || !this.hasPlayerNames(pruned);

      if (needsFetch) {

        const raw = await firstValueFrom(this.bungie.getPGCR(this.data.instanceId, this.data.isD1));

        if (this.data.isD1) {

          await this.pgcrCache.cacheD1PGCR(this.data.instanceId, raw);

        } else {

          await this.pgcrCache.cacheD2PGCR(this.data.instanceId, raw);

        }

        pruned = await this.loadCached();

      }

      if (!pruned) {

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



  private async loadCached(): Promise<PrunedPgcr | undefined> {

    return this.data.isD1

      ? this.pgcrCache.getD1PGCR(this.data.instanceId)

      : this.pgcrCache.getD2PGCR(this.data.instanceId);

  }



  private hasPlayerNames(pruned: PrunedPgcr): boolean {

    return pruned.players?.some(p => !!p.name) ?? false;

  }



  private applyPruned(pruned: PrunedPgcr): void {

    this.durationSeconds = pruned.duration || 0;

    this.period = pruned.period || this.period;

    const seen = new Set<string>();

    this.players = [];

    for (const p of pruned.players || []) {

      const key = p.id || p.name || '';

      if (key && seen.has(key)) continue;

      if (key) seen.add(key);

      const timeSeconds = p.timeSeconds != null && p.timeSeconds > 0

        ? p.timeSeconds

        : this.durationSeconds;

      this.players.push({

        name: p.name || 'Guardian',

        className: p.class || '',

        timeSeconds

      });

    }

    this.players.sort((a, b) => b.timeSeconds - a.timeSeconds);

  }



  openFullPgcr(): void {

    const game = this.data.isD1 ? 'destiny1' : 'destiny2';

    window.open(`https://pgcr.eververse.trade/${game}/${this.data.instanceId}`, '_blank', 'noopener');

    this.dialogRef.close();

  }



  formatTime(seconds: number): string {

    if (!seconds || seconds <= 0) return '—';

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

