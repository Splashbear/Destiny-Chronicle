import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { D1PGCRDetailsComponent } from '../components/d1-pgcr-details/d1-pgcr-details.component';

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
} 