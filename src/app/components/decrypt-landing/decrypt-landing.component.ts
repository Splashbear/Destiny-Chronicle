import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { Engram3dComponent } from '../engram-3d/engram-3d.component';

/**
 * Full-screen engram decrypt landing (ENGRAM_THEME_SPEC / DECRYPT_LANDING_MOCKUP).
 * Progress is bound to the real load — never a fake timer.
 * Hold is optional engagement; Skip dismisses without blocking the load.
 */
@Component({
  selector: 'dc-decrypt-landing',
  standalone: true,
  imports: [CommonModule, Engram3dComponent],
  template: `
    <div class="dc-decrypt-landing" role="dialog" aria-modal="true" aria-labelledby="dc-decrypt-cap">
      <div class="dc-decrypt-landing__stage"
           (pointerdown)="onHoldStart($event)"
           (pointerup)="onHoldEnd()"
           (pointerleave)="onHoldEnd()"
           (pointercancel)="onHoldEnd()">
        <dc-engram-3d
          class="dc-decrypt-landing__eng"
          size="lg"
          [held]="holding"
          [progress]="progress"
          [ariaLabel]="caption || 'Decrypting history'">
        </dc-engram-3d>
        <div id="dc-decrypt-cap" class="dc-decrypt-landing__cap">{{ displayCaption }}</div>
        <div class="dc-decrypt-landing__sub" *ngIf="subline">{{ subline }}</div>
        <div class="dc-decrypt-landing__ring" aria-hidden="true">
          <i [style.width.%]="progress"></i>
        </div>
        <p class="dc-decrypt-landing__hint">Hold the engram · progress follows your real load</p>
      </div>
      <button type="button" class="dc-decrypt-landing__skip" (click)="skip.emit()">
        Skip ›
      </button>
    </div>
  `,
  styles: [`
    .dc-decrypt-landing {
      position: fixed;
      inset: 0;
      z-index: 80;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 42%, #1a1f26, #0c0e10 62%);
      color: #d8e4ee;
    }
    .dc-decrypt-landing__stage {
      display: flex;
      flex-direction: column;
      align-items: center;
      touch-action: none;
      user-select: none;
      cursor: pointer;
    }
    .dc-decrypt-landing__eng {
      filter: drop-shadow(0 0 calc(10px + var(--dc-p, 0) * 48px) #e4c04a);
    }
    .dc-decrypt-landing__cap {
      margin-top: 1.35rem;
      color: #c9a227;
      font-size: 1.125rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      font-weight: 600;
    }
    .dc-decrypt-landing__sub {
      margin-top: 0.4rem;
      color: #8a96a3;
      font-size: 0.8125rem;
    }
    .dc-decrypt-landing__ring {
      width: 16rem;
      max-width: 70vw;
      height: 4px;
      background: #2a2f36;
      margin-top: 1rem;
      border-radius: 2px;
      overflow: hidden;
    }
    .dc-decrypt-landing__ring i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #c9a227, #9fe3ff);
      border-radius: 2px;
      transition: width 0.2s ease;
    }
    .dc-decrypt-landing__hint {
      margin-top: 0.85rem;
      font-size: 0.75rem;
      color: #6b7280;
    }
    .dc-decrypt-landing__skip {
      position: absolute;
      bottom: 1.5rem;
      right: 1.75rem;
      color: #8a96a3;
      font-size: 0.8125rem;
      border: 1px solid #2a2f36;
      background: transparent;
      padding: 0.4rem 0.75rem;
      border-radius: 4px;
      cursor: pointer;
    }
    .dc-decrypt-landing__skip:hover {
      color: #d8e4ee;
      border-color: #9fe3ff55;
    }
    @media (prefers-reduced-motion: reduce) {
      .dc-decrypt-landing__eng,
      .dc-decrypt-landing__ring i {
        transition: none !important;
      }
      .dc-decrypt-landing__eng {
        filter: none;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--dc-p]': 'progressUnit',
  },
})
export class DecryptLandingComponent {
  /** 0–100 from real load progress. */
  @Input() progress = 0;
  @Input() caption = 'Decrypting…';
  @Input() subline = '';
  @Output() skip = new EventEmitter<void>();

  holding = false;

  get progressUnit(): number {
    return Math.max(0, Math.min(1, this.progress / 100));
  }

  get displayCaption(): string {
    if (this.progress <= 0) return 'Hold to decrypt';
    return this.caption || 'Decrypting…';
  }

  onHoldStart(ev: PointerEvent): void {
    if (ev.button !== undefined && ev.button !== 0) return;
    this.holding = true;
  }

  onHoldEnd(): void {
    this.holding = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.skip.emit();
  }
}
