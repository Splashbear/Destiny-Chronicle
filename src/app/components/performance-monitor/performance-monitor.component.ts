import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SmartCacheService } from '../../services/smart-cache.service';
import { Subscription, interval } from 'rxjs';
import { environment } from '../../../environments/environment';

interface PerformanceMetrics {
  loadTime: number;
  renderTime: number;
  cacheHitRate: number;
  memoryUsage: number;
  activitiesLoaded: number;
  lastUpdate: Date;
}

@Component({
  selector: 'app-performance-monitor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="performance-monitor bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-4" 
         *ngIf="showMonitor">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-slate-300">Performance Monitor</h3>
        <button (click)="toggleMonitor()" 
                class="text-xs text-slate-400 hover:text-white transition-colors">
          {{ expanded ? 'Collapse' : 'Expand' }}
        </button>
      </div>
      
      <div *ngIf="expanded" class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div class="metric">
          <div class="text-slate-400">Load Time</div>
          <div class="text-white font-mono">{{ metrics.loadTime }}ms</div>
        </div>
        
        <div class="metric">
          <div class="text-slate-400">Cache Hit Rate</div>
          <div class="text-white font-mono" 
               [class.text-green-400]="metrics.cacheHitRate > 80"
               [class.text-yellow-400]="metrics.cacheHitRate > 50 && metrics.cacheHitRate <= 80"
               [class.text-red-400]="metrics.cacheHitRate <= 50">
            {{ metrics.cacheHitRate }}%
          </div>
        </div>
        
        <div class="metric">
          <div class="text-slate-400">Memory Usage</div>
          <div class="text-white font-mono">{{ formatBytes(metrics.memoryUsage) }}</div>
        </div>
        
        <div class="metric">
          <div class="text-slate-400">Activities Loaded</div>
          <div class="text-white font-mono">{{ metrics.activitiesLoaded }}</div>
        </div>
      </div>
      
      <div *ngIf="expanded" class="mt-3 pt-3 border-t border-slate-700">
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-400">Last Updated: {{ formatTime(metrics.lastUpdate) }}</span>
          <div class="flex gap-2">
            <button (click)="clearCache()" 
                    class="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-colors">
              Clear Cache
            </button>
            <button (click)="exportMetrics()" 
                    class="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-colors">
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .performance-monitor {
      font-family: 'Roboto Mono', monospace;
    }
    .metric {
      text-align: center;
    }
  `]
})
export class PerformanceMonitorComponent implements OnInit, OnDestroy {
  showMonitor = false;
  expanded = false;
  metrics: PerformanceMetrics = {
    loadTime: 0,
    renderTime: 0,
    cacheHitRate: 0,
    memoryUsage: 0,
    activitiesLoaded: 0,
    lastUpdate: new Date()
  };

  private subscription?: Subscription;
  private startTime = Date.now();

  constructor(private cacheService: SmartCacheService) {
    // Show monitor in development or when debug flag is set
    this.showMonitor = !environment.production || localStorage.getItem('debug-performance') === 'true';
  }

  ngOnInit(): void {
    if (this.showMonitor) {
      this.startMonitoring();
    }
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private startMonitoring(): void {
    // Update metrics every 2 seconds
    this.subscription = interval(2000).subscribe(() => {
      this.updateMetrics();
    });

    // Initial update
    this.updateMetrics();
  }

  private updateMetrics(): void {
    const cacheStats = this.cacheService.getStats();
    
    // Calculate hit rate from hits and misses
    const totalRequests = cacheStats.hits + cacheStats.misses;
    const hitRate = totalRequests > 0 ? (cacheStats.hits / totalRequests) * 100 : 0;
    
    // Estimate memory usage (rough calculation)
    const estimatedMemoryUsage = cacheStats.size * 1024; // Assume 1KB per cache entry
    
    this.metrics = {
      loadTime: Date.now() - this.startTime,
      renderTime: this.measureRenderTime(),
      cacheHitRate: hitRate,
      memoryUsage: estimatedMemoryUsage + this.estimateComponentMemory(),
      activitiesLoaded: this.getActivitiesCount(),
      lastUpdate: new Date()
    };
  }

  private measureRenderTime(): number {
    const start = performance.now();
    // Trigger a small DOM operation to measure render time
    const element = document.createElement('div');
    element.innerHTML = 'test';
    document.body.appendChild(element);
    document.body.removeChild(element);
    return Math.round(performance.now() - start);
  }

  private estimateComponentMemory(): number {
    // Rough estimation of component memory usage
    const elements = document.querySelectorAll('[data-activity]').length;
    return elements * 512; // Assume 512 bytes per activity element
  }

  private getActivitiesCount(): number {
    return document.querySelectorAll('[data-activity]').length;
  }

  toggleMonitor(): void {
    this.expanded = !this.expanded;
  }

  clearCache(): void {
    this.cacheService.clearAll();
    console.log('[Performance] Cache cleared');
  }

  exportMetrics(): void {
    const data = {
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { 
      type: 'application/json' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-metrics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString();
  }
}

