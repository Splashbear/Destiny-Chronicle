import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Ember-framed content shell (CODE_CLEANUP_SPEC Step 5 / fireside-card).
 * Wraps projected content; does not replace Bungie icons.
 */
@Component({
  selector: 'dc-fireside-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dc-fireside-card">
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    .dc-fireside-card {
      border: 1px solid color-mix(in srgb, var(--dc-ember, #c0392b) 35%, transparent);
      border-radius: 0.5rem;
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--dc-ember, #c0392b) 8%, transparent), transparent 40%),
        var(--dc-surface, #2a2f36);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--dc-gold, #c9a227) 12%, transparent);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FiresideCardComponent {}
