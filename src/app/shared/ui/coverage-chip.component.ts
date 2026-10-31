import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** Minimal coverage shape for the chip (avoids importing ProfileStore / barrels). */
export interface CoverageChipInput {
  level: string;
  through: string;
  instanceId: string;
}

/**
 * Engram-theme archive coverage chip (CODE_CLEANUP_SPEC Step 5).
 * Facts stay in the tooltip; the chip is flavor.
 */
@Component({
  selector: 'dc-coverage-chip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <p *ngIf="coverage as cov"
       class="engram-cov"
       [ngClass]="chipClass(cov)"
       [attr.title]="tooltip(cov)">{{ line(cov) }}</p>
  `,
  styleUrls: ['./coverage-chip.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoverageChipComponent {
  @Input() coverage: CoverageChipInput | null = null;

  line(cov: CoverageChipInput): string {
    if (cov.level === 'full') return '◆ Live from Bungie';
    if (cov.level === 'partial') return '◆ Live from Bungie';
    if (cov.level === 'absent') return '◇ Live from Bungie';
    return 'Live from Bungie';
  }

  chipClass(cov: CoverageChipInput): string {
    if (cov.level === 'full') return 'engram-cov--full';
    if (cov.level === 'partial') return 'engram-cov--partial';
    if (cov.level === 'absent') return 'engram-cov--sealed';
    return '';
  }

  tooltip(cov: CoverageChipInput): string {
    if (cov.level === 'partial' || cov.level === 'full' || cov.level === 'absent') {
      return 'Games load live from Bungie.';
    }
    return '';
  }
}
