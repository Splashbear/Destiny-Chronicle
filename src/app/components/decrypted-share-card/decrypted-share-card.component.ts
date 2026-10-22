import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import html2canvas from 'html2canvas';
import { AnniversaryFirst } from '../anniversary-celebration-banner/anniversary-celebration-banner.component';

/**
 * Discord/X share card (1200×630). Facts from PGCR/Firsts; flavor line is ours.
 * Uses Bungie activity art/icons when provided — never invents seal glyphs.
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
        <p class="dsc-hint">1200×630 for Discord and X. Facts from your history; the flavor line is Chronicle’s wording.</p>
        <div class="dsc-stage">
          <div #cardEl class="dsc-card" [style.width.px]="1200" [style.height.px]="630">
            <img *ngIf="memory.pgcrImageUrl" [src]="memory.pgcrImageUrl" alt="" class="dsc-card__bg" />
            <div class="dsc-card__shade"></div>
            <div class="dsc-card__engram">
              <img *ngIf="memory.iconUrl" [src]="memory.iconUrl" alt="" class="dsc-card__activity-icon" />
              <svg *ngIf="!memory.iconUrl" width="140" height="160" viewBox="0 0 140 160" aria-hidden="true">
                <polygon points="70,8 128,44 128,116 70,152 12,116 12,44" fill="none" stroke="#c9a227" stroke-width="3"/>
                <polygon points="70,30 108,54 108,106 70,130 32,106 32,54" fill="#c9a227" opacity=".55"/>
              </svg>
            </div>
            <div class="dsc-card__text">
              <div class="dsc-card__kicker">DECRYPTED MEMORY · DESTINY CHRONICLE</div>
              <div class="dsc-card__title">{{ memory.activityName }}{{ typeSuffix }}</div>
              <div class="dsc-card__meta">
                {{ memory.dateLabel || (memory.completionDate | date:'MMM d, y') }}
                <ng-container *ngIf="memory.platform"> · {{ memory.platform }}</ng-container>
                <ng-container *ngIf="memory.fireteamLabel"> · {{ memory.fireteamLabel }}</ng-container>
                <br />
                {{ flavorLine }}
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
      background: radial-gradient(circle at 26% 50%, #ffe9a855, #7a341033 35%, #0c0e10 70%), #0c0e10;
      border: 1px solid #5a4a1c; border-radius: 12px; color: #d8e4ee;
      transform-origin: top left;
    }
    .dsc-card__bg {
      position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .28;
    }
    .dsc-card__shade {
      position: absolute; inset: 0;
      background: linear-gradient(90deg, rgba(12,14,16,.92) 0%, rgba(12,14,16,.55) 55%, rgba(12,14,16,.35) 100%);
    }
    .dsc-card__engram {
      position: absolute; left: 40px; top: 56px; width: 140px; height: 160px;
      display: flex; align-items: center; justify-content: center; z-index: 1;
    }
    .dsc-card__activity-icon {
      width: 120px; height: 120px; object-fit: contain;
      filter: drop-shadow(0 0 18px rgba(201,162,39,.35));
    }
    .dsc-card__text { position: absolute; left: 210px; top: 44px; right: 24px; z-index: 1; }
    .dsc-card__kicker { color: #e67e22; font-size: 14px; letter-spacing: .16em; }
    .dsc-card__title {
      font-family: Georgia, 'Times New Roman', serif; font-size: 36px; color: #f3e2b8;
      margin: 12px 0 10px; line-height: 1.2;
    }
    .dsc-card__meta { color: #c9b38a; font-size: 18px; line-height: 1.6; }
    .dsc-card__watermark {
      position: absolute; right: 20px; bottom: 16px; color: #5a6470; font-size: 14px; z-index: 1;
    }
    @media (max-width: 900px) {
      .dsc-card { transform: scale(0.55); }
      .dsc-stage { min-height: 360px; }
    }
  `],
})
export class DecryptedShareCardComponent {
  @Input() open = false;
  @Input() memory: AnniversaryFirst | null = null;
  @Input() flavorLine = '';
  @Output() close = new EventEmitter<void>();

  @ViewChild('cardEl') cardEl?: ElementRef<HTMLDivElement>;
  exporting = false;

  get typeSuffix(): string {
    if (!this.memory) return '';
    switch (this.memory.type) {
      case 'solo-flawless': return ', solo flawless';
      case 'solo': return ', solo';
      case 'first-ever': return ', first ever';
      default: return ', first clear';
    }
  }

  async exportPng(): Promise<void> {
    const el = this.cardEl?.nativeElement;
    if (!el || !this.memory) return;
    this.exporting = true;
    try {
      const canvas = await html2canvas(el, {
        width: 1200,
        height: 630,
        scale: 1,
        backgroundColor: '#0c0e10',
        useCORS: true,
        allowTaint: true,
      });
      const a = document.createElement('a');
      const safe = (this.memory.activityName || 'memory').replace(/[^\w\-]+/g, '_').slice(0, 48);
      a.download = `destiny-chronicle-${safe}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } finally {
      this.exporting = false;
    }
  }
}
