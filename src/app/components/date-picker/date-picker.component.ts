import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col sm:flex-row gap-3 items-center">
      <!-- Month Selector -->
      <select 
        [(ngModel)]="selectedMonth"
        (ngModelChange)="onDateChange()"
        class="px-3 py-2 bg-slate-700/95 text-white rounded-lg border border-slate-600 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors">
        <option *ngFor="let month of months" [value]="month.value">{{ month.label }}</option>
      </select>

      <!-- Day Selector -->
      <select 
        [(ngModel)]="selectedDay"
        (ngModelChange)="onDateChange()"
        class="px-3 py-2 bg-slate-700/95 text-white rounded-lg border border-slate-600 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors">
        <option *ngFor="let day of availableDays" [value]="day">{{ day }}</option>
      </select>
    </div>
  `
})
export class DatePickerComponent implements OnInit {
  @Input() selectedMonth: number = new Date().getMonth() + 1;
  @Input() selectedDay: number = new Date().getDate();
  @Output() dateChange = new EventEmitter<{month: number, day: number}>();

  months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  ngOnInit() {
    // No year handling needed - we show activities across all years for the selected month/day
  }

  onDateChange() {
    // Only emit if both month and day are valid
    if (this.selectedMonth && this.selectedDay) {
      this.dateChange.emit({ month: this.selectedMonth, day: this.selectedDay });
    }
  }

  get availableDays(): number[] {
    if (!this.selectedMonth) {
      return [];
    }

    const daysInMonth = new Date(new Date().getFullYear(), this.selectedMonth, 0).getDate();
    const days: number[] = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    return days;
  }
}
