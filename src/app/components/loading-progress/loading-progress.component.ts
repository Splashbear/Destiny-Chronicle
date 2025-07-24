import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingProgress } from '../../models/loading-progress.model';

@Component({
  selector: 'app-loading-progress',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loading-progress" *ngIf="progress">
      <h3 class="phase">{{ progress.message }}</h3>
      <div class="progress-bar">
        <div class="fill" [style.width.%]="getPercentage()"></div>
      </div>
      <div class="percent">{{ getPercentage() | number:'1.0-0' }}%</div>
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
    .phase {
      margin: 0 0 0.75rem;
      font-size: 1.1rem;
    }
    .progress-bar {
      height: 10px;
      width: 100%;
      background: #333;
      border-radius: 5px;
      overflow: hidden;
      margin-bottom: 0.5rem;
    }
    .fill {
      height: 100%;
      background: #4CAF50;
      transition: width 0.3s ease;
    }
    .percent {
      font-size: 0.875rem;
    }
  `]
})
export class LoadingProgressComponent {
  @Input() progress: LoadingProgress | null = null;

  getPercentage(): number {
    if (!this.progress || this.progress.total === 0) return 0;
    return Math.min(100, (this.progress.current / this.progress.total) * 100);
  }
} 