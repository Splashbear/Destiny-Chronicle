import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';

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

  constructor(private http: HttpClient) {
    this.loadManifest();
  }

  async loadManifest() {
    try {
      this.manifest = await firstValueFrom(this.http.get<any>(this.D1_MANIFEST_JSON));
      this.manifestLoaded.next(true);
      console.log('D1 manifest (comprehensive JSON) loaded successfully');
    } catch (error) {
      console.error('Failed to load D1 manifest JSON:', error);
      this.manifestLoaded.next(false);
    }
  }

  /** Whether we have a definition for this activity (from static JSON or previously injected). */
  hasActivityDefinition(referenceId: string | number): boolean {
    if (!referenceId) return false;
    const defs = this.manifest.DestinyActivityDefinition;
    if (!defs || typeof defs !== 'object') return false;
    const def = defs[String(referenceId)];
    return !!def && (!!(def.activityName || def.displayProperties?.name) || !!def.activityTypeHash);
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

  getActivityName(referenceId: string | number): string {
    if (!this.manifest.DestinyActivityDefinition || !referenceId) return 'Unknown Activity';
    const def = this.manifest.DestinyActivityDefinition[String(referenceId)];
    if (!def) {
      console.warn('[Manifest][getActivityName] MISSING', { referenceId, isD1: true });
      return 'Unknown Activity';
    }
    return def.activityName || def.displayProperties?.name || 'Unknown Activity';
  }

  getActivityType(referenceId: string | number): string {
    if (!this.manifest.DestinyActivityDefinition || !referenceId) return 'unknown';
    const def = this.manifest.DestinyActivityDefinition[String(referenceId)];
    if (!def) return 'unknown';
    const typeHash = def.activityTypeHash;
    if (typeHash && this.manifest.DestinyActivityTypeDefinition[typeHash]) {
      return this.manifest.DestinyActivityTypeDefinition[typeHash].identifier || this.manifest.DestinyActivityTypeDefinition[typeHash].activityTypeName || 'unknown';
    }
    return 'unknown';
  }

  getActivityMode(referenceId: string | number): string {
    if (!this.manifest.DestinyActivityDefinition || !referenceId) return 'unknown';
    const def = this.manifest.DestinyActivityDefinition[String(referenceId)];
    if (!def) return 'unknown';
    const modeHashes = def.activityModeHashes || [];
    if (modeHashes.length && this.manifest.DestinyActivityModeDefinition[modeHashes[0]]) {
      return this.manifest.DestinyActivityModeDefinition[modeHashes[0]].displayProperties?.name || this.manifest.DestinyActivityModeDefinition[modeHashes[0]].modeName || 'unknown';
    }
    return 'unknown';
  }

  getActivityIcon(referenceId: string | number): string {
    if (!this.manifest.DestinyActivityDefinition || !referenceId) return '';
    const def = this.manifest.DestinyActivityDefinition[String(referenceId)];
    if (!def) {
      console.warn('[Manifest][getActivityIcon] MISSING', { referenceId, isD1: true });
      return '';
    }
    if (def.icon) {
      return 'https://www.bungie.net' + def.icon;
    }
    return def.displayProperties?.icon ? 'https://www.bungie.net' + def.displayProperties.icon : '';
  }

  getActivityRaidImage(referenceId: string | number): string {
    return this.D1_RAID_IMAGE_MAP[String(referenceId)] || '';
  }

  getActivityPgcrImage(referenceId: string | number): string {
    if (!this.manifest.DestinyActivityDefinition || !referenceId) return '';
    const def = this.manifest.DestinyActivityDefinition[String(referenceId)];
    if (def && def.pgcrImage) {
      if (def.pgcrImage.startsWith('/img') || def.pgcrImage.startsWith('/common')) {
        return 'https://www.bungie.net' + def.pgcrImage;
      }
      return def.pgcrImage;
    }
    return this.getActivityIcon(referenceId);
  }

  isLoaded(): Observable<boolean> {
    return this.manifestLoaded.asObservable();
  }
} 