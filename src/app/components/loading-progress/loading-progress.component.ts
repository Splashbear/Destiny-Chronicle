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
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      padding: 1.5rem 2rem;
      border-radius: 0.75rem;
      min-width: 260px;
      text-align: center;
      z-index: 1000;
      box-shadow: 0 0 10px rgba(0,0,0,0.6);
    }
    .progress-bar {
      height: 10px;
      width: 100%;
      background: #333;
      border-radius: 5px;
      overflow: hidden;
      margin-bottom: 1rem;
    }
    .progress {
      height: 100%;
      background: #4CAF50;
      transition: width 0.3s ease;
    }
    .message {
      font-size: 1rem;
      text-align: center;
    }
  `]
})
export class LoadingProgressComponent {
  @Input() progress: LoadingProgress | null = null;
} 