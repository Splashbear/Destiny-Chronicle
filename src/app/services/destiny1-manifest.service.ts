import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class Destiny1ManifestService {
  private activityDefs: { [key: string]: any } = {};
  private manifestLoaded = new BehaviorSubject<boolean>(false);
  private readonly D1_ACTIVITY_JSON = 'assets/manifest/d1-activity-definitions.json';
  private readonly D1_RAID_JSON = 'assets/manifest/d1-raid-definitions.json';
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
      // Load both manifests
      const [mainManifest, raidManifest] = await Promise.all([
        firstValueFrom(this.http.get<{ [key: string]: any }>(this.D1_ACTIVITY_JSON)),
        firstValueFrom(this.http.get<{ [key: string]: any }>(this.D1_RAID_JSON))
      ]);

      // Merge the manifests, with raid definitions taking precedence
      this.activityDefs = {
        ...mainManifest,
        ...raidManifest
      };

      this.manifestLoaded.next(true);
      console.log('D1 manifest (JSON) loaded successfully');
    } catch (error) {
      console.error('Failed to load D1 manifest JSON:', error);
      this.manifestLoaded.next(false);
    }
  }

  getActivityName(referenceId: string | number): string {
    if (!this.activityDefs || !referenceId) return 'Unknown Activity';
    const def = this.activityDefs[String(referenceId)];
    if (!def) {
      console.warn('[Manifest][getActivityName] MISSING', { referenceId, isD1: true });
      return 'Unknown Activity';
    }
    return def?.activityName || def?.displayProperties?.name || 'Unknown Activity';
  }

  getActivityIcon(referenceId: string | number): string {
    if (!this.activityDefs || !referenceId) return '';
    const def = this.activityDefs[String(referenceId)];
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
    if (!this.activityDefs || !referenceId) return '';
    const def = this.activityDefs[String(referenceId)];
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