import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Empty / loading / private placeholder (CODE_CLEANUP_SPEC Step 5).
 * Uses existing `.destiny-empty-state` look via host class.
 */
@Component({
  selector: 'dc-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="destiny-empty-state" [attr.data-kind]="kind">
      <ng-content></ng-content>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  /** Semantic hint for tests / styling: none | loading | private */
  @Input() kind: 'none' | 'loading' | 'private' = 'none';
}
