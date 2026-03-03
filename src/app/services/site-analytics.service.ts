import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Injects and initializes Google Analytics (GA4) and Cloudflare Web Analytics.
 * Only runs in production when IDs are configured. See docs/analytics-setup.md.
 */
@Injectable({
  providedIn: 'root'
})
export class SiteAnalyticsService {
  private initialized = false;

  constructor() {
    this.init();
  }

  private init(): void {
    if (this.initialized) return;
    if (!environment.production) return;

    const config = (environment as { analytics?: { googleMeasurementId?: string; cloudflareToken?: string } }).analytics;
    if (!config) return;

    const gaId = config.googleMeasurementId?.trim();
    const cfToken = config.cloudflareToken?.trim();

    if (gaId && gaId.startsWith('G-')) {
      this.loadGoogleAnalytics(gaId);
    }
    if (cfToken) {
      this.loadCloudflareAnalytics(cfToken);
    }

    this.initialized = true;
  }

  private loadGoogleAnalytics(measurementId: string): void {
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script1);

    const script2 = document.createElement('script');
    script2.textContent = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${measurementId}');
    `;
    document.head.appendChild(script2);
  }

  private loadCloudflareAnalytics(token: string): void {
    const script = document.createElement('script');
    script.defer = true;
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    script.setAttribute('data-cf-beacon', JSON.stringify({ token, spa: true }));
    document.head.appendChild(script);
  }
}
