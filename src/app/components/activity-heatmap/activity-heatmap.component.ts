import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SeasonService } from '../../services/season.service';
import { ActivityDbService } from '../../services/activity-db.service';
import { TimezoneService } from '../../services/timezone.service';
import { ACTIVITY_RELEASE_DATES } from '../../models/activity-release-dates';

interface DayCell {
  day: number;
  date: Date;
  intensity: number;
  activities: number;
  totalSeconds: number;
  isEmpty: boolean;
}

interface SeasonColumn {
  name: string;
  game: 'D1' | 'D2';
  startDate: Date;
  endDate: Date;
  weeks: DayCell[][];
  totalTime: number;
  totalActivities: number;
  markers: ContentMarker[];
}

interface ContentMarker {
  date: Date;
  label: string;
  type: 'season-start' | 'raid' | 'dungeon' | 'expansion';
}

@Component({
  selector: 'app-activity-heatmap',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="activity-heatmap bg-[#0c0a14] rounded-lg p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-2xl font-bold text-white font-d2-headline">Activity Heatmap</h2>
          <p class="text-sm text-slate-400 mt-1">Timezone: {{ timezone }}</p>
        </div>
      </div>

      <div class="heatmap-scroll-container overflow-x-auto pb-4">
        <div class="heatmap-columns flex gap-4" [style.minWidth.px]="seasonColumns.length * 320">
          <div *ngFor="let season of seasonColumns" class="season-column flex-shrink-0 w-[300px]">
            <div class="season-header destiny-panel rounded-t-lg p-3 mb-2">
              <h3 class="text-sm font-semibold text-white truncate" [title]="season.name">{{ season.name }}</h3>
              <div class="text-xs text-slate-400 mt-1">
                <span>{{ formatTime(season.totalTime) }}</span>
                <span class="mx-1">·</span>
                <span>{{ season.totalActivities }} activities</span>
              </div>
            </div>

            <div *ngIf="season.markers.length > 0" class="markers mb-2 space-y-1">
              <div *ngFor="let marker of season.markers" class="text-xs px-2 py-1 rounded"
                   [ngClass]="{
                     'bg-amber-900/30 border-amber-600/40': marker.type === 'season-start' || marker.type === 'expansion',
                     'bg-purple-900/30 border-purple-600/40': marker.type === 'raid',
                     'bg-blue-900/30 border-blue-600/40': marker.type === 'dungeon',
                     'border': true
                   }"
                   [title]="marker.date.toLocaleDateString()">
                <span class="text-slate-300">{{ marker.label }}</span>
              </div>
            </div>

            <div class="calendar-grid destiny-panel rounded-b-lg p-2">
              <div class="grid grid-cols-7 gap-0.5 mb-1">
                <div *ngFor="let day of ['S','M','T','W','T','F','S']" 
                     class="text-center text-xs text-slate-500 font-semibold">
                  {{ day }}
                </div>
              </div>
              
              <div class="space-y-0.5">
                <div *ngFor="let week of season.weeks" class="grid grid-cols-7 gap-0.5">
                  <div *ngFor="let cell of week"
                       class="day-cell aspect-square rounded cursor-pointer text-center text-xs flex items-center justify-center transition-colors"
                       [class.empty]="cell.isEmpty"
                       [class.has-activity]="!cell.isEmpty"
                       [style.background-color]="getIntensityColor(cell.intensity)"
                       [title]="getCellTitle(cell)"
                       (click)="onDayClick(cell)">
                    <span class="text-white text-[10px] font-medium" *ngIf="!cell.isEmpty">{{ cell.day }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="legend flex items-center gap-6 mt-4 text-xs text-slate-400">
        <div class="flex items-center gap-2">
          <span>Intensity:</span>
          <div class="flex gap-1">
            <div class="w-4 h-4 rounded" [style.background-color]="getIntensityColor(0.2)"></div>
            <div class="w-4 h-4 rounded" [style.background-color]="getIntensityColor(0.4)"></div>
            <div class="w-4 h-4 rounded" [style.background-color]="getIntensityColor(0.6)"></div>
            <div class="w-4 h-4 rounded" [style.background-color]="getIntensityColor(0.8)"></div>
            <div class="w-4 h-4 rounded" [style.background-color]="getIntensityColor(1.0)"></div>
          </div>
        </div>
        <div class="flex gap-4">
          <div class="flex items-center gap-1">
            <div class="w-3 h-3 rounded border border-purple-600/40 bg-purple-900/30"></div>
            <span>Raid</span>
          </div>
          <div class="flex items-center gap-1">
            <div class="w-3 h-3 rounded border border-blue-600/40 bg-blue-900/30"></div>
            <span>Dungeon</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .heatmap-scroll-container::-webkit-scrollbar {
      height: 8px;
    }
    .heatmap-scroll-container::-webkit-scrollbar-track {
      background: rgba(15, 23, 42, 0.5);
      border-radius: 4px;
    }
    .heatmap-scroll-container::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.3);
      border-radius: 4px;
    }
    .heatmap-scroll-container::-webkit-scrollbar-thumb:hover {
      background: rgba(148, 163, 184, 0.5);
    }
    .day-cell.empty {
      background: rgba(15, 23, 42, 0.5);
    }
    .day-cell.has-activity:hover {
      filter: brightness(1.2);
      transform: scale(1.05);
    }
  `]
})
export class ActivityHeatmapComponent implements OnInit {
  @Output() navigateToDate = new EventEmitter<Date>();

  seasonColumns: SeasonColumn[] = [];
  timezone = '';

  private readonly D1_SEASONS = [
    { name: 'Destiny', start: new Date(2014, 8, 9), end: new Date(2014, 11, 9) },
    { name: 'The Dark Below', start: new Date(2014, 11, 9), end: new Date(2015, 4, 19) },
    { name: 'House of Wolves', start: new Date(2015, 4, 19), end: new Date(2015, 8, 15) },
    { name: 'The Taken King', start: new Date(2015, 8, 15), end: new Date(2016, 8, 20) },
    { name: 'Rise of Iron', start: new Date(2016, 8, 20), end: new Date(2017, 8, 6) },
  ];

  private readonly D2_SEASONS = [
    { name: 'Red War', start: new Date(2017, 8, 6), end: new Date(2017, 11, 5) },
    { name: 'Curse of Osiris', start: new Date(2017, 11, 5), end: new Date(2018, 4, 8) },
    { name: 'Warmind', start: new Date(2018, 4, 8), end: new Date(2018, 8, 4) },
    { name: 'Season of the Outlaw', start: new Date(2018, 8, 4), end: new Date(2018, 11, 4) },
    { name: 'Season of the Forge', start: new Date(2018, 11, 4), end: new Date(2019, 2, 5) },
    { name: 'Season of the Drifter', start: new Date(2019, 2, 5), end: new Date(2019, 5, 4) },
    { name: 'Season of Opulence', start: new Date(2019, 5, 4), end: new Date(2019, 9, 1) },
    { name: 'Season of the Undying', start: new Date(2019, 9, 1), end: new Date(2019, 11, 10) },
    { name: 'Season of Dawn', start: new Date(2019, 11, 10), end: new Date(2020, 2, 10) },
    { name: 'Season of the Worthy', start: new Date(2020, 2, 10), end: new Date(2020, 5, 9) },
    { name: 'Season of Arrivals', start: new Date(2020, 5, 9), end: new Date(2020, 10, 10) },
    { name: 'Season of the Hunt', start: new Date(2020, 10, 10), end: new Date(2021, 1, 9) },
    { name: 'Season of the Chosen', start: new Date(2021, 1, 9), end: new Date(2021, 4, 11) },
    { name: 'Season of the Splicer', start: new Date(2021, 4, 11), end: new Date(2021, 7, 24) },
    { name: 'Season of the Lost', start: new Date(2021, 7, 24), end: new Date(2022, 1, 22) },
    { name: 'Season of the Risen', start: new Date(2022, 1, 22), end: new Date(2022, 4, 24) },
    { name: 'Season of the Haunted', start: new Date(2022, 4, 24), end: new Date(2022, 7, 23) },
    { name: 'Season of Plunder', start: new Date(2022, 7, 23), end: new Date(2022, 11, 6) },
    { name: 'Season of the Seraph', start: new Date(2022, 11, 6), end: new Date(2023, 1, 28) },
    { name: 'Season of Defiance', start: new Date(2023, 1, 28), end: new Date(2023, 4, 23) },
    { name: 'Season of the Deep', start: new Date(2023, 4, 23), end: new Date(2023, 7, 22) },
    { name: 'Season of the Witch', start: new Date(2023, 7, 22), end: new Date(2023, 10, 28) },
    { name: 'Season of the Wish', start: new Date(2023, 10, 28), end: new Date(2024, 5, 11) },
    { name: 'Episode: Echoes', start: new Date(2024, 5, 11), end: new Date(2024, 9, 8) },
    { name: 'Episode: Revenant', start: new Date(2024, 9, 8), end: new Date(2025, 1, 10) },
    { name: 'Episode: Heresy', start: new Date(2025, 1, 10), end: new Date(2025, 6, 15) },
    { name: 'The Edge of Fate', start: new Date(2025, 6, 15), end: new Date(2026, 0, 1) },
  ];

  constructor(
    private seasonService: SeasonService,
    private activityDb: ActivityDbService,
    private timezoneService: TimezoneService
  ) {
    this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  async ngOnInit(): Promise<void> {
    await this.loadHeatmapData();
  }

  private async loadHeatmapData(): Promise<void> {
    const allActivities = await this.activityDb.activities.toArray();
    const activityMap = this.buildActivityMap(allActivities);
    
    this.seasonColumns = [];
    
    // Build D1 columns
    for (const season of this.D1_SEASONS) {
      const column = this.buildSeasonColumn(season.name, 'D1', season.start, season.end, activityMap);
      if (column.totalActivities > 0) {
        this.seasonColumns.push(column);
      }
    }
    
    // Build D2 columns
    for (const season of this.D2_SEASONS) {
      const column = this.buildSeasonColumn(season.name, 'D2', season.start, season.end, activityMap);
      if (column.totalActivities > 0) {
        this.seasonColumns.push(column);
      }
    }
  }

  private buildActivityMap(activities: any[]): Map<string, { count: number; seconds: number }> {
    const map = new Map<string, { count: number; seconds: number }>();
    
    for (const activity of activities) {
      if (!activity.period) continue;
      
      const date = new Date(activity.period);
      const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      
      const seconds = activity.values?.timePlayedSeconds?.basic?.value || 0;
      const existing = map.get(key) || { count: 0, seconds: 0 };
      map.set(key, {
        count: existing.count + 1,
        seconds: existing.seconds + seconds
      });
    }
    
    return map;
  }

  private buildSeasonColumn(
    name: string,
    game: 'D1' | 'D2',
    start: Date,
    end: Date,
    activityMap: Map<string, { count: number; seconds: number }>
  ): SeasonColumn {
    const weeks: DayCell[][] = [];
    let currentWeek: DayCell[] = [];
    let totalTime = 0;
    let totalActivities = 0;
    let maxSeconds = 0;

    // First pass: calculate max for relative intensity
    const tempMap = new Map<string, number>();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const data = activityMap.get(key);
      if (data && data.seconds > maxSeconds) {
        maxSeconds = data.seconds;
      }
      if (data) {
        tempMap.set(key, data.seconds);
      }
    }

    // Build calendar grid
    const firstDate = new Date(start);
    const dayOfWeek = firstDate.getDay();
    
    // Fill leading empty cells
    for (let i = 0; i < dayOfWeek; i++) {
      currentWeek.push({
        day: 0,
        date: new Date(0),
        intensity: 0,
        activities: 0,
        totalSeconds: 0,
        isEmpty: true
      });
    }

    // Fill actual days
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const data = activityMap.get(key);
      const seconds = data?.seconds || 0;
      const count = data?.count || 0;

      const cell: DayCell = {
        day: d.getDate(),
        date: new Date(d),
        intensity: maxSeconds > 0 ? seconds / maxSeconds : 0,
        activities: count,
        totalSeconds: seconds,
        isEmpty: count === 0
      };

      currentWeek.push(cell);
      totalTime += seconds;
      totalActivities += count;

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Fill trailing empty cells
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({
          day: 0,
          date: new Date(0),
          intensity: 0,
          activities: 0,
          totalSeconds: 0,
          isEmpty: true
        });
      }
      weeks.push(currentWeek);
    }

    const markers = this.getContentMarkers(game, start, end);

    return {
      name,
      game,
      startDate: start,
      endDate: end,
      weeks,
      totalTime,
      totalActivities,
      markers
    };
  }

  private getContentMarkers(game: 'D1' | 'D2', start: Date, end: Date): ContentMarker[] {
    const markers: ContentMarker[] = [];

    // Add season start marker
    markers.push({
      date: start,
      label: 'Season Start',
      type: 'season-start'
    });

    // Add raid and dungeon markers from release dates
    for (const [name, dateStr] of Object.entries(ACTIVITY_RELEASE_DATES)) {
      const releaseDate = new Date(dateStr);
      if (releaseDate >= start && releaseDate <= end) {
        let type: 'raid' | 'dungeon' | 'expansion' = 'raid';
        
        if (name.toLowerCase().includes('dungeon') || 
            ['The Shattered Throne', 'Pit of Heresy', 'Prophecy', 'Grasp of Avarice', 
             'Duality', 'Spire of the Watcher', 'Ghosts of the Deep', 'Warlord\'s Ruin', 
             'Vesper\'s Host', 'Sundered Doctrine'].includes(name)) {
          type = 'dungeon';
        }

        // Match D1 vs D2 based on release dates
        const isD1Content = releaseDate.getFullYear() < 2017 || 
                           (releaseDate.getFullYear() === 2017 && releaseDate.getMonth() < 8);
        
        if ((game === 'D1' && isD1Content) || (game === 'D2' && !isD1Content)) {
          markers.push({
            date: releaseDate,
            label: name,
            type
          });
        }
      }
    }

    return markers.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  getIntensityColor(intensity: number): string {
    if (intensity === 0) {
      return 'rgba(15, 23, 42, 0.5)';
    }
    
    const baseHue = 260;
    const saturation = 70;
    const minLightness = 20;
    const maxLightness = 60;
    const lightness = minLightness + (maxLightness - minLightness) * intensity;
    
    return `hsl(${baseHue}, ${saturation}%, ${lightness}%)`;
  }

  getCellTitle(cell: DayCell): string {
    if (cell.isEmpty) {
      return cell.date.toLocaleDateString();
    }
    
    return `${cell.date.toLocaleDateString()}\n${this.formatTime(cell.totalSeconds)}\n${cell.activities} activities`;
  }

  formatTime(seconds: number): string {
    if (!seconds || seconds <= 0) {
      return '0m';
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  onDayClick(cell: DayCell): void {
    if (!cell.isEmpty) {
      this.navigateToDate.emit(cell.date);
    }
  }
}
