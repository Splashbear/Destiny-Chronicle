import { Injectable } from '@angular/core';
import { ActivityDbService } from './activity-db.service';
import { ActivityHistory } from '../models/activity-history.model';
import { TitleService, TitleItem } from './title.service';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { DestinyManifestService } from './destiny-manifest.service';

export interface ExportRequest {
  from: Date;
  to: Date;
  types: number[];           // Bungie mode ids (empty -> all)
  platforms: number[];       // Bungie membershipType ids (empty -> all)
  includeSummaries: boolean;
  includeFirsts: boolean;
  includeActivities: boolean;
}

export interface ExportPayload {
  activities?: ActivityHistory[];
}

export interface ExportOptions {
  from?: Date;
  to?: Date;
  includeActivities?: boolean;
  includeFirsts?: boolean;
  includeTitles?: boolean;
  includeSummary?: boolean;
  /** Include Activity Breakdown sheets (summary + detail) when available in context. */
  includeBreakdown?: boolean;
  allDates?: boolean;
  showIconsInline?: boolean; // New option for inline icons
}

export interface ExportContext {
  selectedPlayers: any[];
  activityDb: any;
  manifestService: any;
  characters: any;
  getPlayerKey: (player: any) => string;
  titleService: TitleService;
  /** Optional Activity Breakdown data from the current view (used when includeBreakdown is true). */
  breakdownSummary?: { label: string; runs: number; clears: number; timeSeconds: number; clearRate: number }[];
  breakdownGroups?: { label: string; rows: { baseName: string; variantName: string; game: string; runs: number; clears: number; fails: number; timeSeconds: number }[] }[];
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  constructor(
    private activityDb: ActivityDbService,
    private titleService: TitleService,
    private manifest: DestinyManifestService
  ) {}

  /**
   * Builds an object containing whichever slices were requested.
   */
  async buildPayload(req: ExportRequest): Promise<ExportPayload> {
    const payload: ExportPayload = {};

    // For the first delivery we only export activities; summaries & firsts can be
    // added once ActivityDbService exposes aggregation helpers.

    if (req.includeActivities) {
      payload.activities = await this.activityDb.activities
        .filter(act => {
          const mode = (act as any).activityDetails?.mode;
          const tOk = !req.types.length || req.types.includes(mode);
          const pOk =
            !req.platforms.length ||
            (act as any).membershipType === undefined ||
            req.platforms.includes((act as any).membershipType);
          const date = new Date((act as any).period);
          const dOk = date >= req.from && date <= req.to;
          return tOk && pOk && dOk;
        })
        .toArray();
    }

    return payload;
  }

