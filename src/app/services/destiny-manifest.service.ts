import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Destiny1ManifestService } from './destiny1-manifest.service';

@Injectable({
  providedIn: 'root'
})
export class DestinyManifestService {
  private activityDefs: { [key: string]: any } = {};
  private manifestLoaded = new BehaviorSubject<boolean>(false);

  constructor(
    private http: HttpClient,
    private d1Manifest: Destiny1ManifestService
  ) {
    this.loadManifest();
  }

  async loadManifest() {
    try {
      // Step 1: Get manifest metadata
      const manifestMeta: any = await firstValueFrom(this.http.get('https://www.bungie.net/Platform/Destiny2/Manifest/'));
      const enPath = manifestMeta.Response.jsonWorldComponentContentPaths.en.DestinyActivityDefinition;
      // Step 2: Get activity definitions
      this.activityDefs = await firstValueFrom(this.http.get('https://www.bungie.net' + enPath));
      this.manifestLoaded.next(true);
    } catch (error) {
      console.error('Error loading D2 manifest:', error);
      this.manifestLoaded.next(false);
    }
  }

  getActivityName(referenceId: string | number, isD1: boolean = false): string {
    if (isD1) {
      return this.d1Manifest.getActivityName(referenceId);
    }
    if (!this.activityDefs) return '';
    const def = this.activityDefs[referenceId];
    return def ? def.displayProperties?.name : '';
  }

  getActivityIcon(referenceId: string | number, isD1: boolean = false): string {
    if (isD1) {
      return this.d1Manifest.getActivityIcon(referenceId);
    }
    if (!this.activityDefs) return '';
    const def = this.activityDefs[referenceId];
    return def && def.displayProperties?.icon ? 'https://www.bungie.net' + def.displayProperties.icon : '';
  }

  isLoaded(): Observable<boolean> {
    return this.manifestLoaded.asObservable();
  }
} 