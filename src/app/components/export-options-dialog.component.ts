import { Component, EventEmitter, Output, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-export-options-dialog',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="destiny-modal-overlay" (click)="onClose()" role="dialog" aria-modal="true" aria-labelledby="export-options-title">
      <div class="destiny-modal-panel export-options-panel max-w-md w-full" (click)="$event.stopPropagation()">
        <h2 id="export-options-title" class="text-lg font-semibold text-[var(--destiny-gold-bright)] font-d2-headline mb-4">Export Options</h2>
        <form (ngSubmit)="onExport()" class="export-options-form">
          <fieldset class="export-options-fieldset mb-4">
            <legend class="export-options-legend">Date Range</legend>
            <label class="export-options-radio">
              <input type="radio" name="dateRange" [(ngModel)]="allDates" [value]="false"> Selected Date
            </label>
            <label class="export-options-radio">
              <input type="radio" name="dateRange" [(ngModel)]="allDates" [value]="true"> All Activities
            </label>
          </fieldset>
          <fieldset class="export-options-fieldset mb-4">
            <legend class="export-options-legend">Sheets to Export</legend>
            <label class="export-options-check"><input type="checkbox" [(ngModel)]="includeActivities" name="activities"> Activities</label>
            <label class="export-options-check"><input type="checkbox" [(ngModel)]="includeFirsts" name="firsts"> Guardian Firsts</label>
            <label class="export-options-check"><input type="checkbox" [(ngModel)]="includeTitles" name="titles"> Titles/Seals</label>
            <label class="export-options-check"><input type="checkbox" [(ngModel)]="includeSummary" name="summary"> Account Summary</label>
            <label class="export-options-check"><input type="checkbox" [(ngModel)]="includeBreakdown" name="breakdown"> Activity Breakdown</label>
          </fieldset>
          <div class="export-options-fieldset mb-5">
            <label class="export-options-check">
              <input type="checkbox" [(ngModel)]="showIconsInline" name="showIconsInline"> Show icons inline (Google Sheets only)
            </label>
            <p class="text-xs text-slate-400 mt-1 ml-6">Icons display in Google Sheets, not Excel.</p>
          </div>
          <div class="flex flex-wrap gap-2 justify-end">
            <button type="button" (click)="onClose()" class="chronicle-toolbar-btn">Cancel</button>
            <button type="submit" class="chronicle-toolbar-btn chronicle-toolbar-btn--primary">Export</button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .export-options-form {
      color: rgba(226, 232, 240, 0.95);
      font-size: 0.875rem;
    }

    .export-options-fieldset {
      border: 1px solid rgba(255, 208, 32, 0.2);
      border-radius: 0.5rem;
      padding: 0.75rem 0.875rem;
      background: rgba(14, 20, 26, 0.35);
    }

    .export-options-legend {
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--destiny-gold-bright, #e4c04a);
      padding: 0 0.25rem;
    }

    .export-options-radio,
    .export-options-check {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.375rem;
      cursor: pointer;
    }

    .export-options-radio input,
    .export-options-check input {
      accent-color: var(--destiny-flame, #e67e22);
    }
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
    this.export.emit(options);
  }
}
