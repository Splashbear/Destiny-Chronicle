import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AnalyticsService } from '../../services/analytics.service';
import { ActivityDbService } from '../../services/activity-db.service';
import { DestinyManifestService } from '../../services/destiny-manifest.service';
import { SelectedAccountsService } from '../../services/selected-accounts.service';
import { 
  AnalyticsTimePeriod, 
  ActivityAnalytics, 
  AnalyticsSummary 
} from '../../models/analytics.model';

// Chart.js imports
import { 
  ChartConfiguration, 
  ChartData, 
  ChartType,
  CategoryScale,
  LinearScale,
  registerables
} from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

// Register Chart.js components
import { Chart } from 'chart.js';
Chart.register(...registerables);

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.scss']
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Data
  analyticsData: ActivityAnalytics[] = [];
  summaryData: AnalyticsSummary | null = null;
  
  // UI State
  loading = false;
  errorMessage = '';
  selectedTimePeriod: AnalyticsTimePeriod | null = null;
  selectedActivities: string[] = [];
  selectedActivityType = '';
  selectedMetric: 'playCount' | 'timeSpent' | 'winRate' | 'completionRate' = 'playCount';
  selectedGame: 'D1' | 'D2' | 'both' = 'D2';

  // Chart Configuration
  chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
      },
      title: {
        display: true,
        text: 'Activity Analytics'
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Date'
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Count'
        }
      }
    }
  };

  chartData: ChartData<'line' | 'bar' | 'pie'> = {
    labels: [],
    datasets: []
  };

  chartType: ChartType = 'line';

  // Chart instance reference for cleanup
  private chartInstance: any = null;

  // Time period options
  timePeriodOptions = [
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
    { value: '1y', label: 'Last year' },
    { value: 'all', label: 'All time' }
  ];

  // Activity type options
  activityTypeOptions = [
    { value: '', label: 'All Types' },
    { value: 'Raid', label: 'Raids' },
    { value: 'Dungeon', label: 'Dungeons' },
    { value: 'Lost Sector', label: 'Lost Sectors' },
    { value: 'Seasonal', label: 'Seasonal Activities' },
    { value: 'PvP', label: 'PvP' },
    { value: 'Strike', label: 'Strikes' },
    { value: 'Gambit', label: 'Gambit' }
  ];

  // Available activities (populated from data)
  availableActivities: any[] = [];

  constructor(
    private analyticsService: AnalyticsService,
    private activityDb: ActivityDbService,
    private manifest: DestinyManifestService,
    private selectedAccountsService: SelectedAccountsService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.setDefaultTimePeriod();
    
    // Subscribe to changes in selected accounts
    this.selectedAccountsService.accounts$
      .pipe(takeUntil(this.destroy$))
      .subscribe((accounts) => {
        console.log('Analytics: Accounts changed, reloading analytics. Accounts:', accounts);
        this.loadAnalytics();
      });
    
    // Load initial analytics
    this.loadAnalytics();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    
    // Clean up chart instance
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }


  private setDefaultTimePeriod() {
    this.selectedTimePeriod = {
      type: 'monthly',
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
      label: 'Last 30 days'
    };
  }


  onTimePeriodChange(period: string) {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = new Date('2014-09-09'); // Destiny 1 launch
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    this.selectedTimePeriod = {
      type: period === 'all' ? 'custom' : 'monthly',
      startDate,
      endDate: now,
      label: this.timePeriodOptions.find(opt => opt.value === period)?.label || 'Custom'
    };

    this.loadAnalytics();
  }

  onActivityToggle(activity: string) {
    const index = this.selectedActivities.indexOf(activity);
    if (index > -1) {
      this.selectedActivities.splice(index, 1);
    } else {
      this.selectedActivities.push(activity);
    }
    this.loadAnalytics();
  }

  onActivitySelectAll() {
    this.selectedActivities = this.availableActivities.map(a => a.name);
    this.loadAnalytics();
  }

  onActivityClearAll() {
    this.selectedActivities = [];
    this.loadAnalytics();
  }

  onGameChange(game: 'D1' | 'D2' | 'both') {
    this.selectedGame = game;
    this.loadAnalytics();
  }

  onMetricChange(metric: 'playCount' | 'timeSpent' | 'winRate' | 'completionRate') {
    this.selectedMetric = metric;
    this.updateChart();
  }

  onChartTypeChange(type: 'line' | 'bar' | 'pie') {
    this.chartType = type;
    this.destroyChart(); // Clean up existing chart
    
    // If switching to pie chart and no activities selected, clear selections
    if (type === 'pie' && this.selectedActivities.length === 0) {
      this.selectedActivities = [];
    }
    
    this.loadAnalytics();
  }

  onActivityTypeChange(activityType: string) {
    this.selectedActivityType = activityType;
    this.selectedActivities = []; // Clear specific activity selection
    this.loadAnalytics();
  }

  async loadAnalytics() {
    if (!this.selectedTimePeriod) return;

    this.loading = true;
    this.errorMessage = '';

    try {
      // Get player IDs from selected players (you'll need to pass this from parent component)
      const playerIds = this.getSelectedPlayerIds();
      console.log('Analytics loadAnalytics: playerIds =', playerIds);
      
      if (playerIds.length === 0) {
        console.log('Analytics: No players selected, showing error message');
        this.errorMessage = 'No players selected. Please select players first.';
        this.loading = false;
        return;
      }

      // Load available activities for dropdown
      this.availableActivities = await this.analyticsService.getAvailableActivities(
        this.selectedTimePeriod!,
        playerIds,
        this.selectedGame,
        this.selectedActivityType || undefined
      );

      // Load specific activities data if selected, otherwise show summary
      if (this.selectedActivities.length > 0) {
        if (this.chartType === 'pie') {
          // For pie charts, get pie chart data
          const pieData = await this.analyticsService.getPieChartData(
            this.selectedActivities,
            this.selectedTimePeriod!,
            playerIds,
            this.selectedGame,
            this.selectedMetric
          );
          this.updatePieChart(pieData);
        } else {
          // For line/bar charts, get individual activity analytics
          const activityDataPromises = this.selectedActivities.map(activityName =>
            this.analyticsService.getActivityAnalytics(
              activityName,
              this.selectedTimePeriod!,
              playerIds,
              this.selectedGame
            )
          );
          this.analyticsData = await Promise.all(activityDataPromises);
          this.updateChart();
        }
      } else {
        // Load summary data based on selected game and activity type
        this.summaryData = await this.analyticsService.getAnalyticsSummary(
          this.selectedTimePeriod!,
          playerIds,
          this.selectedGame,
          this.selectedActivityType || undefined
        );
        this.analyticsData = this.summaryData.topActivities;
        this.updateChart();
      }

    } catch (error) {
      console.error('Error loading analytics:', error);
      this.errorMessage = 'Failed to load analytics data. Please try again.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private updateChart() {
    console.log('Analytics: updateChart called, analyticsData length:', this.analyticsData.length);
    
    if (this.analyticsData.length === 0) {
      console.log('Analytics: No analytics data, returning');
      return;
    }

    // If we have specific activities selected, show their trends
    if (this.selectedActivities.length > 0 && this.analyticsData.length > 0) {
      const data = this.analyticsData[0];
      const labels = data.dataPoints.map(point => point.label || point.date);
      const values = data.dataPoints.map(point => point.value);
      
      console.log('Analytics: Showing specific activity trend, labels:', labels, 'values:', values);

      this.chartData = {
        labels,
        datasets: [{
          data: values,
          borderColor: this.getChartColor(data.trend),
          backgroundColor: this.getChartColor(data.trend, 0.1),
          fill: this.chartType === 'line',
          tension: 0.4
        }]
      };
    } else {
      // Show summary data - top activities by play count
      const topActivities = this.analyticsData.slice(0, 5);
      const labels = topActivities.map(activity => activity.activityName);
      const values = topActivities.map(activity => {
        switch (this.selectedMetric) {
          case 'playCount': return activity.totalPlayCount;
          case 'timeSpent': return activity.totalTimeSpent;
          case 'winRate': return activity.winRate || 0;
          case 'completionRate': return activity.completionRate || 0;
          default: return activity.totalPlayCount;
        }
      });
      
      console.log('Analytics: Showing summary data, labels:', labels, 'values:', values);

      this.chartData = {
        labels,
        datasets: [{
          data: values,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: this.chartType === 'line',
          tension: 0.4
        }]
      };
    }

    console.log('Analytics: Final chartData:', this.chartData);

    // Update chart options based on metric
    this.updateChartOptions();
    
    // Trigger change detection to update the chart
    this.cdr.detectChanges();
  }

  private updatePieChart(pieData: { labels: string[], data: number[], colors: string[] }) {
    console.log('Analytics: updatePieChart called with data:', pieData);
    
    this.chartData = {
      labels: pieData.labels,
      datasets: [{
        data: pieData.data,
        backgroundColor: pieData.colors,
        borderColor: pieData.colors.map(color => color + '80'), // Add transparency to borders
        borderWidth: 2
      }]
    };

    // Update chart options for pie chart
    this.chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'right',
        },
        title: {
          display: true,
          text: `${this.getMetricLabel()} by Activity`
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.label || '';
              const value = context.parsed;
              const total = (context.dataset.data as number[]).reduce((a: number, b: number) => a + b, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    };

    this.cdr.detectChanges();
  }

  private destroyChart() {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  private updateChartOptions() {
    const yAxisLabel = this.getYAxisLabel();
    
    this.chartOptions = {
      ...this.chartOptions,
      scales: {
        ...this.chartOptions?.scales,
        y: {
          display: true,
          title: {
            display: true,
            text: yAxisLabel
          }
        }
      },
      plugins: {
        ...this.chartOptions?.plugins,
        title: {
          display: true,
          text: `${this.selectedActivities.length > 0 ? this.selectedActivities.join(', ') : 'Activity'} Analytics`
        }
      }
    };
  }

  private getYAxisLabel(): string {
    switch (this.selectedMetric) {
      case 'playCount': return 'Number of Activities';
      case 'timeSpent': return 'Time (minutes)';
      case 'winRate': return 'Win Rate (%)';
      case 'completionRate': return 'Completion Rate (%)';
      default: return 'Count';
    }
  }

  private getChartColor(trend: 'up' | 'down' | 'stable', alpha: number = 1): string {
    switch (trend) {
      case 'up': return `rgba(34, 197, 94, ${alpha})`; // Green
      case 'down': return `rgba(239, 68, 68, ${alpha})`; // Red
      case 'stable': return `rgba(59, 130, 246, ${alpha})`; // Blue
      default: return `rgba(107, 114, 128, ${alpha})`; // Gray
    }
  }

  private getSelectedPlayerIds(): string[] {
    // Get player IDs from the selected accounts service
    const accounts = this.selectedAccountsService.current;
    console.log('Analytics: Selected accounts:', accounts);
    const playerIds = accounts.map(p => p.membershipId);
    console.log('Analytics: Player IDs:', playerIds);
    return playerIds;
  }

  getTrendIcon(trend: 'up' | 'down' | 'stable'): string {
    switch (trend) {
      case 'up': return '↗';
      case 'down': return '↘';
      case 'stable': return '→';
      default: return '→';
    }
  }

  getTrendColor(trend: 'up' | 'down' | 'stable'): string {
    switch (trend) {
      case 'up': return 'text-green-500';
      case 'down': return 'text-red-500';
      case 'stable': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  }

  formatTime(minutes: number): string {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  private getMetricLabel(): string {
    switch (this.selectedMetric) {
      case 'playCount': return 'Play Count';
      case 'timeSpent': return 'Time Spent';
      case 'winRate': return 'Win Rate';
      case 'completionRate': return 'Completion Rate';
      default: return 'Count';
    }
  }

  roundTime(seconds: number): number {
    return Math.round(seconds / 60);
  }
}
