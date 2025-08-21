import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserCompatibilityService } from '../../services/browser-compatibility.service';

@Component({
  selector: 'app-browser-compatibility-warning',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="showWarning" class="browser-warning bg-yellow-900 border-l-4 border-yellow-500 p-4 mb-4">
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="ml-3">
          <h3 class="text-sm font-medium text-yellow-200">
            Browser Compatibility Notice
          </h3>
          <div class="mt-2 text-sm text-yellow-100">
            <p *ngFor="let recommendation of recommendations" class="mb-1">
              {{ recommendation }}
            </p>
          </div>
          <div class="mt-4">
            <button 
              (click)="dismissWarning()" 
              class="bg-yellow-800 text-yellow-100 px-3 py-1 rounded text-sm hover:bg-yellow-700 transition-colors">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .browser-warning {
      border-radius: 0.375rem;
    }
  `]
})
export class BrowserCompatibilityWarningComponent implements OnInit {
  showWarning = false;
  recommendations: string[] = [];

  constructor(private browserService: BrowserCompatibilityService) {}

  ngOnInit(): void {
    this.checkCompatibility();
  }

  private checkCompatibility(): void {
    const browserInfo = this.browserService.getBrowserInfo();
    
    // Show warning if browser is not compatible
    if (!this.browserService.isCompatible()) {
      this.recommendations = this.browserService.getCompatibilityWarnings();
      this.showWarning = true;
    }
  }

  dismissWarning(): void {
    this.showWarning = false;
  }
}
