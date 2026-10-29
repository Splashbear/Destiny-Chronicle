import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Engram3dComponent, EngramUnzipTarget } from '../engram-3d/engram-3d.component';

/**
 * Bronze engram gate: sealed idle → open search panel → load progress on seams →
 * facet fly-out into hard-light dossier panels.
 */
@Component({
  selector: 'dc-decrypt-landing',
  standalone: true,
  imports: [CommonModule, FormsModule, Engram3dComponent],
  template: `
    <div class="dc-engram-gate"
         [class.dc-engram-gate--open]="searchOpen"
         [class.dc-engram-gate--loading]="mode === 'loading'"
         [class.dc-engram-gate--unzip]="unzipping"
         role="dialog"
         aria-modal="true"
         aria-labelledby="dc-engram-cap">
      <div class="dc-engram-gate__stars" aria-hidden="true"></div>

      <div class="dc-engram-gate__stage" [class.dc-engram-gate__stage--unzip]="unzipping">
        <!-- One continuous engram: facets light per account, then dissolve in place -->
        <dc-engram-3d
          size="hero"
          [held]="holding || searchOpen"
          [progress]="displayProgress"
          [litAccounts]="litAccounts"
          [totalAccounts]="totalAccounts"
          [unzipping]="unzipping"
          [unzipTargets]="unzipTargets"
          [autoSpin]="!unzipping"
          [ariaLabel]="caption || 'Sealed engram'"
          (engramActivate)="onEngramActivate()"
          (unzipComplete)="onUnzipComplete()"
          (pointerdown)="onHoldStart($event)"
          (pointerup)="onHoldEnd()"
          (pointerleave)="onHoldEnd()"
          (pointercancel)="onHoldEnd()">
        </dc-engram-3d>

        <ng-container *ngIf="!unzipping">
          <div id="dc-engram-cap" class="dc-engram-gate__cap">{{ displayCaption }}</div>
          <div class="dc-engram-gate__sub">{{ displaySubline }}</div>

          <ul class="dc-engram-gate__accounts" *ngIf="mode === 'loading' && accountLines.length">
            <li *ngFor="let line of accountLines"
                [class.dc-engram-gate__accounts--on]="line.done"
                [class.dc-engram-gate__accounts--err]="line.error">
              <s></s>
              <span>{{ line.label }}</span>
              <b>{{ line.detail }}</b>
            </li>
          </ul>

          <div class="dc-engram-gate__ring" *ngIf="mode === 'loading'" aria-hidden="true">
            <i [style.width.%]="displayProgress"></i>
          </div>
        </ng-container>
      </div>

      <!-- Idle: search slides out from the engram (same lookup as the site) -->
      <aside class="dc-engram-gate__panel"
             *ngIf="mode === 'idle'"
             [class.dc-engram-gate__panel--open]="searchOpen"
             aria-label="Decrypt user data">
        <div class="dc-engram-gate__panel-inner">
          <h4 class="dc-engram-gate__panel-title">Decrypt user data</h4>
          <input type="text"
                 class="dc-engram-gate__input"
                 [ngModel]="searchUsername"
                 (ngModelChange)="searchUsernameChange.emit($event)"
                 (keydown.enter)="onSearchEnter($event)"
                 placeholder="Type a name, Enter to save · e.g. Splashbear#1078"
                 autocomplete="off"
                 autocorrect="off"
                 autocapitalize="off"
                 spellcheck="false"
                 name="dc-engram-search"
                 aria-label="Destiny username" />
          <div class="dc-engram-gate__chips" *ngIf="selectedNames.length">
            <span *ngFor="let n of selectedNames; let i = index">
              {{ n }}
              <button type="button"
                      class="dc-engram-gate__chip-x"
                      (click)="removeName.emit(i)"
                      [attr.aria-label]="'Remove ' + n">×</button>
            </span>
          </div>
          <button type="button"
                  class="dc-engram-gate__btn"
                  [disabled]="!canDecrypt || searching"
                  (click)="search.emit()">
            {{ searching ? 'Searching…' : decryptLabel }}
          </button>
          <p class="dc-engram-gate__error" *ngIf="errorMessage" role="alert">{{ errorMessage }}</p>
          <button type="button" class="dc-engram-gate__link" (click)="favorites.emit()">
            ★ Favorites
          </button>
          <p class="dc-engram-gate__panel-help">
            Enter after each name, then Decrypt — same multi-name lookup as the site.
          </p>
        </div>
      </aside>

      <p class="dc-engram-gate__tap-hint" *ngIf="mode === 'idle' && !searchOpen" aria-hidden="true">
        Tap the engram to begin
      </p>

      <button type="button"
              class="dc-engram-gate__skip"
              (click)="skip.emit()"
              *ngIf="mode === 'loading' || unzipping">
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
      background:
        radial-gradient(ellipse at 50% 45%, rgba(42, 33, 12, 0.4), transparent 45%),
        linear-gradient(#d08a4c0a 1px, transparent 1px) 0 0 / 40px 40px,
        linear-gradient(90deg, #d08a4c0a 1px, transparent 1px) 0 0 / 40px 40px,
        #08090a;
      color: #e8e2d0;
      overflow: hidden;
    }
    .dc-engram-gate--unzip {
      background: #08090aee;
      pointer-events: none;
    }
    .dc-engram-gate--unzip .dc-engram-gate__skip {
      pointer-events: auto;
    }
    .dc-engram-gate__stars {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse at 50% 42%, rgba(40, 28, 16, 0.55) 0%, transparent 55%),
        radial-gradient(1px 1px at 12% 18%, #ffc89088, transparent),
        radial-gradient(1px 1px at 28% 72%, #fff8, transparent),
        radial-gradient(1.5px 1.5px at 61% 24%, #ffc890aa, transparent),
        radial-gradient(1px 1px at 78% 58%, #fffc, transparent),
        radial-gradient(1px 1px at 88% 12%, #ffc89066, transparent),
        radial-gradient(1px 1px at 45% 88%, #fff6, transparent);
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
      transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .dc-engram-gate__stage--unzip {
      position: fixed;
      inset: 0;
      padding: 0;
      pointer-events: none;
    }
    .dc-engram-gate--open .dc-engram-gate__stage {
      transform: translateX(-min(18vw, 9rem));
    }
    .dc-engram-gate__accounts {
      list-style: none;
      margin: 1rem 0 0;
      padding: 0;
      width: min(22rem, 88vw);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.72rem;
      letter-spacing: 0.06em;
      color: #a89b78;
    }
    .dc-engram-gate__accounts li {
      display: grid;
      grid-template-columns: 12px 1fr auto;
      gap: 0.5rem;
      align-items: center;
      padding: 0.3rem 0;
      border-bottom: 1px solid #2a2618;
    }
    .dc-engram-gate__accounts s {
      width: 10px;
      height: 10px;
      border: 1px solid #d08a4c;
      text-decoration: none;
      display: block;
      box-sizing: border-box;
    }
    .dc-engram-gate__accounts--on s {
      background: #d08a4c;
      box-shadow: 0 0 6px #d08a4c;
    }
    .dc-engram-gate__accounts--on {
      color: #ffe6cc;
    }
    .dc-engram-gate__accounts--err {
      color: #f0a0a0;
    }
    .dc-engram-gate__accounts b {
      font-weight: normal;
      color: #6b5a48;
      font-size: 0.65rem;
    }
    .dc-engram-gate__accounts--on b {
      color: #8fbf84;
    }
    .dc-engram-gate__cap {
      margin-top: 1.5rem;
      color: #d08a4c;
      font-size: clamp(0.95rem, 2.4vw, 1.15rem);
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-weight: 600;
      text-align: center;
      text-shadow: 0 0 8px #d08a4c66;
    }
    .dc-engram-gate__sub {
      margin-top: 0.45rem;
      color: #a89b78;
      font-size: 0.8125rem;
      text-align: center;
    }
    .dc-engram-gate__ring {
      width: min(18rem, 70vw);
      height: 4px;
      background: #2a2618;
      margin-top: 1.1rem;
      border-radius: 2px;
      overflow: hidden;
    }
    .dc-engram-gate__ring i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #b06a34, #ffc890);
      border-radius: 2px;
      transition: width 0.2s ease;
    }
    .dc-engram-gate__panel {
      position: absolute;
      left: 50%;
      top: 50%;
      z-index: 2;
      width: 0;
      height: min(330px, 70vh);
      overflow: hidden;
      transform: translate(2.5rem, -50%);
      transition: width 0.55s cubic-bezier(0.2, 0.8, 0.2, 1);
      background:
        repeating-linear-gradient(0deg, #ffcf9a0c 0 1px, transparent 1px 3px),
        linear-gradient(90deg, #2a1c12, #0b0c0e);
      clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px));
      box-shadow: 0 0 0 1.5px #ffcf9a inset;
    }
    .dc-engram-gate__panel--open {
      width: min(380px, 86vw);
    }
    .dc-engram-gate__panel-inner {
      width: min(380px, 86vw);
      padding: 1.1rem 1.35rem;
      box-sizing: border-box;
    }
    .dc-engram-gate__panel-title {
      margin: 0 0 0.65rem;
      font-size: 0.75rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #d08a4c;
      text-shadow: 0 0 8px #d08a4c;
    }
    .dc-engram-gate__input {
      width: 100%;
      box-sizing: border-box;
      background: #0008;
      border: 1px solid #d08a4c88;
      color: #ffe6cc;
      padding: 0.6rem 0.7rem;
      font-size: 0.95rem;
      outline: none;
    }
    .dc-engram-gate__input:focus {
      border-color: #ffc890;
      box-shadow: 0 0 0 1px rgba(255, 200, 144, 0.35);
    }
    .dc-engram-gate__input::placeholder { color: #6b5a48; }
    .dc-engram-gate__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin: 0.55rem 0 0;
    }
    .dc-engram-gate__chips span {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border: 1px solid #d08a4c88;
      color: #ffe6cc;
      background: #d08a4c1a;
    }
    .dc-engram-gate__chip-x {
      border: 0;
      background: transparent;
      color: #a89b78;
      cursor: pointer;
      padding: 0;
      font-size: 0.9rem;
      line-height: 1;
    }
    .dc-engram-gate__chip-x:hover { color: #ffe6cc; }
    .dc-engram-gate__panel-help {
      margin: 0.55rem 0 0;
      font-size: 0.7rem;
      letter-spacing: 0.06em;
      color: #6b5a48;
      line-height: 1.35;
    }
    .dc-engram-gate__error {
      margin: 0.5rem 0 0;
      font-size: 0.75rem;
      color: #f0a0a0;
      line-height: 1.35;
    }
    .dc-engram-gate__btn {
      margin-top: 0.65rem;
      width: 100%;
      border: 0;
      background: linear-gradient(#d08a4c, #8a4f22);
      color: #14110a;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      font-size: 0.75rem;
      padding: 0.55rem 0.75rem;
      clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
      cursor: pointer;
    }
    .dc-engram-gate__btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .dc-engram-gate__link {
      display: block;
      width: 100%;
      margin-top: 0.5rem;
      background: none;
      border: none;
      color: #a89b78;
      font-size: 0.85rem;
      cursor: pointer;
      padding: 0.25rem;
      text-align: center;
    }
    .dc-engram-gate__link:hover { color: #ffc890; }
    .dc-engram-gate__hint {
      display: none;
    }
    .dc-engram-gate__tap-hint {
      position: absolute;
      bottom: 18%;
      left: 0;
      right: 0;
      z-index: 1;
      text-align: center;
      color: #b8743c;
      letter-spacing: 0.2em;
      font-size: 0.875rem;
      text-transform: uppercase;
      pointer-events: none;
      transition: opacity 0.35s;
    }
    .dc-engram-gate--open .dc-engram-gate__tap-hint {
      opacity: 0;
    }
    .dc-engram-gate__skip {
      position: absolute;
      bottom: 1.5rem;
      right: 1.75rem;
      z-index: 3;
      color: #a89b78;
      font-size: 0.8125rem;
      border: 1px solid #2a2618;
      background: transparent;
      padding: 0.4rem 0.75rem;
      border-radius: 4px;
      cursor: pointer;
    }
    .dc-engram-gate__skip:hover {
      color: #ffe6cc;
      border-color: #d08a4c88;
    }
    @media (max-width: 720px) {
      .dc-engram-gate--open .dc-engram-gate__stage {
        transform: translateY(-4rem);
      }
      .dc-engram-gate__panel {
        left: 50%;
        top: auto;
        bottom: 1.25rem;
        transform: translateX(-50%);
        height: auto;
        max-height: 42vh;
      }
      .dc-engram-gate__panel--open {
        width: min(380px, 92vw);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecryptLandingComponent implements OnChanges {
  /** idle = sealed gate + search panel; loading = seams light with real progress */
  @Input() mode: 'idle' | 'loading' = 'idle';
  @Input() progress = 0;
  @Input() caption = '';
  @Input() subline = '';
  @Input() searchUsername = '';
  @Input() searching = false;
  @Input() guardianLabel = '';
  /** Pending search chips and/or loaded profile labels. */
  @Input() selectedNames: string[] = [];
  /** Search/API errors — shown on the gate (dossier panel is hidden while idle). */
  @Input() errorMessage = '';
  /** When true, run facet fly-out into dossier targets. */
  @Input() unzipping = false;
  /** Accounts finished (complete or error) — lights that many facets. */
  @Input() litAccounts = 0;
  /** Total accounts in this decrypt batch. */
  @Input() totalAccounts = 0;
  /**
   * Per-account rows under the engram (from accountLoadingStatuses).
   * Prefer structured status from the parent — do not invent progress here.
   */
  @Input() accountStatuses: Array<{
    displayName: string;
    platform?: string;
    status: string;
    message?: string;
  }> = [];

  @Output() skip = new EventEmitter<void>();
  @Output() search = new EventEmitter<void>();
  @Output() favorites = new EventEmitter<void>();
  @Output() searchUsernameChange = new EventEmitter<string>();
  @Output() unzipComplete = new EventEmitter<void>();
  @Output() searchPanelOpen = new EventEmitter<void>();
  /** Enter on the input — parent saves a search chip (same as site). */
  @Output() queueName = new EventEmitter<void>();
  @Output() removeName = new EventEmitter<number>();

  holding = false;
  searchOpen = false;
  unzipTargets: EngramUnzipTarget[] = [];

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode'] && this.mode === 'loading') {
      this.searchOpen = false;
    }
    if (changes['unzipping'] && this.unzipping) {
      this.unzipTargets = this.collectTargets();
      this.cdr.markForCheck();
    }
  }

  get displayProgress(): number {
    if (this.mode === 'idle') return 0;
    if (this.totalAccounts > 0) {
      return Math.round(
        Math.max(0, Math.min(1, this.litAccounts / this.totalAccounts)) * 100
      );
    }
    return Math.max(0, Math.min(100, this.progress));
  }

  get displayCaption(): string {
    if (this.mode === 'loading') {
      const total = this.totalAccounts || this.accountStatuses.length;
      const ready = (this.accountStatuses || []).filter(
        s => s.status === 'complete' || s.status === 'error'
      ).length;
      // Only "assembling" once every account is terminal — day may still be finishing.
      if (total > 0 && ready >= total) {
        return this.caption || 'Assembling dossier…';
      }
      if (total > 0) {
        return `Decrypting ${this.litAccounts} of ${total}`;
      }
      return this.caption || 'Decrypting…';
    }
    return this.searchOpen ? 'Sealed engram · search to decrypt' : 'Sealed engram · tap to open';
  }

  get displaySubline(): string {
    if (this.mode === 'loading' && this.subline) return this.subline;
    const who = this.guardianLabel?.trim();
    if (who) return who;
    return this.searchOpen
      ? 'Same lookup as the site · multiple names supported'
      : 'Drag to rotate · tap to open search';
  }

  get accountLines(): Array<{ label: string; detail: string; done: boolean; error: boolean }> {
    return (this.accountStatuses || []).map(s => {
      const done = s.status === 'complete';
      const error = s.status === 'error';
      const found = !error && s.status !== 'fetching-profile';
      const plat = s.platform ? ` · ${s.platform}` : '';
      let detail = 'looking up…';
      if (done) detail = 'ready';
      else if (error) detail = 'error';
      else if (s.message) detail = s.message;
      return {
        label: `${s.displayName}${plat}`,
        detail,
        done: done || found,
        error,
      };
    });
  }

  get canDecrypt(): boolean {
    return !!(this.searchUsername || '').trim() || this.selectedNames.length > 0;
  }

  get decryptLabel(): string {
    const n = this.selectedNames.length + ((this.searchUsername || '').trim() ? 1 : 0);
    if (n > 1) return `Decrypt ${n} names`;
    return 'Decrypt';
  }

  onSearchEnter(ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.queueName.emit();
  }

  onEngramActivate(): void {
    if (this.mode !== 'idle') return;
    this.searchOpen = true;
    this.searchPanelOpen.emit();
    this.cdr.markForCheck();
  }

  onHoldStart(ev: PointerEvent): void {
    if (ev.button !== undefined && ev.button !== 0) return;
    this.holding = true;
  }

  onHoldEnd(): void {
    this.holding = false;
  }

  onUnzipComplete(): void {
    this.unzipComplete.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mode === 'loading' || this.unzipping) this.skip.emit();
  }

  private collectTargets(): EngramUnzipTarget[] {
    if (typeof document === 'undefined') return [];
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-dc-engram-target]'));
    const rects = nodes
      .map(el => el.getBoundingClientRect())
      .filter(r => r.width > 8 && r.height > 8)
      .map(r => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
    return rects.slice(0, 12);
  }
}
