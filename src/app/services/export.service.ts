import { Injectable } from '@angular/core';
import { ActivityDbService } from './activity-db.service';
import { ActivityHistory } from '../models/activity-history.model';
import * as FileSaver from 'file-saver';
import * as XLSX from 'xlsx';
import { TitleService } from './title.service';
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
  downloadExcel(payload: ExportPayload) {
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
    FileSaver.saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
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
   * Multi-sheet export for activities, firsts, titles/seals, and account summary.
   * Sheets are Google Sheets compatible (no embedded images, icon URLs only).
   */
  async exportMultiSheet(options: ExportOptions, context: ExportContext): Promise<void> {
    // Use the passed-in context for all data gathering
    const { selectedPlayers, activityDb, manifestService, characters, getPlayerKey } = context;
    // 1. Gather data for each requested sheet
    const sheets: { [name: string]: any[] } = {};

    if (options.includeActivities === undefined || options.includeActivities) {
      const activities: any[] = [];
      if (options.allDates) {
        for (const player of selectedPlayers) {
          // Use existing optimized membership fetch
          const playerActivities = await activityDb.getAllActivitiesForMembershipOptimized(player.membershipId);
          for (const activity of playerActivities) {
            activities.push({
              Player: player.displayName,
              Platform: player.platform,
              Date: activity.period,
              Name: manifestService.getActivityName(activity.activityDetails?.referenceId, player.game === 'D1'),
              Type: manifestService.getActivityType(activity.activityDetails?.referenceId, activity.activityDetails?.mode),
              Hash: activity.activityDetails?.referenceId,
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
            activities.push({
              Player: player.displayName,
              Platform: player.platform,
              Date: activity.period,
              Name: manifestService.getActivityName(activity.activityDetails?.referenceId, player.game === 'D1'),
              Type: manifestService.getActivityType(activity.activityDetails?.referenceId, activity.activityDetails?.mode),
              Hash: activity.activityDetails?.referenceId,
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
          // Assume activityDb.getFirstCompletions returns GuardianFirsts for this character
          const firstsData = await activityDb.getFirstCompletions(player.membershipId, charId, player.game);
          for (const family in firstsData) {
            const first = firstsData[family];
            if (!first) continue;
            firsts.push({
              Player: player.displayName,
              Platform: player.platform,
              Family: family,
              Name: manifestService.getActivityName(first.activityHash, player.game === 'D1'),
              Type: manifestService.getActivityType(first.activityHash, first.mode),
              Date: first.completionDate,
              Hash: first.activityHash,
              PGCR: first.pgcrId ? `https://www.bungie.net/en/PGCR/${first.pgcrId}` : '',
            });
          }
        }
      }
      sheets['Guardian Firsts'] = firsts;
    }

    if (options.includeTitles) {
      const titles: any[] = [];
      for (const player of selectedPlayers) {
        // Use TitleService to get titles for the player
        const titlesList = await this.titleService.getPlayerTitles(player);
        for (const title of titlesList) {
          const iconUrl = title.icon; // Use icon property from TitleItem
          const row: any = {
            Player: player.displayName,
            Platform: player.platform,
            Name: title.name,
            CompletionDate: title.completed ? 'Yes' : 'No',
            Gilded: title.isGilded,
            Hash: title.hash,
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
        summary.push({
          Player: player.displayName,
          Platform: player.platform,
          TotalTime: stats.totalTime,
          TotalActivities: stats.totalActivities,
          TotalSeals: stats.totalSeals,
          TotalFirsts: stats.totalFirsts,
        });
      }
      sheets['Account Summary'] = summary;
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
} 