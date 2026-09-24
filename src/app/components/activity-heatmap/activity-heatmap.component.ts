import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivityDbService } from '../../services/activity-db.service';
import { ACTIVITY_RELEASE_DATES } from '../../models/activity-release-dates';
import {
  activitySeconds,
  characterKey,
  clipRangeToYear,
  filterHeatmapActivities,
  formatDaysHours,
  heatmapHasActivity,
  HeatmapCharacterLookup,
  HeatmapCharacterOption,
  HeatmapPlatformOption,
  HeatmapSeasonOption,
  HeatmapYearOption,
  seasonOverlapsYear,
  uniqueCharacters,
  uniquePlatforms,
  uniqueYears,
  weekMonthLabels
} from '../../utils/heatmap-filters';

interface DayCell {
  day: number;
  date: Date;
  intensity: number;
  activities: number;
  totalSeconds: number;
  isEmpty: boolean;
  marker?: ContentMarker;
}

interface HeatmapWeek {
  cells: DayCell[];
  monthLabel: string | null;
}

interface SeasonColumn {
  name: string;
  game: 'D1' | 'D2';
  startDate: Date;
  endDate: Date;
  weeks: HeatmapWeek[];
  totalTime: number;
  daysPlayed: number;
  totalActivities: number;
}

interface ContentMarker {
  date: Date;
  label: string;
  type: 'season-start' | 'raid' | 'dungeon' | 'expansion';
  iconUrl: string;
}

interface NamedRange {
  name: string;
  game: 'D1' | 'D2';
  start: Date;
  end: Date;
}

