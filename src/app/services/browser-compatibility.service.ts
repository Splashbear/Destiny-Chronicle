import { Injectable } from '@angular/core';

export interface BrowserInfo {
  name: string;
  version: string;
  isChrome: boolean;
  isFirefox: boolean;
  isSafari: boolean;
  isEdge: boolean;
  isIE: boolean;
  isOpera: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  supportsES6: boolean;
  supportsFetch: boolean;
  supportsLocalStorage: boolean;
  supportsIndexedDB: boolean;
  supportsWebWorkers: boolean;
  supportsServiceWorkers: boolean;
  userAgent: string;
}

@Injectable({
  providedIn: 'root'
})
export class BrowserCompatibilityService {
  private browserInfo: BrowserInfo;

  constructor() {
    this.browserInfo = this.detectBrowser();
  }

  getBrowserInfo(): BrowserInfo {
    return this.browserInfo;
  }

  isCompatible(): boolean {
    // Basic compatibility check
    return this.browserInfo.supportsES6 && 
           this.browserInfo.supportsFetch && 
           this.browserInfo.supportsLocalStorage;
  }

  getCompatibilityWarnings(): string[] {
    const warnings: string[] = [];
    
    if (!this.browserInfo.supportsES6) {
      warnings.push('Your browser may not support modern JavaScript features');
    }
    
    if (!this.browserInfo.supportsFetch) {
      warnings.push('Your browser may not support modern network requests');
    }
    
    if (!this.browserInfo.supportsLocalStorage) {
      warnings.push('Your browser may not support local data storage');
    }
    
    if (this.browserInfo.isIE) {
      warnings.push('Internet Explorer is not fully supported. Please use a modern browser');
    }
    
    return warnings;
  }

  getRecommendedBrowser(): string {
    if (this.browserInfo.isChrome) return 'Chrome (latest)';
    if (this.browserInfo.isFirefox) return 'Firefox (latest)';
    if (this.browserInfo.isSafari) return 'Safari (latest)';
    if (this.browserInfo.isEdge) return 'Edge (latest)';
    return 'Chrome, Firefox, Safari, or Edge (latest versions)';
  }

  private detectBrowser(): BrowserInfo {
    const userAgent = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isTablet = /iPad|Android(?=.*\bMobile\b)(?=.*\bSafari\b)/i.test(userAgent);
    
    let name = 'Unknown';
    let version = 'Unknown';
    
    // Chrome
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      name = 'Chrome';
      version = this.extractVersion(userAgent, 'Chrome');
    }
    // Edge (Chromium-based)
    else if (userAgent.includes('Edg')) {
      name = 'Edge';
      version = this.extractVersion(userAgent, 'Edg');
    }
    // Firefox
    else if (userAgent.includes('Firefox')) {
      name = 'Firefox';
      version = this.extractVersion(userAgent, 'Firefox');
    }
    // Safari
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      name = 'Safari';
      version = this.extractVersion(userAgent, 'Version');
    }
    // Opera
    else if (userAgent.includes('OPR') || userAgent.includes('Opera')) {
      name = 'Opera';
      version = this.extractVersion(userAgent, 'OPR') || this.extractVersion(userAgent, 'Opera');
    }
    // Internet Explorer
    else if (userAgent.includes('MSIE') || userAgent.includes('Trident')) {
      name = 'Internet Explorer';
      version = this.extractVersion(userAgent, 'MSIE') || this.extractVersion(userAgent, 'rv');
    }

    return {
      name,
      version,
      isChrome: name === 'Chrome',
      isFirefox: name === 'Firefox',
      isSafari: name === 'Safari',
      isEdge: name === 'Edge',
      isIE: name === 'Internet Explorer',
      isOpera: name === 'Opera',
      isMobile,
      isTablet,
      isDesktop: !isMobile && !isTablet,
      supportsES6: this.supportsES6(),
      supportsFetch: 'fetch' in window,
      supportsLocalStorage: 'localStorage' in window,
      supportsIndexedDB: 'indexedDB' in window,
      supportsWebWorkers: 'Worker' in window,
      supportsServiceWorkers: 'serviceWorker' in navigator,
      userAgent
    };
  }

  private extractVersion(userAgent: string, browserName: string): string {
    const regex = new RegExp(`${browserName}\\/(\\d+(\\.\\d+)*)`);
    const match = userAgent.match(regex);
    return match ? match[1] : 'Unknown';
  }

  private supportsES6(): boolean {
    try {
      // Test ES6 features
      eval('const test = () => {}; const obj = { ...{} }; const arr = [...[]];');
      return true;
    } catch {
      return false;
    }
  }

  // Get device-specific recommendations
  getDeviceRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (this.browserInfo.isMobile) {
      recommendations.push('Use landscape mode for better viewing on mobile devices');
      recommendations.push('Consider using the app in a web browser for full features');
    }
    
    if (this.browserInfo.isTablet) {
      recommendations.push('Tablet view is optimized for touch interaction');
    }
    
    if (this.browserInfo.isDesktop) {
      recommendations.push('Desktop view provides the best experience with all features');
    }
    
    return recommendations;
  }

  // Check if browser supports specific features
  supportsFeature(feature: string): boolean {
    switch (feature) {
      case 'cors':
        return 'XMLHttpRequest' in window && 'withCredentials' in new XMLHttpRequest();
      case 'webgl':
        try {
          const canvas = document.createElement('canvas');
          return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        } catch {
          return false;
        }
      case 'webp':
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
      default:
        return false;
    }
  }
}
