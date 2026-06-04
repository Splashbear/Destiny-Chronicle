import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { BungieApiService } from './bungie-api.service';
import { AssetUrlService } from './asset-url.service';

@Injectable({
  providedIn: 'root'
})
export class Destiny1ManifestService {
  private manifest: any = {};
  private manifestLoaded = new BehaviorSubject<boolean>(false);
  private readonly D1_MANIFEST_JSON = 'assets/manifest/d1-activity-definitions.json';
  private readonly D1_RAID_IMAGE_MAP: { [referenceId: string]: string } = {
    '3801607287': 'assets/d1_raid_images/vaultofglass.jpg',        // Vault of Glass
    '3879860661': 'assets/d1_raid_images/crotasend.jpg',           // Crota's End
    '1733556769': 'assets/d1_raid_images/kingsfall.jpg',           // King's Fall
    '2578867903': 'assets/d1_raid_images/wrathofthemachine.jpg',   // Wrath of the Machine
  };

  constructor(
    private http: HttpClient,
    private bungieApi: BungieApiService,
    private assetUrl: AssetUrlService
  ) {
    this.loadManifest();
  }

  /**
   * D1 content is frozen; bundled `d1-activity-definitions.json` is the authoritative activity set for the app.
   * D1 names are English-only (no per-locale manifest components like D2). See README “Localization”.
   * We still ping Bungie’s D1 manifest endpoint once so logs can confirm API reachability / version metadata.
   * @see https://www.bungie.net/d1/Platform/Destiny/Manifest/
   */
  async loadManifest() {
    try {
      this.manifest = await firstValueFrom(this.http.get<any>(this.D1_MANIFEST_JSON));
      this.manifestLoaded.next(true);
      console.log('D1 activity definitions (bundled JSON) loaded successfully');
      try {
        const liveMeta = await firstValueFrom(this.bungieApi.getD1Manifest());
        const v = liveMeta && typeof liveMeta === 'object' ? (liveMeta as any).version : undefined;
        if (v != null) {
          console.log('[D1] Bungie manifest metadata version (reference only):', v);
        }
      } catch (e) {
        console.warn('[D1] Could not fetch live manifest metadata; continuing with bundled definitions only.', e);
      }
    } catch (error) {
      console.error('Failed to load D1 manifest JSON:', error);
      this.manifestLoaded.next(false);
    }
  }

  /**
   * D1 defs may be keyed by signed 32-bit strings from API/JSON while callers use unsigned hashes.
   * Try every stable string form so story anchors and PGCR thumbnails resolve.
   */
  private referenceIdLookupKeys(referenceId: string | number): string[] {
    if (referenceId === '' || referenceId == null) return [];
    const s = String(referenceId).trim();
    const n = Number(s);
    if (!Number.isFinite(n)) return [s];
    const unsigned = (n >>> 0).toString();
    const signed = (n | 0).toString();
    const keys = new Set<string>([s, unsigned]);
    if (signed !== unsigned) keys.add(signed);
    return Array.from(keys);
  }

  /** Whether we have a definition for this activity (from static JSON or previously injected). */
  hasActivityDefinition(referenceId: string | number): boolean {
    if (!referenceId) return false;
    const defs = this.manifest.DestinyActivityDefinition;
    if (!defs || typeof defs !== 'object') return false;
    return this.referenceIdLookupKeys(referenceId).some((k) => {
      const def = defs[k];
      return !!def && (!!(def.activityName || def.displayProperties?.name) || !!def.activityTypeHash);
    });
  }

  /**
   * Inject a single activity definition from the D1 Manifest API (GetDestinySingleDefinition).
   * Use when we need name/mode for a referenceId that isn't in the static manifest.
   */
  injectSingleActivityDefinition(referenceId: string | number, def: any): void {
    if (!def || typeof def !== 'object') return;
    if (!this.manifest.DestinyActivityDefinition) {
      this.manifest.DestinyActivityDefinition = {};
    }
    const key = String(referenceId);
    const name = def.activityName ?? def.displayProperties?.name;
    this.manifest.DestinyActivityDefinition[key] = {
      ...(this.manifest.DestinyActivityDefinition[key] || {}),
      ...def,
      ...(name ? { activityName: name } : {})
    };
  }

  /**
   * Merge activity definitions from the D1 Activity History API (when definitions=true).
   * Call this when you receive a response that includes definitions so names resolve.
   */
  injectDefinitionsFromApi(definitions: any): void {
    if (!definitions || typeof definitions !== 'object') return;
    if (!this.manifest.DestinyActivityDefinition) {
      this.manifest.DestinyActivityDefinition = {};
    }
    const target = this.manifest.DestinyActivityDefinition as Record<string, any>;
    // D1 API may return definitions.activities, definitions.DestinyActivityDefinition, or hash-keyed at top level
    const activities =
      definitions.activities ?? definitions.DestinyActivityDefinition ?? definitions;
    if (!activities || typeof activities !== 'object') return;
    for (const [hash, def] of Object.entries(activities)) {
      if (!def || typeof def !== 'object') continue;
      const key = String(hash);
      const name = (def as any).activityName ?? (def as any).displayProperties?.name;
      if (name) {
        target[key] = { ...(target[key] || {}), ...(def as object), activityName: name };
      } else {
        target[key] = { ...(target[key] || {}), ...(def as object) };
      }
    }
  }

