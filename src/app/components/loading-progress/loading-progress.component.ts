import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface LoadingProgress {
  characterId: string;
  progress: number;
  message: string;
}

@Component({
  selector: 'app-loading-progress',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loading-progress" *ngIf="progress">
      <div class="progress-bar">
        <div class="progress" [style.width.%]="progress.progress"></div>
      </div>
      <div class="message">{{ progress.message }}</div>
    </div>
  `,
  styles: [`
    .loading-progress {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 1rem;
      z-index: 1000;
    }
    .progress-bar {
      height: 4px;
      background: #333;
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 0.5rem;
    }
    .progress {
      height: 100%;
      background: #4CAF50;
      transition: width 0.3s ease;
    }
    .message {
      font-size: 0.9rem;
      text-align: center;
    }
  `]
})
export class LoadingProgressComponent {
  @Input() progress: LoadingProgress | null = null;
} 