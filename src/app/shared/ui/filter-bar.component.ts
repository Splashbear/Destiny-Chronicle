import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Slim filter / toolbar row (CODE_CLEANUP_SPEC Step 5).
 * Projects controls; keeps layout only.
 */
@Component({
  selector: 'dc-filter-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dc-filter-bar" [class.dc-filter-bar--wrap]="wrap" role="toolbar" [attr.aria-label]="label || 'Filters'">
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    .dc-filter-bar {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }
    .dc-filter-bar--wrap {
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterBarComponent {
  @Input() label = '';
  @Input() wrap = true;
}
