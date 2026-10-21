import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Labeled stat value tile (CODE_CLEANUP_SPEC Step 5).
 * Pending shows em dash — never a misleading 0.
 */
@Component({
  selector: 'dc-stat-tile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dc-stat-tile">
      <div class="dc-stat-tile__label">{{ label }}</div>
      <div class="dc-stat-tile__value">{{ pending ? '—' : value }}</div>
      <div *ngIf="hint" class="dc-stat-tile__hint" [attr.title]="hint">{{ hint }}</div>
    </div>
  `,
  styles: [`
    .dc-stat-tile {
      min-width: 0;
    }
    .dc-stat-tile__label {
      font-size: 0.75rem;
      color: var(--dc-muted, #98a2b0);
      margin-bottom: 0.15rem;
    }
    .dc-stat-tile__value {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--dc-gold-bright, #e4c04a);
      font-variant-numeric: tabular-nums;
    }
    .dc-stat-tile__hint {
      font-size: 0.6875rem;
      color: var(--dc-muted, #98a2b0);
      margin-top: 0.15rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatTileComponent {
  @Input() label = '';
  @Input() value: string | number | null = null;
  @Input() pending = false;
  @Input() hint = '';
}
