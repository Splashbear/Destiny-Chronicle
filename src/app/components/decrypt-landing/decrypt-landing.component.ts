import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Engram3dComponent } from '../engram-3d/engram-3d.component';

/**
 * Full-viewport exotic engram gate (idle search + load).
 * Matches the ENGRAM landing expectation: gold dodecahedron on a starfield.
 */
@Component({
  selector: 'dc-decrypt-landing',
  standalone: true,
  imports: [CommonModule, FormsModule, Engram3dComponent],
  template: `
    <div class="dc-engram-gate"
         [class.dc-engram-gate--loading]="mode === 'loading'"
         role="dialog"
         aria-modal="true"
         aria-labelledby="dc-engram-cap">
      <div class="dc-engram-gate__stars" aria-hidden="true"></div>

      <div class="dc-engram-gate__stage">
        <dc-engram-3d
          size="hero"
          [held]="holding"
          [progress]="displayProgress"
          [autoSpin]="true"
          [ariaLabel]="caption || 'Exotic engram'"
          (pointerdown)="onHoldStart($event)"
          (pointerup)="onHoldEnd()"
          (pointerleave)="onHoldEnd()"
          (pointercancel)="onHoldEnd()">
        </dc-engram-3d>

        <div id="dc-engram-cap" class="dc-engram-gate__cap">{{ displayCaption }}</div>
        <div class="dc-engram-gate__sub">{{ displaySubline }}</div>

        <div class="dc-engram-gate__ring" *ngIf="mode === 'loading'" aria-hidden="true">
          <i [style.width.%]="progress"></i>
        </div>

        <!-- Idle: search on the gate -->
        <div class="dc-engram-gate__search" *ngIf="mode === 'idle'">
          <input type="text"
                 class="dc-engram-gate__input"
                 [ngModel]="searchUsername"
                 (ngModelChange)="searchUsernameChange.emit($event)"
                 (keydown.enter)="search.emit()"
                 placeholder="Bungie name · e.g. Splashbear#1078"
                 aria-label="Destiny username" />
          <button type="button"
                  class="dc-engram-gate__btn"
                  [disabled]="!(searchUsername || '').trim()"
                  (click)="search.emit()">
            {{ searching ? 'Searching…' : 'Decrypt' }}
          </button>
          <button type="button" class="dc-engram-gate__link" (click)="favorites.emit()">
            ★ Favorites
          </button>
        </div>
      </div>

      <button type="button" class="dc-engram-gate__skip" (click)="skip.emit()" *ngIf="mode === 'loading'">
        Skip ›
      </button>
    </div>
  `,
  styles: [`
    .dc-engram-gate {
      position: fixed;
      inset: 0;
      z-index: 90;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #0a0b0d;
      color: #d8e4ee;
      overflow: hidden;
    }
    .dc-engram-gate__stars {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse at 50% 42%, rgba(40, 36, 24, 0.55) 0%, transparent 55%),
        radial-gradient(1px 1px at 12% 18%, #e4c04a88, transparent),
        radial-gradient(1px 1px at 28% 72%, #fff8, transparent),
        radial-gradient(1.5px 1.5px at 61% 24%, #e4c04aaa, transparent),
        radial-gradient(1px 1px at 78% 58%, #fffc, transparent),
        radial-gradient(1px 1px at 88% 12%, #e4c04a66, transparent),
        radial-gradient(1px 1px at 45% 88%, #fff6, transparent),
        radial-gradient(1.5px 1.5px at 8% 48%, #e4c04a77, transparent),
        radial-gradient(1px 1px at 52% 8%, #fffa, transparent),
        radial-gradient(1px 1px at 70% 80%, #e4c04a55, transparent),
        radial-gradient(1px 1px at 33% 40%, #fff7, transparent),
        #0a0b0d;
      pointer-events: none;
    }
    .dc-engram-gate__stage {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1.5rem;
      max-width: 100%;
    }
    .dc-engram-gate__cap {
      margin-top: 1.5rem;
      color: #e4c04a;
      font-size: clamp(0.95rem, 2.4vw, 1.15rem);
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-weight: 600;
      text-align: center;
    }
    .dc-engram-gate__sub {
      margin-top: 0.45rem;
      color: #8a96a3;
      font-size: 0.8125rem;
      text-align: center;
    }
    .dc-engram-gate__ring {
      width: min(18rem, 70vw);
      height: 4px;
      background: #2a2f36;
      margin-top: 1.1rem;
      border-radius: 2px;
      overflow: hidden;
    }
    .dc-engram-gate__ring i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #c9a227, #fff3c0);
      border-radius: 2px;
      transition: width 0.2s ease;
    }
    .dc-engram-gate__search {
      margin-top: 1.75rem;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0.65rem;
      width: min(22rem, 88vw);
    }
    .dc-engram-gate__input {
      background: rgba(21, 25, 30, 0.85);
      border: 1px solid rgba(228, 192, 74, 0.35);
      color: #f3e2b8;
      padding: 0.7rem 0.9rem;
      border-radius: 4px;
      font-size: 0.95rem;
      outline: none;
    }
    .dc-engram-gate__input:focus {
      border-color: #e4c04a;
      box-shadow: 0 0 0 1px rgba(228, 192, 74, 0.35);
    }
    .dc-engram-gate__input::placeholder { color: #6b7280; }
    .dc-engram-gate__btn {
      border: 1px solid #e4c04a;
      background: linear-gradient(180deg, #e4c04a, #c9a227);
      color: #1a1408;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 0.7rem 1rem;
      border-radius: 4px;
      cursor: pointer;
    }
    .dc-engram-gate__btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .dc-engram-gate__link {
      background: none;
      border: none;
      color: #8a96a3;
      font-size: 0.85rem;
      cursor: pointer;
      padding: 0.25rem;
    }
    .dc-engram-gate__link:hover { color: #e4c04a; }
    .dc-engram-gate__skip {
      position: absolute;
      bottom: 1.5rem;
      right: 1.75rem;
      z-index: 2;
      color: #8a96a3;
      font-size: 0.8125rem;
      border: 1px solid #2a2f36;
      background: transparent;
      padding: 0.4rem 0.75rem;
      border-radius: 4px;
      cursor: pointer;
    }
    .dc-engram-gate__skip:hover {
      color: #d8e4ee;
      border-color: #e4c04a55;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecryptLandingComponent {
  /** idle = empty search gate; loading = real progress overlay */
  @Input() mode: 'idle' | 'loading' = 'idle';
  @Input() progress = 0;
  @Input() caption = '';
  @Input() subline = '';
  @Input() searchUsername = '';
  @Input() searching = false;
  @Input() guardianLabel = '';

  @Output() skip = new EventEmitter<void>();
  @Output() search = new EventEmitter<void>();
  @Output() favorites = new EventEmitter<void>();
  @Output() searchUsernameChange = new EventEmitter<string>();

  holding = false;

  get displayProgress(): number {
    // Idle still looks lit; loading uses real progress (floor so it never goes fully dark)
    if (this.mode === 'idle') return 45;
    return Math.max(8, this.progress);
  }

  get displayCaption(): string {
    if (this.mode === 'loading') {
      if (this.progress <= 0) return 'Exotic engram · hold to decrypt';
      return this.caption || 'Decrypting…';
    }
    return 'Exotic engram · hold to decrypt';
  }

  get displaySubline(): string {
    if (this.mode === 'loading' && this.subline) return this.subline;
    const who = this.guardianLabel?.trim();
    return who ? `Drag to rotate · ${who}` : 'Drag to rotate · search to decrypt';
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
    if (this.mode === 'loading') this.skip.emit();
  }
}