  private getActivityDefinition(referenceId: string | number): any | undefined {
    if (!this.manifest.DestinyActivityDefinition || referenceId == null || referenceId === '') {
      return undefined;
    }
    for (const key of this.referenceIdLookupKeys(referenceId)) {
      const def = this.manifest.DestinyActivityDefinition[key];
      if (def) return def;
    }
    return undefined;
  }

  getActivityName(referenceId: string | number): string {
    if (!this.manifest.DestinyActivityDefinition || referenceId == null || referenceId === '') {
      return 'Unknown Activity';
    }
    for (const key of this.referenceIdLookupKeys(referenceId)) {
      const def = this.manifest.DestinyActivityDefinition[key];
      if (def) {
        return def.activityName || def.displayProperties?.name || 'Unknown Activity';
      }
    }
    console.warn('[Manifest][getActivityName] MISSING', { referenceId, isD1: true });
    return 'Unknown Activity';
  }

  getActivityType(referenceId: string | number): string {
    if (!this.manifest.DestinyActivityDefinition || !referenceId) return 'unknown';
    let def: any;
    for (const key of this.referenceIdLookupKeys(referenceId)) {
      def = this.manifest.DestinyActivityDefinition[key];
      if (def) break;
    }
    if (!def) return 'unknown';
    const typeHash = def.activityTypeHash;
    if (typeHash && this.manifest.DestinyActivityTypeDefinition[typeHash]) {
      return this.manifest.DestinyActivityTypeDefinition[typeHash].identifier || this.manifest.DestinyActivityTypeDefinition[typeHash].activityTypeName || 'unknown';
    }
    return 'unknown';
  }

  getActivityMode(referenceId: string | number): string {
    if (!this.manifest.DestinyActivityDefinition || !referenceId) return 'unknown';
    let def: any;
    for (const key of this.referenceIdLookupKeys(referenceId)) {
      def = this.manifest.DestinyActivityDefinition[key];
      if (def) break;
    }
    if (!def) return 'unknown';
    const modeHashes = def.activityModeHashes || [];
    if (modeHashes.length && this.manifest.DestinyActivityModeDefinition[modeHashes[0]]) {
      return this.manifest.DestinyActivityModeDefinition[modeHashes[0]].displayProperties?.name || this.manifest.DestinyActivityModeDefinition[modeHashes[0]].modeName || 'unknown';
    }
    return 'unknown';
  }

  getActivityIcon(referenceId: string | number): string {
    if (!this.manifest.DestinyActivityDefinition || !referenceId) return '';
    let def: any;
    for (const key of this.referenceIdLookupKeys(referenceId)) {
      def = this.manifest.DestinyActivityDefinition[key];
      if (def) break;
    }
    if (!def) {
      console.warn('[Manifest][getActivityIcon] MISSING', { referenceId, isD1: true });
      return '';
    }
    if (def.icon) {
      return this.assetUrl.resolve(def.icon);
    }
    return def.displayProperties?.icon ? this.assetUrl.resolve(def.displayProperties.icon) : '';
  }

  getActivityRaidImage(referenceId: string | number): string {
    return this.D1_RAID_IMAGE_MAP[String(referenceId)] || '';
  }

  getActivityPgcrImage(referenceId: string | number): string {
    if (!this.manifest.DestinyActivityDefinition || !referenceId) return '';
    let def: any;
    for (const key of this.referenceIdLookupKeys(referenceId)) {
      def = this.manifest.DestinyActivityDefinition[key];
      if (def) break;
    }
    if (def && def.pgcrImage) {
      if (def.pgcrImage.startsWith('/img') || def.pgcrImage.startsWith('/common')) {
        return this.assetUrl.resolve(def.pgcrImage);
      }
      return def.pgcrImage;
    }
    return this.getActivityIcon(referenceId);
  }

  isLoaded(): Observable<boolean> {
    return this.manifestLoaded.asObservable();
  }

  /**
   * Every bundled activity hash whose display name equals `displayName` (case-insensitive).
   * Used to widen D1 story anchor matching beyond hand-maintained referenceIds.
   */
  findActivityHashesByExactName(displayName: string): string[] {
    const defs = this.manifest?.DestinyActivityDefinition;
    if (!defs || typeof defs !== 'object') return [];
    const want = displayName.trim().toLowerCase();
    if (!want) return [];
    const out: string[] = [];
    for (const key of Object.keys(defs)) {
      const def = defs[key] as { activityName?: string; displayProperties?: { name?: string } };
      const n = def?.activityName ?? def?.displayProperties?.name;
      if (n == null || String(n).trim() === '') continue;
      if (String(n).trim().toLowerCase() !== want) continue;
      const num = Number(key);
      const unsigned = Number.isFinite(num) ? (num >>> 0).toString() : key.trim();
      if (!out.includes(unsigned)) out.push(unsigned);
    }
    return out;
  }
} 