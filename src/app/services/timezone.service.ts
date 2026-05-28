import { Injectable } from '@angular/core';
import { LocaleService } from './locale.service';

@Injectable({
  providedIn: 'root'
})
export class TimezoneService {
  constructor(private locale: LocaleService) {}
  /**
   * Converts a UTC date string to the user's local timezone
   * @param utcDateString The UTC date string from the API
   * @returns Date object in local timezone
   */
  utcToLocal(utcDateString: string): Date {
    if (!utcDateString) return new Date();
    return new Date(utcDateString);
  }

  /**
   * Converts a local date to UTC for API calls
   * @param localDate The local date to convert
   * @returns Date object in UTC
   */
  localToUtc(localDate: Date): Date {
    return new Date(Date.UTC(
      localDate.getFullYear(),
      localDate.getMonth(),
      localDate.getDate(),
      localDate.getHours(),
      localDate.getMinutes(),
      localDate.getSeconds()
    ));
  }

  /**
   * Gets the local month and day for a UTC date
   * @param utcDateString The UTC date string from the API
   * @returns Object containing local month and day
   */
  getLocalMonthAndDay(utcDateString: string): { month: number; day: number } {
    const localDate = this.utcToLocal(utcDateString);
    return {
      month: localDate.getMonth() + 1, // Convert 0-11 to 1-12
      day: localDate.getDate()
    };
  }

  /**
   * Creates a date object for a specific month and day in the user's timezone
   * @param month Month (1-12)
   * @param day Day of month
   * @returns Date object set to midnight in local timezone
   */
  createLocalDate(month: number, day: number): Date {
    const date = new Date();
    date.setMonth(month - 1); // Convert 1-12 to 0-11
    date.setDate(day);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /**
   * Formats a date for display in the user's timezone
   * @param utcDateString The UTC date string from the API
   * @returns Formatted date string in "Month Day, Year" format
   */
  formatDate(utcDateString: string): string {
    const localDate = this.utcToLocal(utcDateString);
    return localDate.toLocaleDateString(this.locale.intlLocale, {
      month: 'long',
      day: 'numeric', 
      year: 'numeric'
    });
  }

  /**
   * Formats a time for display in the user's timezone
   * @param utcDateString The UTC date string from the API
   * @returns Formatted time string
   */
  formatTime(utcDateString: string): string {
    const localDate = this.utcToLocal(utcDateString);
    return localDate.toLocaleTimeString();
  }

  /**
   * Formats a date and time for display in the user's timezone
   * @param utcDateString The UTC date string from the API
   * @returns Formatted date and time string in "Month Day, Year" format
   */
  formatDateTime(utcDateString: string): string {
    const localDate = this.utcToLocal(utcDateString);
    return localDate.toLocaleString(this.locale.intlLocale, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Debug helper to log timezone information
   * @param utcDateString The UTC date string from the API
   */
  debugTimezoneInfo(utcDateString: string): void {
    const localDate = this.utcToLocal(utcDateString);
    console.log('[Timezone Debug]', {
      original: utcDateString,
      local: localDate.toLocaleString(),
      utc: localDate.toUTCString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      offset: localDate.getTimezoneOffset(),
      month: localDate.getMonth() + 1,
      day: localDate.getDate(),
      hours: localDate.getHours()
    });
  }
} 