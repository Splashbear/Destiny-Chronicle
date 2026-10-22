import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Surface panel wrapper (CODE_CLEANUP_SPEC Step 5 / section-card).
 * Defaults to `.destiny-surface-panel` — no visual change vs prior markup.
 */
@Component({
  selector: 'dc-section-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="destiny-surface-panel" [class]="panelClass" [attr.aria-label]="label || null">
      <ng-content></ng-content>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionCardComponent {
  @Input() label = '';
  /** Extra classes appended after destiny-surface-panel (e.g. padding). */
  @Input() panelClass = 'p-4 space-y-4';
}
