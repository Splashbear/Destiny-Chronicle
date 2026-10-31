import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Original engram shape for the Engram / Fireside theme (Phase 1).
 * Brightens and cracks with real load progress. Static under prefers-reduced-motion.
 */
@Component({
  selector: 'app-decrypting-engram',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="decrypting-engram"
         [class.decrypting-engram--sm]="size === 'sm'"
         [class.decrypting-engram--lg]="size === 'lg'"
         [class.decrypting-engram--done]="clamped >= 100"
         role="img"
         [attr.aria-label]="ariaLabel">
      <svg viewBox="0 0 140 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <radialGradient [attr.id]="gradId" cx="50%" cy="40%" r="65%">
            <stop offset="0%" stop-color="#ffe9a8"/>
            <stop offset="55%" stop-color="#c9a227"/>
            <stop offset="100%" stop-color="#5a4a1c"/>
          </radialGradient>
        </defs>
        <polygon points="70,8 128,44 128,116 70,152 12,116 12,44"
                 class="decrypting-engram__shell"
                 fill="#15191e" stroke="#c9a227" stroke-width="3"/>
        <polygon points="70,30 108,54 108,106 70,130 32,106 32,54"
                 class="decrypting-engram__core"
                 [attr.fill]="'url(#' + gradId + ')'"
                 [attr.opacity]="coreOpacity"/>
        <path class="decrypting-engram__crack decrypting-engram__crack--main"
              d="M70 30 L62 70 L78 84 L66 130"
              fill="none" stroke="#0c0e10" stroke-width="3"
              [attr.opacity]="crackOpacity"/>
        <path class="decrypting-engram__crack decrypting-engram__crack--side"
              d="M108 54 L84 76"
              fill="none" stroke="#0c0e10" stroke-width="2"
              [attr.opacity]="crackOpacity * 0.85"/>
        <path *ngIf="clamped >= 70"
              class="decrypting-engram__crack decrypting-engram__crack--late"
              d="M32 54 L52 78"
              fill="none" stroke="#0c0e10" stroke-width="2"
              [attr.opacity]="(clamped - 70) / 30"/>
      </svg>
    </div>
  `,
  styles: [`
    .decrypting-engram {
      display: inline-flex;
      flex-shrink: 0;
      line-height: 0;
    }
    .decrypting-engram svg {
      width: 3.25rem;
      height: 3.75rem;
      display: block;
    }
    .decrypting-engram--sm svg {
      width: 1.75rem;
      height: 2rem;
    }
    .decrypting-engram--lg svg {
      width: 7rem;
      height: 8rem;
    }
    .decrypting-engram__shell {
      transition: stroke 0.35s ease;
    }
    .decrypting-engram__core {
      transition: opacity 0.35s ease;
    }
    .decrypting-engram__crack {
      transition: opacity 0.35s ease;
    }
    .decrypting-engram--done .decrypting-engram__shell {
      stroke: #e4c04a;
      filter: drop-shadow(0 0 6px rgba(228, 192, 74, 0.45));
    }
    @media (prefers-reduced-motion: reduce) {
      .decrypting-engram__shell,
      .decrypting-engram__core,
      .decrypting-engram__crack {
        transition: none !important;
      }
      .decrypting-engram--done .decrypting-engram__shell {
        filter: none;
      }
    }
  `],
})
export class DecryptingEngramComponent {
  /** 0–100 load progress. */
  @Input() progress = 0;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() ariaLabel = 'Decrypting history';

  private static nextId = 0;
  readonly gradId = `engram-grad-${DecryptingEngramComponent.nextId++}`;

  get clamped(): number {
    const n = Number(this.progress);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  /** Core glow rises with progress (sealed dark → bright decrypted). */
  get coreOpacity(): number {
    return 0.2 + (this.clamped / 100) * 0.75;
  }

  /** Crack appears mid-load and deepens toward complete. */
  get crackOpacity(): number {
    if (this.clamped < 15) return 0.15;
    return 0.15 + (this.clamped / 100) * 0.85;
  }
}