  /**
   * Generates an .xlsx workbook and triggers a browser download.
   */
  async downloadExcel(payload: ExportPayload) {
    const [XLSX, FileSaver] = await Promise.all([
      import('xlsx'),
      import('file-saver')
    ]);

    const wb = XLSX.utils.book_new();

    if (payload.activities?.length) {
      const ws = XLSX.utils.json_to_sheet(payload.activities);
      XLSX.utils.book_append_sheet(wb, ws, 'Activities');
    }

    // Prevent empty-file downloads – abort if workbook has no sheets.
    if (wb.SheetNames.length === 0) {
      throw new Error('Workbook is empty');
    }

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const fileName = `destiny-chronicle-export_${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.xlsx`;
    FileSaver.saveAs(
      new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }),
      fileName
    );
  }

  /**
   * Generates a CSV string for the given activities. Columns are chosen to be
   * Google-Sheets-friendly (comma-separated, RFC4180). Date formatted as ISO.
   */
  generateCsv(activities: ActivityHistory[]): string {
    const header = [
      'Period',
      'Game',
      'Platform',
      'Activity Name',
      'Type',
      'Duration (s)',
      'Kills',
      'Deaths',
      'Completed',
      'InstanceId'
    ];
    const rows = activities.map(a => {
      const isD1 = (a as any).game === 'D1';
      const name = this.manifest.getActivityName(a.activityDetails?.referenceId, isD1) || 'Unknown Activity';
      const type = this.manifest.getActivityType(a.activityDetails?.referenceId, a.activityDetails?.mode) || '';
      const duration = (a as any)?.values?.timePlayedSeconds?.basic?.value ?? '';
      const kills = (a as any)?.values?.kills?.basic?.value ?? '';
      const deaths = (a as any)?.values?.deaths?.basic?.value ?? '';
      const completed = (a as any)?.values?.completed?.basic?.value ?? '';
      return [
        a.period,
        (a as any).game || 'D2',
        (a as any).platform || '',
        name,
        type,
        duration,
        kills,
        deaths,
        completed,
        a.activityDetails?.instanceId || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    return [header.join(','), ...rows].join('\n');
  }

  downloadCsv(filename: string, csv: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Utility for formatting seconds as "Hh MMm" for human-readable sheets.
   * Mirrors the helper used in PlayerSearchComponent.
   */
  private formatSecondsToHoursMinutes(totalSeconds: number | undefined | null): string {
    const seconds = totalSeconds ?? 0;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${hours}h ${pad(minutes)}m`;
  }

  /**
   * Multi-sheet export for activities, firsts, titles/seals, and account summary.
   * Sheets are Google Sheets compatible (no embedded images, icon URLs only).
   */
  async exportMultiSheet(options: ExportOptions, context: ExportContext): Promise<void> {
    // Use the passed-in context for all data gathering
    const {
      selectedPlayers,
      activityDb,
      manifestService,
      characters,
      getPlayerKey,
      breakdownSummary,
      breakdownGroups,
    } = context;
    // 1. Gather data for each requested sheet
    const sheets: { [name: string]: any[] } = {};

    // Metadata / context sheet so exports are self-describing for long-term archiving
    const exportedAt = new Date();
    const meta: any[] = [];
    meta.push({ Key: 'ExportedAtUtc', Value: exportedAt.toISOString() });
    meta.push({
      Key: 'DateRange',
      Value: options.allDates
        ? 'All Activities'
        : options.from
          ? `Selected Date: ${new Date(options.from).toISOString()}`
          : 'Unknown'
    });
    meta.push({ Key: 'IncludeActivities', Value: options.includeActivities !== false });
    meta.push({ Key: 'IncludeFirsts', Value: !!options.includeFirsts });
    meta.push({ Key: 'IncludeTitles', Value: !!options.includeTitles });
    meta.push({ Key: 'IncludeSummary', Value: !!options.includeSummary });
    meta.push({ Key: 'IncludeBreakdown', Value: !!options.includeBreakdown });

    // List the players included in this export with stable identifiers
    meta.push({ Section: 'Players', Note: 'Each row below describes a selected account' });
    for (const player of selectedPlayers) {
      meta.push({
        Item: 'Player',
        DisplayName: player.displayName,
        MembershipId: player.membershipId,
        MembershipType: player.membershipType,
        Game: player.game,
        Platform: player.platform,
      });
    }
    sheets['Export Info'] = meta;

    // Cache of titles per membership so we don't re-hit Bungie unnecessarily
    const titleCache: Map<string, TitleItem[]> = new Map();

    if (options.includeActivities === undefined || options.includeActivities) {
      const activities: any[] = [];
      if (options.allDates) {
        for (const player of selectedPlayers) {
          // Use existing optimized membership fetch
          const playerActivities = await activityDb.getAllActivitiesForMembershipOptimized(player.membershipId);
          for (const activity of playerActivities) {
            const period = activity.period;
            const d = period ? new Date(period) : null;
            const year = d ? d.getUTCFullYear() : '';
            const month = d ? d.getUTCMonth() + 1 : '';
            const day = d ? d.getUTCDate() : '';
            const duration = (activity as any)?.values?.timePlayedSeconds?.basic?.value ?? '';
            const kills = (activity as any)?.values?.kills?.basic?.value ?? '';
            const deaths = (activity as any)?.values?.deaths?.basic?.value ?? '';
            const assists = (activity as any)?.values?.assists?.basic?.value ?? '';
            const completed = (activity as any)?.values?.completed?.basic?.value ?? '';
            const game = (activity as any).game || player.game || 'D2';
            const membershipId = (activity as any).membershipId || player.membershipId;
            const membershipType = (activity as any).membershipType ?? player.membershipType ?? '';
            const characterId = (activity as any).characterId || '';

            activities.push({
              Player: player.displayName,
              MembershipId: membershipId,
              MembershipType: membershipType,
              Game: game,
              Platform: player.platform,
              CharacterId: characterId,
              Date: period,
              Year: year,
              Month: month,
              Day: day,
              Name: manifestService.getActivityName(activity.activityDetails?.referenceId, game === 'D1'),
              Type: manifestService.getActivityType(activity.activityDetails?.referenceId, activity.activityDetails?.mode),
              Mode: activity.activityDetails?.mode,
              Hash: activity.activityDetails?.referenceId,
              DurationSeconds: duration,
              Kills: kills,
              Deaths: deaths,
              Assists: assists,
              Completed: completed,
              PGCR: activity.activityDetails?.instanceId ? `https://www.bungie.net/en/PGCR/${activity.activityDetails.instanceId}` : '',
            });
          }
        }
      } else {
        // Selected date export: gather activities for each character on that date
        if (!options.from) {
          console.error('[ExportService] No date provided in options.from. Skipping export for selected date.');
          return;
        }
        const date = new Date(options.from);
        if (isNaN(date.getTime())) {
          console.error('[ExportService] Invalid date in options.from:', options.from);
          return;
        }
        const month = date.getUTCMonth() + 1;
        const day = date.getUTCDate();
        console.log('[ExportService] Exporting for date:', { from: options.from, month, day });
        for (const player of selectedPlayers) {
          // Gather per-membership activities for the date across all characters
          const acts = await activityDb.getActivitiesByDateForMembership(player.membershipId, month, day);
          for (const activity of acts) {
            const period = activity.period;
            const d = period ? new Date(period) : null;
            const year = d ? d.getUTCFullYear() : '';
            const duration = (activity as any)?.values?.timePlayedSeconds?.basic?.value ?? '';
            const kills = (activity as any)?.values?.kills?.basic?.value ?? '';
            const deaths = (activity as any)?.values?.deaths?.basic?.value ?? '';
            const assists = (activity as any)?.values?.assists?.basic?.value ?? '';
            const completed = (activity as any)?.values?.completed?.basic?.value ?? '';
            const game = (activity as any).game || player.game || 'D2';
            const membershipId = (activity as any).membershipId || player.membershipId;
            const membershipType = (activity as any).membershipType ?? player.membershipType ?? '';
            const characterId = (activity as any).characterId || '';

            activities.push({
              Player: player.displayName,
              MembershipId: membershipId,
              MembershipType: membershipType,
              Game: game,
              Platform: player.platform,
              CharacterId: characterId,
              Date: period,
              Year: year,
              Month: month,
              Day: day,
              Name: manifestService.getActivityName(activity.activityDetails?.referenceId, game === 'D1'),
              Type: manifestService.getActivityType(activity.activityDetails?.referenceId, activity.activityDetails?.mode),
              Mode: activity.activityDetails?.mode,
              Hash: activity.activityDetails?.referenceId,
              DurationSeconds: duration,
              Kills: kills,
              Deaths: deaths,
              Assists: assists,
              Completed: completed,
              PGCR: activity.activityDetails?.instanceId ? `https://www.bungie.net/en/PGCR/${activity.activityDetails.instanceId}` : '',
            });
          }
        }
      }
      sheets['Activities'] = activities;
    }

    if (options.includeFirsts) {
      const firsts: any[] = [];
      for (const player of selectedPlayers) {
        const charObjs = (characters && getPlayerKey) ? (characters[getPlayerKey(player)] || []) : [];
        const charIds = charObjs.map((c: any) => c.characterId).filter((id: any) => !!id);
        for (const charId of charIds) {
          // activityDb.getFirstCompletions returns an object with a firstCompletions array
          const result = await activityDb.getFirstCompletions(player.membershipId, charId, player.game);
          const completions: ActivityFirstCompletion[] = result?.firstCompletions || [];

          // Mirror the on-screen logic: choose the earliest completion per "family" (title/name)
          const byFamily: { [family: string]: ActivityFirstCompletion } = {};
          for (const completion of completions) {
            if (completion.completed !== 1) continue; // only actual completions
            const family = completion.name;
            const existing = byFamily[family];
            if (!existing || new Date(completion.completionDate) < new Date(existing.completionDate)) {
              byFamily[family] = completion;
            }
          }

          for (const family of Object.keys(byFamily)) {
            const first = byFamily[family];
            if (!first) continue;
            firsts.push({
              Player: player.displayName,
              MembershipId: first.membershipId,
              MembershipType: first.membershipType ?? '',
              Game: first.game,
              Platform: player.platform,
              CharacterId: first.characterId,
              Family: family,
              Name: manifestService.getActivityName(first.referenceId, first.game === 'D1'),
              Type: manifestService.getActivityType(first.referenceId, first.mode),
              Date: first.completionDate,
              Hash: first.referenceId,
              Mode: first.mode,
              InstanceId: first.instanceId,
              IsSolo: first.isSolo ?? false,
              IsSoloFlawless: first.isSoloFlawless ?? false,
              IsFlawless: first.isFlawless ?? false,
              FireteamSize: first.fireteamSize ?? '',
              PGCR: first.instanceId ? `https://www.bungie.net/en/PGCR/${first.instanceId}` : '',
            });
          }
        }
      }
      sheets['Guardian Firsts'] = firsts;
    }

    if (options.includeTitles) {
      const titles: any[] = [];
      for (const player of selectedPlayers) {
        const cacheKey = `${player.game}|${player.membershipId}`;
        // Use TitleService to get titles for the player (with cache)
        let titlesList = titleCache.get(cacheKey);
        if (!titlesList) {
          titlesList = await this.titleService.getPlayerTitles(player);
          titleCache.set(cacheKey, titlesList);
        }
        for (const title of titlesList) {
          const iconUrl = title.icon; // Use icon property from TitleItem
          const row: any = {
            Player: player.displayName,
            MembershipId: player.membershipId,
            MembershipType: player.membershipType,
            Game: player.game,
            Platform: player.platform,
            Name: title.name,
            Completed: !!title.completed,
            CompletedLabel: title.completed ? 'Yes' : 'No',
            Legacy: !!title.legacy,
            Gilded: !!title.isGilded,
            TimesGilded: title.timesGilded ?? 0,
            Hash: title.hash,
            NormalizedName: title.normalized,
            IconURL: iconUrl
          };
          if (options.showIconsInline) {
            row['Icon (Google Sheets)'] = iconUrl ? `=IMAGE("${iconUrl}")` : '';
          }
          titles.push(row);
        }
      }
      sheets['Titles & Seals'] = titles;
    }

    if (options.includeSummary) {
      const summary: any[] = [];
      for (const player of selectedPlayers) {
        // Assume activityDb.getAccountSummary returns stats for the player
        const stats = await activityDb.getAccountSummary(player.membershipId);
        // Derive total seals from Bungie titles (cached if possible)
        const cacheKey = `${player.game}|${player.membershipId}`;
        let titlesList = titleCache.get(cacheKey);
        if (!titlesList) {
          titlesList = await this.titleService.getPlayerTitles(player);
          titleCache.set(cacheKey, titlesList);
        }
        const totalSeals = titlesList.filter(t => t.completed).length;
        summary.push({
          Player: player.displayName,
          MembershipId: player.membershipId,
          MembershipType: player.membershipType,
          Game: player.game,
          Platform: player.platform,
          TotalTimeSeconds: stats.totalTime,
          TotalActivities: stats.totalActivities,
          TotalSeals: totalSeals,
          TotalFirsts: stats.totalFirsts,
        });
      }
      sheets['Account Summary'] = summary;
    }

    // Activity Breakdown (optional) – requires both option flag and context data
    if (options.includeBreakdown && breakdownSummary && breakdownSummary.length && breakdownGroups && breakdownGroups.length) {
      sheets['Breakdown Summary'] = breakdownSummary.map(c => ({
        'Activity Type': c.label,
        'Total Time (h:m)': this.formatSecondsToHoursMinutes(c.timeSeconds),
        'Time (seconds)': c.timeSeconds,
        'Runs': c.runs,
        'Clears': c.clears,
        'Clear %': c.clearRate.toFixed(1) + '%',
      }));

      const detailRows: any[] = [];
      for (const g of breakdownGroups) {
        for (const row of g.rows) {
          detailRows.push({
            'Group': g.label,
            'Activity': row.baseName,
            'Variant': row.variantName || '',
            'Game': row.game,
            'Runs': row.runs,
            'Clears': row.clears,
            'Fails': row.fails,
            'Time (h:m)': this.formatSecondsToHoursMinutes(row.timeSeconds),
            'Time (seconds)': row.timeSeconds,
          });
        }
      }
      sheets['Breakdown Detail'] = detailRows;
    }

    // 2. Generate the workbook
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    let hasData = false;
    for (const [sheetName, data] of Object.entries(sheets)) {
      if (data.length > 0) {
        hasData = true;
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
    }
    if (!hasData) {
      // Fallback: export all activities as CSV so user still gets a file
      const allActs = await this.activityDb.activities.toArray();
      const csv = this.generateCsv(allActs);
      this.downloadCsv('destiny-chronicle-export.csv', csv);
      return;
    }
    const filename = `destiny-chronicle-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  /**
   * Export Activity Breakdown (summary cards + detailed tables) to Excel.
   * Compatible with Excel and Google Sheets.
   */
  async exportActivityBreakdownToExcel(payload: {
    summaryCards: { label: string; runs: number; clears: number; timeSeconds: number; clearRate: number }[];
    groups: { label: string; rows: { baseName: string; variantName: string; game: string; runs: number; clears: number; fails: number; timeSeconds: number }[] }[];
    formatTime: (seconds: number) => string;
  }): Promise<void> {
    const { summaryCards, groups, formatTime } = payload;
    const sheets: { [name: string]: any[] } = {};

    // Summary sheet: one row per activity type
    sheets['Breakdown Summary'] = summaryCards.map(c => ({
      'Activity Type': c.label,
      'Total Time (h:m)': formatTime(c.timeSeconds),
      'Time (seconds)': c.timeSeconds,
      'Runs': c.runs,
      'Clears': c.clears,
      'Clear %': c.clearRate.toFixed(1) + '%',
    }));

    // Detail sheet: all rows from all groups, with group label
    const detailRows: any[] = [];
    for (const g of groups) {
      for (const row of g.rows) {
        detailRows.push({
          'Group': g.label,
          'Activity': row.baseName,
          'Variant': row.variantName || '',
          'Game': row.game,
          'Runs': row.runs,
          'Clears': row.clears,
          'Fails': row.fails,
          'Time (h:m)': formatTime(row.timeSeconds),
          'Time (seconds)': row.timeSeconds,
        });
      }
    }
    sheets['Breakdown Detail'] = detailRows;

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    for (const [sheetName, data] of Object.entries(sheets)) {
      if (data.length > 0) {
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
    }
    const filename = `destiny-chronicle-breakdown-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  }
} 