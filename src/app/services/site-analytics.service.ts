import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/** Coarse game label for account_lookup (never per-account identifiers). */
export type AnalyticsGame = 'D1' | 'D2' | 'mixed';

/** Where activity history came from for this lookup. */
export type AnalyticsSource = 'archive' | 'bungie' | 'mixed';

/** Named UI surfaces we count without attaching who viewed them. */
export type AnalyticsFeature =
  | 'heatmap'
  | 'breakdown'
  | 'titles'
  | 'seal_poster'
  | 'played_with'
  | 'activities'
  | 'firsts';

export type AccountLookupParams = {
  game: AnalyticsGame;
  platform: string;
  account_count: number;
  source: AnalyticsSource;
  load_ms_bucket: string;
};

/** Params that may never be sent to GA (exact key match, case-insensitive). */
export const FORBIDDEN_ANALYTICS_KEYS = [
  'membershipid',
  'membership_id',
  'membershipids',
  'membership_ids',
  'displayname',
  'display_name',
  'bungiename',
  'bungie_name',
  'bungie_global_display_name',
  'username',
  'name',
  'player',
  'playerid',
  'player_id',
  'characterid',
  'character_id',
  'accountid',
  'account_id',
  'mid',
  'id',
  'search',
  'query',
  'email'
] as const;

/** Only these keys are forwarded on custom events. */
export const ALLOWED_ANALYTICS_KEYS = [
  'game',
  'platform',
  'account_count',
  'source',
  'load_ms_bucket',
  'error_type',
  'feature'
] as const;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Injects and initializes Google Analytics (GA4) and Cloudflare Web Analytics,
 * and sends privacy-preserving custom events (no membership IDs, names, or
 * other account identifiers). See docs/analytics-setup.md.
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

  /** Bucket raw milliseconds so GA never stores exact timings. */
  static bucketLoadMs(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return 'unknown';
    if (ms < 5000) return '0_5s';
    if (ms < 15000) return '5_15s';
    if (ms < 30000) return '15_30s';
    if (ms < 60000) return '30_60s';
    if (ms < 120000) return '60_120s';
    return '120s_plus';
  }

  /**
   * Strip forbidden keys and keep only the allowlist. Safe to call from tests.
   * Values are coerced to string | number | boolean; objects/arrays are dropped.
   */
  static sanitizeParams(params: Record<string, unknown> | null | undefined): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    if (!params) return out;

    const allowed = new Set<string>(ALLOWED_ANALYTICS_KEYS);
    const forbidden = new Set<string>(FORBIDDEN_ANALYTICS_KEYS);

    for (const [rawKey, value] of Object.entries(params)) {
      const key = String(rawKey);
      const keyLower = key.toLowerCase();
      if (forbidden.has(keyLower)) continue;
      if (!allowed.has(keyLower) && !allowed.has(key)) continue;
      if (value == null) continue;
      const t = typeof value;
      if (t === 'string' || t === 'number' || t === 'boolean') {
        // Canonicalize to allowlist spelling
        const canonical =
          (ALLOWED_ANALYTICS_KEYS as readonly string[]).find(a => a === key || a === keyLower) ?? keyLower;
        out[canonical] = value as string | number | boolean;
      }
    }
    return out;
  }

  /** Fire a GA4 event via the existing gtag setup. No-op if gtag is absent. */
  event(name: string, params?: Record<string, unknown>): void {
    if (typeof name !== 'string' || !name.trim()) return;
    const safe = SiteAnalyticsService.sanitizeParams(params);
    try {
      if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
        window.gtag('event', name.trim(), safe);
      }
    } catch {
      // Never let analytics break the app
    }
  }

  trackAccountLookup(params: AccountLookupParams): void {
    this.event('account_lookup', {
      game: params.game,
      platform: params.platform,
      account_count: params.account_count,
      source: params.source,
      load_ms_bucket: params.load_ms_bucket
    });
  }

  /** Fixed allowlist only — never forward free-text (may contain names/IDs). */
  private static readonly LOOKUP_ERROR_TYPES = new Set([
    'account_load_failed',
    'cancelled',
    'display_failed',
    'archive_unavailable',
    'unknown'
  ]);

  trackLookupError(errorType: string): void {
    const cleaned = String(errorType || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 64);
    const safe = SiteAnalyticsService.LOOKUP_ERROR_TYPES.has(cleaned) ? cleaned : 'unknown';
    this.event('lookup_error', { error_type: safe });
  }

  trackFeatureView(feature: AnalyticsFeature | string): void {
    const cleaned = String(feature || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 64);
    if (!cleaned) return;
    this.event('feature_view', { feature: cleaned });
  }
}
