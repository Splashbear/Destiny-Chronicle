import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-destiny-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="destiny-loader" [class.destiny-loader--sm]="size === 'sm'" [class.destiny-loader--lg]="size === 'lg'" role="status" [attr.aria-label]="label">
      <svg class="destiny-loader__svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle class="destiny-loader__ring" cx="32" cy="32" r="26" fill="none" stroke-width="1.5"/>
        <g class="destiny-loader__ticks">
          <line x1="32" y1="6" x2="32" y2="14" stroke-width="2" stroke-linecap="round"/>
          <line x1="32" y1="50" x2="32" y2="58" stroke-width="2" stroke-linecap="round"/>
          <line x1="6" y1="32" x2="14" y2="32" stroke-width="2" stroke-linecap="round"/>
          <line x1="50" y1="32" x2="58" y2="32" stroke-width="2" stroke-linecap="round"/>
          <line x1="13.5" y1="13.5" x2="19" y2="19" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="45" y1="45" x2="50.5" y2="50.5" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="50.5" y1="13.5" x2="45" y2="19" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="19" y1="45" x2="13.5" y2="50.5" stroke-width="1.5" stroke-linecap="round"/>
        </g>
        <circle class="destiny-loader__core" cx="32" cy="32" r="3"/>
        <circle class="destiny-loader__scan" cx="32" cy="32" r="20" fill="none" stroke-width="1" stroke-dasharray="8 120"/>
      </svg>
      <span *ngIf="label" class="destiny-loader__label">{{ label }}</span>
    </div>
  `,
  styles: [`
    .destiny-loader {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }

    .destiny-loader__svg {
      width: 2.5rem;
      height: 2.5rem;
    }

    .destiny-loader--sm .destiny-loader__svg {
      width: 1.25rem;
      height: 1.25rem;
    }

    .destiny-loader--lg .destiny-loader__svg {
      width: 3.5rem;
      height: 3.5rem;
    }

    .destiny-loader__ring {
      stroke: rgba(201, 162, 39, 0.22);
    }

    .destiny-loader__ticks {
      stroke: var(--destiny-gold, #c9a227);
      transform-origin: 32px 32px;
      animation: destiny-loader-spin 2.4s linear infinite;
    }

    .destiny-loader__core {
      fill: var(--destiny-flame, #e67e22);
      animation: destiny-loader-pulse 1.6s ease-in-out infinite;
    }

    .destiny-loader__scan {
      stroke: var(--destiny-ember, #c0392b);
      transform-origin: 32px 32px;
      animation: destiny-loader-scan 1.8s linear infinite;
    }

    .destiny-loader__label {
      font-size: 0.875rem;
      color: #a1a1aa;
    }

    @keyframes destiny-loader-spin {
      to { transform: rotate(360deg); }
    }

    @keyframes destiny-loader-pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }

    @keyframes destiny-loader-scan {
      to { transform: rotate(360deg); stroke-dashoffset: -128; }
    }

    @media (prefers-reduced-motion: reduce) {
      .destiny-loader__ticks,
      .destiny-loader__scan,
      .destiny-loader__core {
        animation: none !important;
      }
    }
  `]
})
export class DestinyLoaderComponent {
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() label = '';
}
