import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DecryptingEngramComponent } from '../../components/decrypting-engram/decrypting-engram.component';

/**
 * Progress-driven decrypting engram + caption (CODE_CLEANUP_SPEC Step 5 / load-engram).
 * Honors prefers-reduced-motion via the inner DecryptingEngramComponent.
 */
@Component({
  selector: 'dc-load-engram',
  standalone: true,
  imports: [CommonModule, DecryptingEngramComponent],
  template: `
    <div class="dc-load-engram"
         [class.dc-load-engram--centered]="centered && layout === 'stack'"
         [class.dc-load-engram--row]="layout === 'row'">
      <app-decrypting-engram
        [size]="size"
        [progress]="progress"
        [ariaLabel]="caption || 'Decrypting history'"></app-decrypting-engram>
      <div class="dc-load-engram__text" *ngIf="caption || subline || hasProjected">
        <div *ngIf="caption" class="engram-decrypt-cap">{{ caption }}</div>
        <div *ngIf="subline" class="engram-decrypt-sub">{{ subline }}</div>
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .dc-load-engram { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
    .dc-load-engram--centered { align-items: center; text-align: center; }
    .dc-load-engram--row {
      flex-direction: row;
      align-items: center;
      gap: 0.75rem;
      flex: 1;
      min-width: 0;
    }
    .dc-load-engram--row .dc-load-engram__text { flex: 1; min-width: 0; }
    .engram-decrypt-cap {
      color: var(--dc-gold, #c9a227);
      font-size: 1.05rem;
      font-weight: 600;
      letter-spacing: 0.01em;
    }
    .engram-decrypt-sub {
      color: var(--dc-muted, #98a2b0);
      font-size: 0.875rem;
      margin-top: 0.15rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadEngramComponent {
  /** 0–100 load progress. */
  @Input() progress = 0;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() caption = '';
  @Input() subline = '';
  @Input() centered = true;
  /** stack = caption under engram; row = engram beside caption (loading strip). */
  @Input() layout: 'stack' | 'row' = 'stack';
  /** When true, always render the text column so projected content (progress bar) shows. */
  @Input() hasProjected = false;
}
