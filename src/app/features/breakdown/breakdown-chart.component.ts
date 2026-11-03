import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
// Registers the Chart.js controllers/elements used by Activity Breakdown. Living in this
// component's module keeps chart.js out of the initial bundle (it loads via @defer).
import '../../components/player-search/player-search-charts';

/** Thin wrapper so chart.js + ng2-charts load only when the Breakdown chart is shown. */
@Component({
  selector: 'app-breakdown-chart',
  standalone: true,
  imports: [BaseChartDirective],
  template: `<canvas baseChart [data]="data" [options]="options" [type]="type"></canvas>`,
  changeDetection: ChangeDetectionStrategy.Default,
})
export class BreakdownChartComponent {
  @Input() data!: ChartData;
  @Input() options?: ChartConfiguration['options'];
  @Input() type: ChartType = 'pie';
}
