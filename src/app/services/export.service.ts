import { Injectable } from '@angular/core';
import { ActivityDbService } from './activity-db.service';
import { ActivityHistory } from '../models/activity-history.model';
import * as FileSaver from 'file-saver';
import * as XLSX from 'xlsx';

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

@Injectable({ providedIn: 'root' })
export class ExportService {
  constructor(private activityDb: ActivityDbService) {}

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
} 