@Component({
  selector: 'app-activity-heatmap',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="activity-heatmap">
      <div class="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 class="text-xl font-bold text-white font-d2-headline">Activity Heatmap</h2>
          <p class="text-xs text-slate-400 mt-0.5">{{ timezone }} · {{ formatDaysHours(grandTotalSeconds, grandDaysPlayed) }}</p>
          <p class="text-xs text-amber-200/90 mt-0.5">Showing {{ viewSummary }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <label class="filter-field">
            <span>View</span>
            <select [(ngModel)]="groupBy" (ngModelChange)="rebuild()">
              <option value="season">By season</option>
              <option value="year">By year</option>
            </select>
          </label>
          <label class="filter-field">
            <span>Platform</span>
            <select [(ngModel)]="platformFilter" (ngModelChange)="onPlatformChange()" [title]="selectedPlatformLabel()">
              <option value="all">All platforms</option>
              <option *ngFor="let p of platforms; trackBy: trackPlatform" [value]="p.type.toString()" [disabled]="p.disabled">{{ p.name }}</option>
            </select>
          </label>
          <label class="filter-field filter-field-wide">
            <span>Character</span>
            <select [(ngModel)]="characterFilter" (ngModelChange)="onCharacterChange()" [title]="selectedCharacterLabel()">
              <option value="all">All characters</option>
              <option *ngFor="let c of characters; trackBy: trackCharacter" [value]="c.key" [disabled]="c.disabled">{{ c.label }}</option>
            </select>
          </label>
          <label class="filter-field">
            <span>Year</span>
            <select [(ngModel)]="yearFilter" (ngModelChange)="onYearChange()" [title]="selectedYearLabel()">
              <option value="all">All years</option>
              <option *ngFor="let y of yearOptions; trackBy: trackYear" [value]="y.year.toString()" [disabled]="y.disabled">{{ y.year }}</option>
            </select>
          </label>
          <label class="filter-field" *ngIf="groupBy === 'season'">
            <span>Season</span>
            <select [(ngModel)]="seasonFilter" (ngModelChange)="rebuild()">
              <option value="all">All seasons</option>
              <option *ngFor="let s of seasonOptions; trackBy: trackSeason" [value]="s.name" [disabled]="s.disabled">{{ s.name }}</option>
            </select>
          </label>
        </div>
      </div>

      <div class="heatmap-scroll" *ngIf="seasonColumns.length > 0; else emptyHeatmap">
        <div class="heatmap-columns">
          <div *ngFor="let season of seasonColumns" class="season-column">
            <div class="season-header">
              <h3 [title]="season.name">{{ season.name }}</h3>
              <p>{{ formatDaysHours(season.totalTime, season.daysPlayed) }}</p>
            </div>
            <div class="calendar-grid">
              <div *ngFor="let week of season.weeks" class="week-row" [class.month-start]="!!week.monthLabel">
                <span class="month-label">{{ week.monthLabel || '' }}</span>
                <button *ngFor="let cell of week.cells"
                        type="button"
                        class="day-cell"
                        [class.empty]="cell.isEmpty && !cell.marker"
                        [class.pad]="cell.day === 0"
                        [class.has-activity]="!cell.isEmpty"
                        [style.background-color]="cell.day === 0 ? 'transparent' : getIntensityColor(cell.intensity)"
                        [title]="getCellTitle(cell)"
                        [disabled]="cell.day === 0"
                        (click)="onDayClick(cell)">
                  <img *ngIf="cell.marker && cell.day > 0"
                       [src]="cell.marker.iconUrl"
                       class="cell-marker-icon"
                       alt="">
                  <span class="day-num">{{ cell.day || '' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ng-template #emptyHeatmap>
        <p class="text-sm text-slate-400 py-8 text-center">No activity for {{ viewSummary }}. Greyed-out dropdown options have no playtime in this view.</p>
      </ng-template>

      <div class="legend">
        <span>Less</span>
        <div class="w-3 h-3 rounded-sm" [style.background-color]="getIntensityColor(0.15)"></div>
        <div class="w-3 h-3 rounded-sm" [style.background-color]="getIntensityColor(0.4)"></div>
        <div class="w-3 h-3 rounded-sm" [style.background-color]="getIntensityColor(0.65)"></div>
        <div class="w-3 h-3 rounded-sm" [style.background-color]="getIntensityColor(1)"></div>
        <span>More</span>
      </div>
    </div>
  `,
  styles: [`
    .activity-heatmap { color: #e2e8f0; }
    .filter-field {
      display: flex;
      flex-direction: column;
      gap: 2px;
      color: #94a3b8;
    }
    .filter-field select {
      background: #0f172a;
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: #f8fafc;
      border-radius: 6px;
      padding: 4px 8px;
      min-width: 9.5rem;
    }
    .filter-field-wide select { min-width: 18rem; }
    .filter-field select option:disabled {
      color: #64748b;
    }
    .heatmap-scroll {
      overflow-x: auto;
      overflow-y: hidden;
      transform: rotateX(180deg);
      padding-top: 2px;
      margin-bottom: 8px;
    }
    .heatmap-scroll::-webkit-scrollbar { height: 10px; }
    .heatmap-scroll::-webkit-scrollbar-track {
      background: rgba(245, 158, 11, 0.12);
      border-radius: 6px;
    }
    .heatmap-scroll::-webkit-scrollbar-thumb {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.7), rgba(251, 146, 60, 0.7));
      border-radius: 6px;
    }
    .heatmap-columns {
      transform: rotateX(180deg);
      display: flex;
      gap: 18px;
      width: max-content;
      padding: 0 2px 4px;
    }
    .season-column { width: 140px; flex-shrink: 0; }
    .season-header { padding-left: 23px; }
    .season-header h3 {
      font-size: 12px;
      font-weight: 600;
      color: #f8fafc;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin: 0;
    }
    .season-header p {
      font-size: 10px;
      color: #94a3b8;
      margin: 2px 0 6px;
    }
    .week-row {
      display: grid;
      grid-template-columns: 22px repeat(7, 16px);
      gap: 1px;
      margin-bottom: 1px;
      align-items: center;
    }
    .week-row.month-start {
      margin-top: 5px;
      padding-top: 3px;
      border-top: 1px solid rgba(251, 191, 36, 0.28);
    }
    .week-row.month-start:first-child {
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
    }
    .month-label {
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.02em;
      line-height: 1;
      color: #fbbf24;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .day-cell {
      position: relative;
      width: 16px;
      height: 16px;
      padding: 0;
      border: 0;
      border-radius: 2px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .day-cell.pad { cursor: default; background: transparent !important; }
    .day-cell.has-activity:hover,
    .day-cell:not(.empty):not(.pad):hover {
      filter: brightness(1.25);
    }
    .cell-marker-icon {
      position: absolute;
      top: 0;
      right: 0;
      width: 6px;
      height: 6px;
      object-fit: contain;
      pointer-events: none;
      opacity: 0.85;
    }
    .day-num {
      position: relative;
      z-index: 1;
      font-size: 8px;
      line-height: 1;
      color: #f8fafc;
      text-shadow: 0 0 2px rgba(0,0,0,0.9);
    }
    .legend {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      color: #94a3b8;
    }
  `]
})
export class ActivityHeatmapComponent implements OnInit, OnChanges {
  @Input() membershipIds: string[] = [];
  @Input() characterMeta: Record<string, HeatmapCharacterLookup> = {};
  @Output() navigateToDate = new EventEmitter<Date>();

  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  groupBy: 'season' | 'year' = 'season';
  platformFilter: string = 'all';
  characterFilter: string = 'all';
  yearFilter: string = 'all';
  seasonFilter: string = 'all';

  platforms: HeatmapPlatformOption[] = [];
  characters: HeatmapCharacterOption[] = [];
  years: number[] = [];
  yearOptions: HeatmapYearOption[] = [];
  seasonNames: string[] = [];
  seasonOptions: HeatmapSeasonOption[] = [];
  seasonColumns: SeasonColumn[] = [];
  grandTotalSeconds = 0;
  grandDaysPlayed = 0;
  viewSummary = 'All characters · All platforms · All years';

  private allActivities: any[] = [];
  private platformOptionSig = '';
  private characterOptionSig = '';
  private yearOptionSig = '';

  private readonly D1_SEASONS: NamedRange[] = [
    { name: 'Destiny', game: 'D1', start: new Date(2014, 8, 9), end: new Date(2014, 11, 9) },
    { name: 'The Dark Below', game: 'D1', start: new Date(2014, 11, 9), end: new Date(2015, 4, 19) },
    { name: 'House of Wolves', game: 'D1', start: new Date(2015, 4, 19), end: new Date(2015, 8, 15) },
    { name: 'The Taken King', game: 'D1', start: new Date(2015, 8, 15), end: new Date(2016, 8, 20) },
    { name: 'Rise of Iron', game: 'D1', start: new Date(2016, 8, 20), end: new Date(2017, 8, 6) },
  ];

  private readonly D2_SEASONS: NamedRange[] = [
    { name: 'Red War', game: 'D2', start: new Date(2017, 8, 6), end: new Date(2017, 11, 5) },
    { name: 'Curse of Osiris', game: 'D2', start: new Date(2017, 11, 5), end: new Date(2018, 4, 8) },
    { name: 'Warmind', game: 'D2', start: new Date(2018, 4, 8), end: new Date(2018, 8, 4) },
    { name: 'Season of the Outlaw', game: 'D2', start: new Date(2018, 8, 4), end: new Date(2018, 11, 4) },
    { name: 'Season of the Forge', game: 'D2', start: new Date(2018, 11, 4), end: new Date(2019, 2, 5) },
    { name: 'Season of the Drifter', game: 'D2', start: new Date(2019, 2, 5), end: new Date(2019, 5, 4) },
    { name: 'Season of Opulence', game: 'D2', start: new Date(2019, 5, 4), end: new Date(2019, 9, 1) },
    { name: 'Season of the Undying', game: 'D2', start: new Date(2019, 9, 1), end: new Date(2019, 11, 10) },
    { name: 'Season of Dawn', game: 'D2', start: new Date(2019, 11, 10), end: new Date(2020, 2, 10) },
    { name: 'Season of the Worthy', game: 'D2', start: new Date(2020, 2, 10), end: new Date(2020, 5, 9) },
    { name: 'Season of Arrivals', game: 'D2', start: new Date(2020, 5, 9), end: new Date(2020, 10, 10) },
    { name: 'Season of the Hunt', game: 'D2', start: new Date(2020, 10, 10), end: new Date(2021, 1, 9) },
    { name: 'Season of the Chosen', game: 'D2', start: new Date(2021, 1, 9), end: new Date(2021, 4, 11) },
    { name: 'Season of the Splicer', game: 'D2', start: new Date(2021, 4, 11), end: new Date(2021, 7, 24) },
    { name: 'Season of the Lost', game: 'D2', start: new Date(2021, 7, 24), end: new Date(2022, 1, 22) },
    { name: 'Season of the Risen', game: 'D2', start: new Date(2022, 1, 22), end: new Date(2022, 4, 24) },
    { name: 'Season of the Haunted', game: 'D2', start: new Date(2022, 4, 24), end: new Date(2022, 7, 23) },
    { name: 'Season of Plunder', game: 'D2', start: new Date(2022, 7, 23), end: new Date(2022, 11, 6) },
    { name: 'Season of the Seraph', game: 'D2', start: new Date(2022, 11, 6), end: new Date(2023, 1, 28) },
    { name: 'Season of Defiance', game: 'D2', start: new Date(2023, 1, 28), end: new Date(2023, 4, 23) },
    { name: 'Season of the Deep', game: 'D2', start: new Date(2023, 4, 23), end: new Date(2023, 7, 22) },
    { name: 'Season of the Witch', game: 'D2', start: new Date(2023, 7, 22), end: new Date(2023, 10, 28) },
    { name: 'Season of the Wish', game: 'D2', start: new Date(2023, 10, 28), end: new Date(2024, 5, 11) },
    { name: 'Episode: Echoes', game: 'D2', start: new Date(2024, 5, 11), end: new Date(2024, 9, 8) },
    { name: 'Episode: Revenant', game: 'D2', start: new Date(2024, 9, 8), end: new Date(2025, 1, 10) },
    { name: 'Episode: Heresy', game: 'D2', start: new Date(2025, 1, 10), end: new Date(2025, 6, 15) },
    { name: 'Season of Reclamation', game: 'D2', start: new Date(2025, 6, 15), end: new Date(2025, 11, 2) },
    { name: 'Season of the Lawless', game: 'D2', start: new Date(2025, 11, 2), end: new Date(2027, 0, 1) },
  ];

  private readonly SCRUBLAND_ICON = 'assets/icons/scrubland';
  private readonly DESTINY_ICON = 'assets/icons/destiny-icons';
  private readonly SEASON_ICON_BY_NAME: Record<string, string> = {
    'Red War': 'red-war.png',
    'Curse of Osiris': 'curse-of-osiris.png',
    'Warmind': 'warmind.png',
    'Season of the Outlaw': 'forsaken.png',
    'Season of the Forge': 'season-of-the-forge.png',
    'Season of the Drifter': 'season-of-the-drifter.png',
    'Season of Opulence': 'season-of-opulence.png',
    'Season of the Undying': 'season-of-the-undying.png',
    'Season of Dawn': 'season-of-dawn.png',
    'Season of the Worthy': 'season-of-the-worthy.png',
    'Season of Arrivals': 'season-of-arrivals.png',
    'Season of the Hunt': 'season-of-the-hunt.png',
    'Season of the Chosen': 'season-of-the-chosen.png',
    'Season of the Splicer': 'season-of-the-splicer.png',
    'Season of the Lost': 'season-of-the-lost.png',
    'Season of the Risen': 'witch-queen.png',
    'Season of the Haunted': 'season-of-the-haunted.png',
    'Season of Plunder': 'season-of-plunder.png',
    'Season of the Seraph': 'season-of-the-seraph.png',
    'Season of Defiance': 'lightfall.png',
    'Season of the Deep': 'season-of-the-deep.png',
    'Season of the Witch': 'season-of-the-witch.png',
    'Season of the Wish': 'season-of-the-wish.png',
    'Episode: Echoes': 'episode-echoes.png',
    'Episode: Revenant': 'episode-revenant.png',
    'Episode: Heresy': 'episode-heresy.png',
    'Season of Reclamation': 'edge-of-fate.png',
  };

  constructor(
    private activityDb: ActivityDbService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadActivities();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    const membershipChanged = changes['membershipIds'] && !changes['membershipIds'].firstChange;
    const metaChanged = changes['characterMeta'] && !changes['characterMeta'].firstChange;
    if (membershipChanged) {
      await this.loadActivities();
      return;
    }
    if (metaChanged) {
      await this.loadActivities();
    }
  }

  formatDaysHours = formatDaysHours;

  trackPlatform(_index: number, platform: HeatmapPlatformOption): number {
    return platform.type;
  }

  trackCharacter(_index: number, character: HeatmapCharacterOption): string {
    return character.key;
  }

  trackYear(_index: number, option: HeatmapYearOption): number {
    return option.year;
  }

  trackSeason(_index: number, option: HeatmapSeasonOption): string {
    return option.name;
  }

  onPlatformChange(): void {
    this.syncIncompatibleFilters();
    this.rebuild();
  }

  onCharacterChange(): void {
    this.rebuild();
  }

  onYearChange(): void {
    this.syncIncompatibleFilters();
    this.rebuild();
  }

  selectedPlatformLabel(): string {
    if (this.platformFilter === 'all') {
      return 'All platforms';
    }
    return this.platforms.find(platform => String(platform.type) === this.platformFilter)?.name || 'Selected platform';
  }

  selectedCharacterLabel(): string {
    if (this.characterFilter === 'all') {
      return 'All characters';
    }
    return this.characters.find(character => character.key === this.characterFilter)?.label || 'Selected character';
  }

  selectedYearLabel(): string {
    return this.yearFilter === 'all' ? 'All years' : this.yearFilter;
  }

  async loadActivities(): Promise<void> {
    this.allActivities = await this.activityDb.activities.toArray();
    this.rebuild();
    // Dexie/IndexedDB resolves outside the Angular zone, and this component
    // lives under an OnPush parent. Refresh the view so the first paint
    // shows data without waiting for a dropdown change.
    this.cdr.detectChanges();
  }

  private withCharacterMeta(activities: any[]): any[] {
    const meta = this.characterMeta || {};
    const typeByMembership = new Map<string, number>();
    for (const [key, info] of Object.entries(meta)) {
      const membershipId = key.split('|')[1];
      if (membershipId && info?.membershipType) {
        typeByMembership.set(membershipId, info.membershipType);
      }
    }
    return activities.map(activity => {
      const info = meta[characterKey(activity)] || meta[activity.characterId];
      const membershipType = activity.membershipType
        || info?.membershipType
        || typeByMembership.get(activity.membershipId);
      const hasClass = activity.characterClass && activity.characterClass !== 'Unknown';
      if (!info && membershipType == null) {
        return activity;
      }
      return {
        ...activity,
        characterClass: hasClass ? activity.characterClass : (info?.className || activity.characterClass),
        membershipType
      };
    });
  }

  rebuild(): void {
    const decorated = this.withCharacterMeta(this.allActivities);
    const membershipIds = this.membershipIds?.length ? this.membershipIds : null;
    const accountScoped = filterHeatmapActivities(decorated, { membershipIds });
    this.ensureFilterOptions(accountScoped);
    this.dropStaleSelections();

    const yearNum = this.yearFilter === 'all' ? null : Number(this.yearFilter);
    const platformType = this.platformFilter === 'all' ? null : Number(this.platformFilter);
    const characterKeyFilter = this.characterFilter === 'all' ? null : this.characterFilter;
    this.applyOptionAvailability(accountScoped, yearNum, platformType, characterKeyFilter);

    const scoped = filterHeatmapActivities(accountScoped, {
      membershipType: platformType,
      characterKey: characterKeyFilter,
      year: yearNum
    });

    const activityMap = this.buildActivityMap(scoped);

    if (this.groupBy === 'year') {
      this.seasonNames = [];
      this.seasonOptions = [];
      this.seasonColumns = this.years
        .filter(year => yearNum == null || year === yearNum)
        .map(year => {
          const clipped = clipRangeToYear(new Date(year, 0, 1), new Date(year, 11, 31), yearNum);
          if (!clipped) {
            return null;
          }
          return this.buildColumn(String(year), 'D2', clipped.start, clipped.end, activityMap);
        })
        .filter((col): col is SeasonColumn => !!col && col.totalActivities > 0);
    } else {
      const ranges = [...this.D1_SEASONS, ...this.D2_SEASONS]
        .filter(range => yearNum == null || seasonOverlapsYear(range.start, range.end, yearNum));
      this.seasonNames = ranges.map(range => range.name);
      this.seasonOptions = ranges.map(range => {
        const clipped = clipRangeToYear(range.start, range.end, yearNum);
        if (!clipped) {
          return { name: range.name, disabled: true };
        }
        const column = this.buildColumn(range.name, range.game, clipped.start, clipped.end, activityMap);
        return { name: range.name, disabled: column.totalActivities === 0 };
      });
      if (this.seasonFilter !== 'all' && !this.seasonNames.includes(this.seasonFilter)) {
        this.seasonFilter = 'all';
      }
      this.seasonColumns = ranges
        .filter(range => this.seasonFilter === 'all' || range.name === this.seasonFilter)
        .map(range => {
          const clipped = clipRangeToYear(range.start, range.end, yearNum);
          if (!clipped) {
            return null;
          }
          return this.buildColumn(range.name, range.game, clipped.start, clipped.end, activityMap);
        })
        .filter((col): col is SeasonColumn => !!col && col.totalActivities > 0);
    }

    this.grandTotalSeconds = this.seasonColumns.reduce((sum, col) => sum + col.totalTime, 0);
    this.grandDaysPlayed = this.seasonColumns.reduce((sum, col) => sum + col.daysPlayed, 0);
    this.viewSummary = this.buildViewSummary();
  }

  private ensureFilterOptions(accountScoped: any[]): void {
    const platforms = uniquePlatforms(accountScoped);
    const characters = uniqueCharacters(accountScoped, this.characterMeta);
    const years = uniqueYears(accountScoped);
    const platformSig = platforms.map(platform => platform.type).join(',');
    const characterSig = [...characters.map(character => character.key)].sort().join(',');
    const yearSig = years.join(',');

    if (platformSig !== this.platformOptionSig) {
      this.platformOptionSig = platformSig;
      this.platforms = platforms;
    } else {
      const platformsByType = new Map(platforms.map(platform => [platform.type, platform]));
      for (const existing of this.platforms) {
        const fresh = platformsByType.get(existing.type);
        if (fresh) {
          existing.name = fresh.name;
        }
      }
    }

    if (characterSig !== this.characterOptionSig) {
      this.characterOptionSig = characterSig;
      this.characters = characters;
    } else {
      const charactersByKey = new Map(characters.map(character => [character.key, character]));
      for (const existing of this.characters) {
        const fresh = charactersByKey.get(existing.key);
        if (fresh) {
          existing.label = fresh.label;
          existing.membershipType = fresh.membershipType;
        }
      }
    }

    if (yearSig !== this.yearOptionSig) {
      this.yearOptionSig = yearSig;
      this.years = years;
      this.yearOptions = years.map(year => ({ year, disabled: false }));
    }
  }

  private dropStaleSelections(): void {
    if (this.platformFilter !== 'all' && !this.platforms.some(platform => String(platform.type) === this.platformFilter)) {
      this.platformFilter = 'all';
    }
    if (this.characterFilter !== 'all' && !this.characters.some(character => character.key === this.characterFilter)) {
      this.characterFilter = 'all';
    }
    if (this.yearFilter !== 'all' && !this.years.some(year => String(year) === this.yearFilter)) {
      this.yearFilter = 'all';
    }
  }

  private applyOptionAvailability(
    accountScoped: any[],
    yearNum: number | null,
    platformType: number | null,
    characterKeyFilter: string | null
  ): void {
    for (const platform of this.platforms) {
      platform.disabled = !heatmapHasActivity(accountScoped, {
        membershipType: platform.type,
        characterKey: characterKeyFilter,
        year: yearNum
      });
    }
    for (const character of this.characters) {
      character.disabled = !heatmapHasActivity(accountScoped, {
        membershipType: platformType,
        characterKey: character.key,
        year: yearNum
      });
    }
    for (const option of this.yearOptions) {
      option.disabled = !heatmapHasActivity(accountScoped, {
        membershipType: platformType,
        characterKey: characterKeyFilter,
        year: option.year
      });
    }
  }

  private syncIncompatibleFilters(): void {
    const decorated = this.withCharacterMeta(this.allActivities);
    const membershipIds = this.membershipIds?.length ? this.membershipIds : null;
    const accountScoped = filterHeatmapActivities(decorated, { membershipIds });
    const yearNum = this.yearFilter === 'all' ? null : Number(this.yearFilter);
    let platformType = this.platformFilter === 'all' ? null : Number(this.platformFilter);

    if (platformType != null && !heatmapHasActivity(accountScoped, { membershipType: platformType, year: yearNum })) {
      this.platformFilter = 'all';
      platformType = null;
    }
    if (
      this.characterFilter !== 'all' &&
      !heatmapHasActivity(accountScoped, {
        membershipType: platformType,
        characterKey: this.characterFilter,
        year: yearNum
      })
    ) {
      this.characterFilter = 'all';
    }
  }

  private buildViewSummary(): string {
    const parts: string[] = [];
    if (this.characterFilter !== 'all') {
      parts.push(this.selectedCharacterLabel());
    } else {
      parts.push('All characters');
      parts.push(this.selectedPlatformLabel());
    }
    parts.push(this.selectedYearLabel());
    if (this.groupBy === 'season' && this.seasonFilter !== 'all') {
      parts.push(this.seasonFilter);
    }
    return parts.join(' · ');
  }

  getIntensityColor(intensity: number): string {
    if (intensity === 0) {
      return 'rgba(15, 23, 42, 0.55)';
    }
    const hue = 25 + (intensity * 15);
    const saturation = 85 + (intensity * 10);
    const lightness = 32 + (intensity * 28);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  getCellTitle(cell: DayCell): string {
    if (cell.day === 0) {
      return '';
    }
    const lines = [cell.date.toLocaleDateString()];
    if (cell.marker) {
      lines.push(cell.marker.label);
    }
    if (!cell.isEmpty) {
      lines.push(this.formatTime(cell.totalSeconds), `${cell.activities} activities`);
    }
    return lines.join('\n');
  }

  onDayClick(cell: DayCell): void {
    if (cell.day > 0) {
      this.navigateToDate.emit(cell.date);
    }
  }

  private buildActivityMap(activities: { period?: string; values?: { timePlayedSeconds?: { basic?: { value?: number } } } }[]): Map<string, { count: number; seconds: number }> {
    const map = new Map<string, { count: number; seconds: number }>();
    for (const activity of activities) {
      if (!activity.period) {
        continue;
      }
      const date = new Date(activity.period);
      const key = this.dayKey(date);
      const seconds = activitySeconds(activity);
      const existing = map.get(key) || { count: 0, seconds: 0 };
      map.set(key, { count: existing.count + 1, seconds: existing.seconds + seconds });
    }
    return map;
  }

  private buildColumn(
    name: string,
    game: 'D1' | 'D2',
    start: Date,
    end: Date,
    activityMap: Map<string, { count: number; seconds: number }>
  ): SeasonColumn {
    let maxSeconds = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const data = activityMap.get(this.dayKey(d));
      if (data && data.seconds > maxSeconds) {
        maxSeconds = data.seconds;
      }
    }

    const markersByDay = new Map<string, ContentMarker>();
    for (const marker of this.getContentMarkers(game, start, end, name)) {
      const key = this.dayKey(marker.date);
      const existing = markersByDay.get(key);
      if (!existing || this.markerPriority(marker.type) > this.markerPriority(existing.type)) {
        markersByDay.set(key, marker);
      }
    }

    const weeks: DayCell[][] = [];
    let currentWeek: DayCell[] = [];
    let totalTime = 0;
    let totalActivities = 0;
    let daysPlayed = 0;

    for (let i = 0; i < start.getDay(); i++) {
      currentWeek.push(this.padCell());
    }

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = this.dayKey(d);
      const data = activityMap.get(key);
      const seconds = data?.seconds || 0;
      const count = data?.count || 0;
      if (count > 0) {
        daysPlayed += 1;
      }
      currentWeek.push({
        day: d.getDate(),
        date: new Date(d),
        intensity: maxSeconds > 0 ? seconds / maxSeconds : 0,
        activities: count,
        totalSeconds: seconds,
        isEmpty: count === 0,
        marker: markersByDay.get(key)
      });
      totalTime += seconds;
      totalActivities += count;
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(this.padCell());
      }
      weeks.push(currentWeek);
    }

    const monthLabels = weekMonthLabels(weeks);
    const labeledWeeks: HeatmapWeek[] = weeks.map((cells, index) => ({
      cells,
      monthLabel: monthLabels[index]
    }));

    return { name, game, startDate: start, endDate: end, weeks: labeledWeeks, totalTime, daysPlayed, totalActivities };
  }

  private padCell(): DayCell {
    return { day: 0, date: new Date(0), intensity: 0, activities: 0, totalSeconds: 0, isEmpty: true };
  }

  private getContentMarkers(game: 'D1' | 'D2', start: Date, end: Date, seasonName: string): ContentMarker[] {
    const markers: ContentMarker[] = [{
      date: start,
      label: seasonName,
      type: 'season-start',
      iconUrl: this.getSeasonIconUrl(seasonName)
    }];
    const dungeonNames = new Set([
      'The Shattered Throne', 'Pit of Heresy', 'Prophecy', 'Grasp of Avarice',
      'Duality', 'Spire of the Watcher', 'Ghosts of the Deep', "Warlord's Ruin",
      "Vesper's Host", 'Sundered Doctrine'
    ]);
    for (const [name, dateStr] of Object.entries(ACTIVITY_RELEASE_DATES)) {
      const releaseDate = this.parseLocalDate(dateStr);
      if (releaseDate < start || releaseDate > end) {
        continue;
      }
      const type: 'raid' | 'dungeon' = dungeonNames.has(name) ? 'dungeon' : 'raid';
      const isD1Content = releaseDate.getFullYear() < 2017 ||
        (releaseDate.getFullYear() === 2017 && releaseDate.getMonth() < 8);
      if ((game === 'D1' && isD1Content) || (game === 'D2' && !isD1Content)) {
        markers.push({
          date: releaseDate,
          label: name,
          type,
          iconUrl: type === 'dungeon'
            ? `${this.SCRUBLAND_ICON}/dungeon.png`
            : `${this.SCRUBLAND_ICON}/raid.png`
        });
      }
    }
    return markers;
  }

  private getSeasonIconUrl(seasonName: string): string {
    const file = this.SEASON_ICON_BY_NAME[seasonName];
    return file ? `${this.SCRUBLAND_ICON}/${file}` : `${this.DESTINY_ICON}/season.svg`;
  }

  private parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  private markerPriority(type: ContentMarker['type']): number {
    switch (type) {
      case 'raid': return 4;
      case 'dungeon': return 3;
      case 'expansion': return 2;
      default: return 1;
    }
  }

  private formatTime(seconds: number): string {
    if (!seconds || seconds <= 0) {
      return '0m';
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
}
