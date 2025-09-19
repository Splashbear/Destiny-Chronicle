export interface AnalyticsTimePeriod {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  startDate: Date;
  endDate: Date;
  label: string;
}

export interface AnalyticsDataPoint {
  date: string; // YYYY-MM-DD format
  value: number;
  label?: string;
}

export interface ActivityAnalytics {
  activityName: string;
  activityType: string;
  game: 'D1' | 'D2' | 'both';
  totalPlayCount: number;
  totalTimeSpent: number; // in minutes
  averageTimePerActivity: number; // in minutes
  winRate?: number; // for PvP activities
  completionRate?: number; // for PvE activities
  dataPoints: AnalyticsDataPoint[];
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
}

export interface AnalyticsView {
  id: string;
  name: string;
  description: string;
  activityFilter: string[]; // Activity names or types to include
  gameFilter: ('D1' | 'D2')[];
  platformFilter: string[];
  timePeriod: AnalyticsTimePeriod;
  chartType: 'line' | 'bar' | 'pie';
  metric: 'playCount' | 'timeSpent' | 'winRate' | 'completionRate';
}

export interface AnalyticsSummary {
  totalActivities: number;
  totalTimeSpent: number;
  mostPlayedActivity: string;
  averageSessionsPerDay: number;
  peakActivityDay: string;
  topActivities: ActivityAnalytics[];
}

export interface ActivityOption {
  name: string;
  type: string;
  game: 'D1' | 'D2' | 'both';
  playCount: number;
  timeSpent: number;
}
