import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { D1PGCRDetailsComponent } from '../components/d1-pgcr-details/d1-pgcr-details.component';
import { PgcrLiteComponent, PgcrLiteDialogData } from '../components/pgcr-lite/pgcr-lite.component';
import { ActivityHistory } from '../models/activity-history.model';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';

@Injectable({
  providedIn: 'root'
})
export class PGCRModalService {
  constructor(private dialog: MatDialog) {}

  openD1PGCRModal(pgcr: any): void {
    this.dialog.open(D1PGCRDetailsComponent, {
      data: { pgcr },
      maxWidth: '90vw',
      maxHeight: '90vh',
      width: '800px',
      panelClass: 'pgcr-modal'
    });
  }

  openPgcrLite(data: PgcrLiteDialogData): void {
    this.dialog.open(PgcrLiteComponent, {
      data,
      maxWidth: '95vw',
      width: '420px',
      panelClass: 'pgcr-modal'
    });
  }

  openPgcrLiteFromActivity(activity: ActivityHistory, isD1: boolean, activityLabel?: string): void {
    const instanceId = activity.activityDetails?.instanceId;
    if (!instanceId) {
      return;
    }
    const period = activity.period ?? (activity as { completionDate?: string }).completionDate;
    const row = activity as ActivityHistory & { membershipId?: string; displayName?: string };
    this.openPgcrLite({
      instanceId: String(instanceId),
      isD1,
      membershipId: row.membershipId ? String(row.membershipId) : undefined,
      activityLabel,
      period: period ? String(period) : undefined,
      preferredDisplayName: row.displayName?.trim() || undefined,
    });
  }

  openPgcrLiteFromFirst(first: ActivityFirstCompletion, activityLabel?: string): void {
    if (!first.instanceId) {
      return;
    }
    const isD1 = first.game === 'D1';
    this.openPgcrLite({
      instanceId: String(first.instanceId),
      isD1,
      membershipId: first.membershipId ? String(first.membershipId) : undefined,
      activityLabel: activityLabel ?? first.name,
      period: first.completionDate || first.period || undefined,
    });
  }

  openPgcrLiteFromStored(
    activity: ActivityHistory | { activityDetails?: { instanceId?: string }; period?: string; membershipId?: string; displayName?: string },
    isD1: boolean
  ): void {
    const instanceId = activity.activityDetails?.instanceId;
    if (!instanceId) {
      return;
    }
    const row = activity as { membershipId?: string; displayName?: string };
    this.openPgcrLite({
      instanceId: String(instanceId),
      isD1,
      membershipId: row.membershipId ? String(row.membershipId) : undefined,
      period: activity.period,
      preferredDisplayName: row.displayName?.trim() || undefined,
    });
  }
}
