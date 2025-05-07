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

  constructor(private http: HttpClient) {
    this.loadManifest();
  }

  async loadManifest() {
    try {
      // Load pre-parsed JSON from assets
      const manifestData = await firstValueFrom(
        this.http.get<{ [key: string]: any }>(this.D1_ACTIVITY_JSON)
      );
      this.activityDefs = manifestData;
      this.manifestLoaded.next(true);
      console.log('D1 manifest (JSON) loaded successfully');
    } catch (error) {
      console.error('Failed to load D1 manifest JSON:', error);
      this.manifestLoaded.next(false);
    }
  }

  getActivityName(referenceId: string | number): string {
    if (!this.activityDefs || !referenceId) return 'Unknown Activity';
    const def = this.activityDefs[referenceId];
    return def?.activityName || def?.displayProperties?.name || 'Unknown Activity';
  }

  getActivityIcon(referenceId: string | number): string {
    if (!this.activityDefs || !referenceId) return '';
    const def = this.activityDefs[referenceId];
    if (!def) return '';
    if (def.icon) {
      return 'https://www.bungie.net' + def.icon;
    }
    return def.displayProperties?.icon ? 'https://www.bungie.net' + def.displayProperties.icon : '';
  }

  isLoaded(): Observable<boolean> {
    return this.manifestLoaded.asObservable();
  }
} 