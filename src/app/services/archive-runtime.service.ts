import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { ArchiveAssetMap, ArchiveManifest } from '../models/archive.types';
import { ArchiveMediaService } from './archive-media.service';
import { LocaleService } from './locale.service';
import { hashAssetPath } from '../utils/archive-hash';

const STORAGE_KEY = 'destinyChronicle.offlineArchive';
const ASSET_MAP_KEY = 'destinyChronicle.offlineAssetMap';

@Injectable({ providedIn: 'root' })
export class ArchiveRuntimeService {
  private manifest: ArchiveManifest | null = null;
  private assetMap: ArchiveAssetMap = {};
  /** Temporarily allow Bungie API calls while viewing an offline archive (update check). */
  private onlineSyncSession = false;
  readonly state$ = new BehaviorSubject<{ offline: boolean; manifest: ArchiveManifest | null; syncing: boolean }>({
    offline: false,
    manifest: null,
    syncing: false,
  });

  constructor(
    private media: ArchiveMediaService,
    private locale: LocaleService
  ) {
    this.restoreFromStorage();
  }

  get isOfflineMode(): boolean {
    return !!environment.offlineMode || !!this.manifest;
  }

  get isReadOnly(): boolean {
    return this.isOfflineMode && !this.onlineSyncSession;
  }

  /** True while a "check for updates" session is syncing from Bungie. */
  get isOnlineSyncSession(): boolean {
    return this.onlineSyncSession;
  }

  /** When true, live Bungie calls are allowed even though an archive is loaded. */
  get allowLiveApi(): boolean {
    return !this.isOfflineMode || this.onlineSyncSession;
  }

  beginOnlineSyncSession(): void {
    this.onlineSyncSession = true;
    this.emit();
  }

  endOnlineSyncSession(): void {
    this.onlineSyncSession = false;
    this.emit();
  }

  get archiveManifest(): ArchiveManifest | null {
    return this.manifest;
  }

  get frozenAtLabel(): string | null {
    if (!this.manifest?.frozenAt) {
      return null;
    }
    try {
      return new Date(this.manifest.frozenAt).toLocaleDateString(this.locale.intlLocale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return this.manifest.frozenAt;
    }
  }

  get assetMapSnapshot(): ArchiveAssetMap {
    return { ...this.assetMap };
  }

  async preloadMedia(): Promise<void> {
    const paths = Object.keys(this.assetMap);
    await Promise.all(paths.map((p) => this.media.getBlobUrl(p)));
  }

  private restoreFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const mapRaw = localStorage.getItem(ASSET_MAP_KEY);
      if (raw) {
        this.manifest = JSON.parse(raw) as ArchiveManifest;
      }
      if (mapRaw) {
        this.assetMap = JSON.parse(mapRaw) as ArchiveAssetMap;
      }
      this.emit();
    } catch {
      this.manifest = null;
      this.assetMap = {};
    }
  }

  activateOffline(manifest: ArchiveManifest, assetMap: ArchiveAssetMap): void {
    this.manifest = manifest;
    this.assetMap = assetMap;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(manifest));
    localStorage.setItem(ASSET_MAP_KEY, JSON.stringify(assetMap));
    this.emit();
  }

  deactivateOffline(): void {
    this.manifest = null;
    this.assetMap = {};
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ASSET_MAP_KEY);
    this.emit();
  }

  resolveLocalPath(bungiePath: string): string | undefined {
    const rel = this.assetMap[bungiePath];
    if (!rel) {
      return this.media.resolveSync(bungiePath);
    }
    return this.media.resolveSync(bungiePath);
  }

  async resolveLocalPathAsync(bungiePath: string): Promise<string | undefined> {
    if (this.assetMap[bungiePath]) {
      return this.media.getBlobUrl(bungiePath);
    }
    return this.media.getBlobUrl(bungiePath);
  }

  mediaRelativePath(bungiePath: string, category: 'pgcr' | 'seals' | 'avatars' | 'icons', ext: string): string {
    return `media/${category}/${hashAssetPath(bungiePath)}${ext}`;
  }

  private emit(): void {
    this.state$.next({
      offline: this.isOfflineMode,
      manifest: this.manifest,
      syncing: this.onlineSyncSession,
    });
  }
}
