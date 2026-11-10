import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnniversaryFirst } from '../anniversary-celebration-banner/anniversary-celebration-banner.component';
import { anniversaryCardFlavor } from '../../utils/anniversary-share-flavor';
import { inlineImageDataUrl } from '../../utils/inline-image-data-url';

/**
 * Discord/X share card (1200×630). Matches the On-This-Day anniversary banner:
 * consolidated headline for every first that night + PGCR art when available.
 */
@Component({
  selector: 'app-decrypted-share-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dsc-overlay" *ngIf="open && memory" (click)="close.emit()">
      <div class="dsc-panel" (click)="$event.stopPropagation()">
        <div class="dsc-toolbar">
          <h3>Share card</h3>
          <div class="dsc-actions">
            <button type="button" class="dsc-btn dsc-btn--primary" [disabled]="exporting" (click)="exportPng()">
              {{ exporting ? 'Exporting…' : 'Download PNG' }}
            </button>
            <button type="button" class="dsc-btn" (click)="close.emit()">Close</button>
          </div>
        </div>
        <p class="dsc-hint">1200×630 for Discord and X. Same wording as the On This Day card on the site.</p>
        <div class="dsc-stage">
          <div #cardEl class="dsc-card" [style.width.px]="1200" [style.height.px]="630">
            <img *ngIf="bgSrc" [src]="bgSrc" alt="" class="dsc-card__bg" (error)="onBgError()" />
            <div class="dsc-card__shade"></div>
            <div class="dsc-card__art" *ngIf="artSrc || memory.iconUrl">
              <img *ngIf="artSrc" [src]="artSrc" alt="" class="dsc-card__pgcr" (error)="onArtError()" />
              <img *ngIf="memory.iconUrl && !iconBroken" [src]="memory.iconUrl" alt=""
                   class="dsc-card__activity-icon" (error)="onIconError()" />
            </div>
            <div class="dsc-card__text">
              <div class="dsc-card__kicker">DECRYPTED MEMORY · DESTINY CHRONICLE</div>
              <div class="dsc-card__title">{{ displayHeadline }}</div>
              <div class="dsc-card__meta">
                <ng-container *ngIf="memories.length <= 1">
                  {{ memory.dateLabel || (memory.completionDate | date:'MMM d, y') }}
                  <ng-container *ngIf="memory.platform"> · {{ memory.platform }}</ng-container>
                  <ng-container *ngIf="typeLabel"> · {{ typeLabel }}</ng-container>
                </ng-container>
                <ng-container *ngIf="memories.length > 1">
                  {{ memories.length }} firsts · {{ typeSummary }}
                </ng-container>
              </div>
              <div class="dsc-card__fireteam" *ngIf="memory.fireteamNames?.length">
                <div class="dsc-card__fireteam-kicker">FIRETEAM</div>
                <div class="dsc-card__fireteam-names">{{ memory.fireteamNames!.join('  ·  ') }}</div>
              </div>
            </div>
            <div class="dsc-card__watermark">destinychronicle.com</div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dsc-overlay {
      position: fixed; inset: 0; z-index: 11000;
      background: rgba(0,0,0,.78); display: flex; align-items: center; justify-content: center;
      padding: 1rem;
    }
    .dsc-panel {
      background: #15191e; border: 1px solid #2a2f36; border-radius: 12px;
      padding: 1rem 1.25rem 1.25rem; max-width: min(96vw, 1280px); width: 100%;
    }
    .dsc-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .dsc-toolbar h3 { margin: 0; color: #e4c04a; font-size: .9rem; letter-spacing: .12em; text-transform: uppercase; }
    .dsc-actions { display: flex; gap: .5rem; }
    .dsc-btn {
      border: 1px solid #2a2f36; background: #1a1f25; color: #d8e4ee;
      border-radius: 6px; padding: .4rem .85rem; cursor: pointer; font-size: .875rem;
    }
    .dsc-btn--primary { border-color: #5a4a1c; color: #ffe9a8; background: #2b2412; }
    .dsc-btn:disabled { opacity: .5; cursor: not-allowed; }
    .dsc-hint { color: #8a96a3; font-size: .8rem; margin: .65rem 0 1rem; }
    .dsc-stage { overflow: auto; max-height: min(70vh, 700px); border-radius: 8px; background: #0c0e10; }
    .dsc-card {
      position: relative; overflow: hidden; flex-shrink: 0;
      background: radial-gradient(ellipse at 50% 120%, #7a3410 0%, #2a1408 40%, #0c0e10 75%);
      border: 1px solid #5a4a1c; border-radius: 12px; color: #d8e4ee;
      transform-origin: top left;
    }
    .dsc-card__bg {
      position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .22;
    }
    .dsc-card__shade {
      position: absolute; inset: 0;
      background: linear-gradient(90deg, rgba(12,14,16,.55) 0%, rgba(12,14,16,.72) 42%, rgba(12,14,16,.88) 100%);
    }
    .dsc-card__art {
      position: absolute; left: 48px; top: 64px; width: 200px; height: 280px; z-index: 1;
      border-radius: 10px; overflow: hidden; border: 1px solid #5a3a1c; background: #0c0e10;
    }
    .dsc-card__pgcr {
      width: 100%; height: 100%; object-fit: cover;
    }
    .dsc-card__activity-icon {
      position: absolute; right: 10px; bottom: 10px; width: 48px; height: 48px; object-fit: contain;
      filter: drop-shadow(0 0 10px rgba(201,162,39,.35));
    }
    .dsc-card__text { position: absolute; left: 280px; top: 72px; right: 40px; z-index: 1; }
    .dsc-card__kicker { color: #e67e22; font-size: 14px; letter-spacing: .16em; }
    .dsc-card__title {
      font-family: Georgia, 'Times New Roman', serif; font-size: 34px; color: #f3e2b8;
      margin: 14px 0 12px; line-height: 1.25;
    }
    .dsc-card__meta { color: #c9b38a; font-size: 18px; line-height: 1.55; }
    .dsc-card__fireteam { margin-top: 22px; max-width: 860px; }
    .dsc-card__fireteam-kicker {
      color: #e67e22; font-size: 13px; letter-spacing: .16em; margin-bottom: 6px;
    }
    .dsc-card__fireteam-names {
      color: #f3e2b8; font-size: 22px; line-height: 1.45;
    }
    .dsc-card__watermark {
      position: absolute; right: 20px; bottom: 16px; color: #5a6470; font-size: 14px; z-index: 1;
    }
    @media (max-width: 900px) {
      .dsc-card { transform: scale(0.55); }
      .dsc-stage { min-height: 360px; }
    }
  `],
})
export class DecryptedShareCardComponent implements OnChanges {
  @Input() open = false;
  /** Featured first (art / fireteam). */
  @Input() memory: AnniversaryFirst | null = null;
  /** All On-This-Day firsts — share PNG lists every one, same as the site card. */
  @Input() memories: AnniversaryFirst[] = [];
  /** Optional override; defaults to the consolidated anniversary headline. */
  @Input() flavorLine = '';
  @Output() close = new EventEmitter<void>();

  @ViewChild('cardEl') cardEl?: ElementRef<HTMLDivElement>;
  exporting = false;
  iconBroken = false;
  artBroken = false;
  /** Same-origin / data URL for export-safe PGCR art. */
  private inlinedArt: string | null = null;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['memory'] || changes['open'] || changes['memories']) {
      this.iconBroken = false;
      this.artBroken = false;
      this.inlinedArt = null;
      if (this.open && this.memory?.pgcrImageUrl) {
        void this.prepareArt(this.memory.pgcrImageUrl);
      }
    }
  }

  get displayHeadline(): string {
    const list = this.memories?.length ? this.memories : (this.memory ? [this.memory] : []);
    return this.flavorLine || anniversaryCardFlavor(list);
  }

  get bgSrc(): string | null {
    return this.artSrc;
  }

  get artSrc(): string | null {
    if (this.artBroken) return null;
    return this.inlinedArt || this.memory?.pgcrImageUrl || null;
  }

  get typeLabel(): string {
    return this.memory ? this.labelFor(this.memory) : '';
  }

  get typeSummary(): string {
    const list = this.memories?.length ? this.memories : (this.memory ? [this.memory] : []);
    return [...new Set(list.map(m => this.labelFor(m)))].join(' · ');
  }

  onIconError(): void {
    this.iconBroken = true;
    this.cdr.markForCheck();
  }

  onArtError(): void {
    this.artBroken = true;
    this.cdr.markForCheck();
  }

  onBgError(): void {
    // Background uses the same art source; ignore if the left panel still shows it.
  }

  async exportPng(): Promise<void> {
    const el = this.cardEl?.nativeElement;
    if (!el || !this.memory) return;
    this.exporting = true;
    this.cdr.markForCheck();
    try {
      if (this.memory.pgcrImageUrl && !this.inlinedArt) {
        await this.prepareArt(this.memory.pgcrImageUrl);
        await new Promise(r => setTimeout(r, 50));
      }
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el, {
        width: 1200,
        height: 630,
        scale: 1,
        backgroundColor: '#0c0e10',
        useCORS: true,
        allowTaint: false,
      });
      const a = document.createElement('a');
      const safe = (this.memory.activityName || 'memory').replace(/[^\w\-]+/g, '_').slice(0, 48);
      a.download = `destiny-chronicle-${safe}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } finally {
      this.exporting = false;
      this.cdr.markForCheck();
    }
  }

  private labelFor(anniversary: AnniversaryFirst): string {
    switch (anniversary.type) {
      case 'first-ever':
        return 'First Ever Activity';
      case 'solo':
        return 'Solo';
      case 'solo-flawless':
        return 'Solo Flawless';
      default: {
        const first = anniversary.first as { type?: string };
        if (first?.type === 'story') return 'Story First';
        if (first?.type === 'raid') return 'Raid First';
        if (first?.type === 'dungeon') return 'Dungeon First';
        return 'Guardian First';
      }
    }
  }

  private async prepareArt(url: string): Promise<void> {
    const dataUrl = await inlineImageDataUrl(url);
    if (dataUrl) {
      this.inlinedArt = dataUrl;
      this.artBroken = false;
      this.cdr.markForCheck();
    }
  }
}
