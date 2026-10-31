import { Injectable, signal } from '@angular/core';

const SESSION_SKIP_KEY = 'dc-decrypt-landing-skip';

export type DecryptLandingPhase = 'idle' | 'searchOpen' | 'loading' | 'unzipping' | 'done';

/**
 * Engram decrypt landing (ENGRAM_THEME_SPEC + bronze transition).
 * Fresh searches only; direct links and Skip-for-session skip it.
 * Progress must come from the real load — this service never invents timers.
 */
@Injectable({ providedIn: 'root' })
export class DecryptLandingService {
  /** Full-screen loading/unzip overlay is visible. */
  readonly visible = signal(false);
  /** Brief materialize class on the dossier after landing dismisses. */
  readonly materialize = signal(false);
  /** Presentation phase for the gate / overlay. */
  readonly phase = signal<DecryptLandingPhase>('idle');
  /**
   * This Decrypt used the bronze theater — keep the legacy loading strip hidden
   * for the rest of the load even after the overlay unzips away.
   */
  readonly ownsLoad = signal(false);

  private materializeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Hard-light dossier CSS is on (experiment default: on). */
  readonly hardlightEnabled = signal(true);

  prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private sessionFlag(key: string): boolean {
    try {
      return sessionStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  private setSessionFlag(key: string): void {
    try {
      sessionStorage.setItem(key, '1');
    } catch {
      /* private mode */
    }
  }

  /**
   * Whether this load may show the landing.
   * Skip: URL-restored players, user chose Skip this session, reduced motion.
   */
  shouldOffer(opts: { fromUrlRestore: boolean }): boolean {
    if (opts.fromUrlRestore) return false;
    if (this.prefersReducedMotion()) return false;
    if (this.sessionFlag(SESSION_SKIP_KEY)) return false;
    return true;
  }

  /** Call when a fresh profile load starts (not URL restore). */
  offerIfEligible(opts: { fromUrlRestore: boolean }): void {
    if (!this.shouldOffer(opts)) {
      this.visible.set(false);
      this.phase.set('done');
      this.ownsLoad.set(false);
      return;
    }
    this.ownsLoad.set(true);
    this.phase.set('loading');
    this.visible.set(true);
  }

  openSearchPanel(): void {
    if (this.phase() === 'idle' || this.phase() === 'done') {
      this.phase.set('searchOpen');
    }
  }

  skip(): void {
    this.setSessionFlag(SESSION_SKIP_KEY);
    this.dismissWithMaterialize();
  }

  /**
   * Load finished — run facet unzip (unless reduced motion / already hidden),
   * then materialize the hard-light dossier.
   */
  complete(): void {
    if (!this.visible()) return;
    if (this.prefersReducedMotion() || this.phase() === 'unzipping') {
      if (this.phase() !== 'unzipping') {
        this.dismissWithMaterialize();
      }
      return;
    }
    this.phase.set('unzipping');
  }

  /** Called by the landing when the facet fly-out finishes. */
  finishUnzip(): void {
    if (!this.visible() && this.phase() !== 'unzipping') return;
    this.dismissWithMaterialize();
  }

  hideQuietly(): void {
    this.visible.set(false);
    this.phase.set('done');
    this.ownsLoad.set(false);
  }

  private dismissWithMaterialize(): void {
    this.visible.set(false);
    this.phase.set('done');
    // Keep ownsLoad true so the legacy strip does not flash back mid-load.
    this.materialize.set(true);
    if (this.materializeTimer) clearTimeout(this.materializeTimer);
    this.materializeTimer = setTimeout(() => {
      this.materialize.set(false);
      this.materializeTimer = null;
    }, 320);
  }
}
