import { Component, EventEmitter, Output, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-export-options-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="export-modal-backdrop">
      <div class="export-modal">
        <h2 class="text-lg font-bold mb-4">Export Options</h2>
        <form (ngSubmit)="onExport()">
          <div class="mb-4">
            <label class="font-semibold">Date Range:</label><br>
            <label><input type="radio" name="dateRange" [(ngModel)]="allDates" [value]="false" ngModel> Selected Date</label>
            <label class="ml-4"><input type="radio" name="dateRange" [(ngModel)]="allDates" [value]="true" ngModel> All Activities</label>
          </div>
          <div class="mb-4">
            <label class="font-semibold">Sheets to Export:</label><br>
            <label><input type="checkbox" [(ngModel)]="includeActivities" name="activities"> Activities</label><br>
            <label><input type="checkbox" [(ngModel)]="includeFirsts" name="firsts"> Guardian Firsts</label><br>
            <label><input type="checkbox" [(ngModel)]="includeTitles" name="titles"> Titles/Seals</label><br>
            <label><input type="checkbox" [(ngModel)]="includeSummary" name="summary"> Account Summary</label><br>
            <label><input type="checkbox" [(ngModel)]="includeBreakdown" name="breakdown"> Activity Breakdown</label>
          </div>
          <div class="mb-4">
            <label><input type="checkbox" [(ngModel)]="showIconsInline" name="showIconsInline"> Show icons inline (Google Sheets only)</label>
            <div class="text-xs text-slate-400 mt-1">Icons will display in Google Sheets, but not in Excel.</div>
          </div>
          <div class="flex gap-2 justify-end">
            <button type="button" (click)="onClose()" class="d2-btn bg-slate-600 hover:bg-slate-500">Cancel</button>
            <button type="submit" class="d2-btn bg-blue-600 hover:bg-blue-500">Export</button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .export-modal-backdrop {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;
    }
    .export-modal {
      background: #1e293b; color: #fff; border-radius: 8px; padding: 2rem; min-width: 320px; box-shadow: 0 4px 32px #000a;
    }
    .d2-btn { padding: 0.5rem 1.2rem; border-radius: 4px; font-weight: bold; }
    .ml-4 { margin-left: 1rem; }
    .mb-4 { margin-bottom: 1rem; }
    .gap-2 { gap: 0.5rem; }
    .flex { display: flex; }
    .justify-end { justify-content: flex-end; }
  `]
})
export class ExportOptionsDialogComponent {
  @Output() close = new EventEmitter<void>();
  @Output() export = new EventEmitter<any>();
  @Input() selectedDate?: string | Date;
  allDates = false;
  includeActivities = true;
  includeFirsts = true;
  includeTitles = true;
  includeSummary = true;
  includeBreakdown = true;
  showIconsInline = false;

  onClose() {
    this.close.emit();
  }

  onExport() {
    const options: any = {
      allDates: this.allDates,
      includeActivities: this.includeActivities,
      includeFirsts: this.includeFirsts,
      includeTitles: this.includeTitles,
      includeSummary: this.includeSummary,
      includeBreakdown: this.includeBreakdown,
      showIconsInline: this.showIconsInline
    };
    if (!this.allDates && this.selectedDate) {
      options.from = this.selectedDate;
    }
    console.log('Export options:', options);
    this.export.emit(options);
  }
} 