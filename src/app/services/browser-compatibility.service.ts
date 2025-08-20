import { Injectable } from '@angular/core';

export interface BrowserCapabilities {
  supportsIndexedDB: boolean;
  supportsWebShare: boolean;
  supportsClipboard: boolean;
  supportsPromiseAllSettled: boolean;
  supportsGrid: boolean;
  supportsFlexbox: boolean;
  supportsBackdropFilter: boolean;
  isSafari: boolean;
  isFirefox: boolean;
  isEdge: boolean;
  isChrome: boolean;
  isOpera: boolean;
  isIE: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class BrowserCompatibilityService {
  private capabilities: BrowserCapabilities;

  constructor() {
    this.capabilities = this.detectCapabilities();
  }

  /**
   * Get browser capabilities
   */
  getCapabilities(): BrowserCapabilities {
    return this.capabilities;
  }

  /**
   * Check if a specific feature is supported
   */
  supports(feature: keyof BrowserCapabilities): boolean {
    return this.capabilities[feature];
  }

  /**
   * Detect browser capabilities
   */
  private detectCapabilities(): BrowserCapabilities {
    const userAgent = navigator.userAgent;
    const isSafari = /Safari/.test(userAgent) && !/(Chrome\/|Edge\/)/.test(userAgent);
    const isFirefox = /Firefox/.test(userAgent);
    const isEdge = /Edge/.test(userAgent);
    const isChrome = /Chrome/.test(userAgent) && !/Edge/.test(userAgent);
    const isOpera = /Opera|OPR/.test(userAgent);
    const isIE = /MSIE|Trident/.test(userAgent);

    return {
      supportsIndexedDB: this.testIndexedDB(),
      supportsWebShare: this.testWebShare(),
      supportsClipboard: this.testClipboard(),
      supportsPromiseAllSettled: this.testPromiseAllSettled(),
      supportsGrid: this.testCSSGrid(),
      supportsFlexbox: this.testFlexbox(),
      supportsBackdropFilter: this.testBackdropFilter(),
      isSafari,
      isFirefox,
      isEdge,
      isChrome,
      isOpera,
      isIE
    };
  }

  /**
   * Test IndexedDB support
   */
  private testIndexedDB(): boolean {
    try {
      return !!(window.indexedDB && window.IDBTransaction && window.IDBKeyRange);
    } catch {
      return false;
    }
  }

  /**
   * Test Web Share API support
   */
  private testWebShare(): boolean {
    return !!(navigator.share && typeof navigator.share === 'function');
  }

  /**
   * Test Clipboard API support
   */
  private testClipboard(): boolean {
    return !!(navigator.clipboard && typeof navigator.clipboard.writeText === 'function');
  }

  /**
   * Test Promise.allSettled support
   */
  private testPromiseAllSettled(): boolean {
    return typeof Promise.allSettled === 'function';
  }

  /**
   * Test CSS Grid support
   */
  private testCSSGrid(): boolean {
    return CSS.supports('display', 'grid');
  }

  /**
   * Test Flexbox support
   */
  private testFlexbox(): boolean {
    return CSS.supports('display', 'flex');
  }

  /**
   * Test backdrop-filter support
   */
  private testBackdropFilter(): boolean {
    return CSS.supports('backdrop-filter', 'blur(10px)') || 
           CSS.supports('-webkit-backdrop-filter', 'blur(10px)');
  }

  /**
   * Get browser-specific recommendations
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (!this.capabilities.supportsIndexedDB) {
      recommendations.push('Your browser doesn\'t support local storage. Some features may not work properly.');
    }
    
    if (!this.capabilities.supportsWebShare) {
      recommendations.push('Sharing features will use fallback methods (copy to clipboard).');
    }
    
    if (this.capabilities.isSafari && !this.capabilities.supportsIndexedDB) {
      recommendations.push('Safari users: Please enable "Develop > Experimental Features > IndexedDB" for full functionality.');
    }
    
    if (this.capabilities.isIE) {
      recommendations.push('Internet Explorer is not supported. Please use a modern browser.');
    }
    
    return recommendations;
  }

  /**
   * Check if browser is fully supported
   */
  isFullySupported(): boolean {
    return this.capabilities.supportsIndexedDB && 
           this.capabilities.supportsFlexbox && 
           !this.capabilities.isIE;
  }
}
