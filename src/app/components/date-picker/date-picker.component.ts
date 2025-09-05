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

      <!-- Year Selector -->
      <select 
        [(ngModel)]="selectedYear" 
        (ngModelChange)="onDateChange()"
        class="px-3 py-2 bg-slate-700/95 text-white rounded-lg border border-slate-600 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors">
        <option *ngFor="let year of years" [value]="year">{{ year }}</option>
      </select>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DatePickerComponent implements OnInit {
  @Input() selectedDate: string = '';
  @Output() dateChange = new EventEmitter<string>();

  selectedMonth: number = new Date().getMonth() + 1;
  selectedDay: number = new Date().getDate();
  selectedYear?: number;

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

  years: number[] = [];

  ngOnInit() {
    // Generate years from 2014 to current year + 1
    const currentYear = new Date().getFullYear();
    for (let year = 2014; year <= currentYear + 1; year++) {
      this.years.push(year);
    }

    // Set default year to current year
    this.selectedYear = currentYear;

    // Parse initial date if provided
    if (this.selectedDate) {
      this.parseDate(this.selectedDate);
    }
  }

  get availableDays(): number[] {
    if (!this.selectedMonth || !this.selectedYear) {
      return [];
    }

    const daysInMonth = new Date(this.selectedYear, this.selectedMonth, 0).getDate();
    const days: number[] = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    return days;
  }

  onDateChange() {
    if (this.selectedMonth && this.selectedDay && this.selectedYear) {
      const dateString = this.formatDate(this.selectedYear, this.selectedMonth, this.selectedDay);
      this.dateChange.emit(dateString);
    }
  }

  private parseDate(dateString: string) {
    if (!dateString) return;
    
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      this.selectedYear = date.getFullYear();
      this.selectedMonth = date.getMonth() + 1;
      this.selectedDay = date.getDate();
    }
  }

  private formatDate(year: number, month: number, day: number): string {
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }
}
