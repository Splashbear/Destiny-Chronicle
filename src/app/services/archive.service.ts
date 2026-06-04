import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { environment } from '../../environments/environment';
import { ActivityDbService, FavoriteAccount, StoredActivity } from './activity-db.service';
import { PGCRCacheService } from './pgcr-cache.service';
import { DestinyManifestService } from './destiny-manifest.service';
import { Destiny1ManifestService } from './destiny1-manifest.service';
import { TitleService, TitleItem } from './title.service';
import { ArchiveMediaService } from './archive-media.service';
import { ArchiveRuntimeService } from './archive-runtime.service';
import { LocaleService } from './locale.service';
import { UiI18nService } from './ui-i18n.service';
import {
  ARCHIVE_EXTENSION,
  ARCHIVE_VERSION,
  ArchiveAccount,
  ArchiveAssetMap,
  ArchiveExportOptions,
  ArchiveImportResult,
  ArchiveManifest,
  ArchiveTitlesSnapshot,
  ArchiveBuildResult,
} from '../models/archive.types';
import {
  bungieAbsoluteUrl,
  extensionFromBungiePath,
  hashAssetPath,
  normalizeBungiePath,
} from '../utils/archive-hash';
import { PrunedPgcr } from '../utils/pgcr-prune';

type MediaCategory = 'pgcr' | 'seals' | 'avatars' | 'icons';

interface ArchiveGatherResult {
  manifest: ArchiveManifest;
  assetMap: ArchiveAssetMap;
  favorites: FavoriteAccount[];
  activities: StoredActivity[];
  titlesSnapshot: ArchiveTitlesSnapshot;
  d2ActivityDefs: Record<string, unknown>;
  d2PresentationNodes: Record<string, unknown>;
  pgcrEntries: PrunedPgcr[];
  mediaByBungiePath: Map<string, Blob>;
}

const DEVICE_READY_KEY = 'destinyChronicle.offlineDeviceReady';

@Injectable({ providedIn: 'root' })
export class ArchiveService {
  constructor(
    private http: HttpClient,
    private activityDb: ActivityDbService,
    private pgcrCache: PGCRCacheService,
    private manifest: DestinyManifestService,
    private d1Manifest: Destiny1ManifestService,
    private titleService: TitleService,
    private archiveMedia: ArchiveMediaService,
    private archiveRuntime: ArchiveRuntimeService,
    private locale: LocaleService,
    private i18n: UiI18nService
  ) {}

  private progress(key: string, vars?: Record<string, string | number>): string {
    let s = this.i18n.t(key);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.split(`{${k}}`).join(String(v));
      }
    }
    return s;
  }

  async exportArchive(
    accounts: ArchiveAccount[],
    options: ArchiveExportOptions = {}
  ): Promise<void> {
    const { blob, manifest } = await this.buildArchiveZip(accounts, options);
    if (options.downloadFile !== false) {
      options.onProgress?.(this.progress('archive.progress.savingDownload'), 95);
      const label = accounts[0]?.displayName?.replace(/[^\w.-]+/g, '_') || 'archive';
      saveAs(blob, `${label}${ARCHIVE_EXTENSION}`);
    }
    localStorage.setItem('destinyChronicle.lastExportManifest', JSON.stringify(manifest));
    options.onProgress?.(this.progress('archive.progress.exportComplete'), 100);
  }

  /**
   * Prepare this browser for offline use: cache images, snapshot manifest/titles,
   * enable read-only mode. Does not download a file; keeps existing IndexedDB data.
   */
  async prepareDeviceForOffline(
    accounts: ArchiveAccount[],
    options: ArchiveExportOptions = {}
  ): Promise<ArchiveManifest> {
    const onProgress = options.onProgress ?? (() => undefined);
    onProgress(this.progress('archive.progress.prepareDevice'), 2);
    const gathered = await this.gatherArchiveData(accounts, options);

    onProgress(this.progress('archive.progress.savingImages'), 75);
    await this.archiveMedia.clearAll();
    for (const [bungiePath, blob] of gathered.mediaByBungiePath) {
      await this.archiveMedia.store(bungiePath, blob, blob.type || 'image/jpeg');
    }

    onProgress(this.progress('archive.progress.activatingOffline'), 90);
    this.manifest.loadFromArchive(gathered.d2ActivityDefs, gathered.d2PresentationNodes);
    localStorage.setItem('destinyChronicle.titlesSnapshot', JSON.stringify(gathered.titlesSnapshot));
    this.archiveRuntime.activateOffline(gathered.manifest, gathered.assetMap);
    localStorage.setItem('destinyChronicle.lastExportManifest', JSON.stringify(gathered.manifest));
    localStorage.setItem(DEVICE_READY_KEY, gathered.manifest.frozenAt);
    onProgress(this.progress('archive.progress.readyDevice'), 100);
    return gathered.manifest;
  }

  isDevicePreparedForOffline(): boolean {
    return this.archiveRuntime.isOfflineMode && !!localStorage.getItem(DEVICE_READY_KEY);
  }

  async buildArchiveZip(
    accounts: ArchiveAccount[],
    options: ArchiveExportOptions = {}
  ): Promise<ArchiveBuildResult> {
    const onProgress = options.onProgress ?? (() => undefined);
    const gathered = await this.gatherArchiveData(accounts, options);

    onProgress(this.progress('archive.progress.buildingZip'), 85);
    const zip = new JSZip();
    const { manifest, assetMap, favorites, activities, titlesSnapshot, d2ActivityDefs, d2PresentationNodes, pgcrEntries, mediaByBungiePath } = gathered;

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('asset-map.json', JSON.stringify(assetMap, null, 2));
    zip.file('data/favorites.json', JSON.stringify(favorites, null, 2));
    zip.file('data/activities.json', JSON.stringify(activities));
    zip.file('data/titles-snapshot.json', JSON.stringify(titlesSnapshot, null, 2));
    zip.file('manifest/d2-activity-defs.json', JSON.stringify(d2ActivityDefs));
    zip.file('manifest/d2-presentation-nodes.json', JSON.stringify(d2PresentationNodes));

    if (manifest.includePgcr) {
      const pgcrFolder = zip.folder('data/pgcr');
      for (const entry of pgcrEntries) {
        const id = String(entry.id ?? '');
        if (id) {
          pgcrFolder?.file(`${id.replace(/[/\\|]/g, '_')}.json`, JSON.stringify(entry));
        }
      }
    }

    for (const [bungiePath, blob] of mediaByBungiePath) {
      const rel = assetMap[bungiePath];
      if (rel) {
        zip.file(rel, blob);
      }
    }

    const outBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return { blob: outBlob, manifest };
  }

  private async gatherArchiveData(
    accounts: ArchiveAccount[],
    options: ArchiveExportOptions
  ): Promise<ArchiveGatherResult> {
    const includePgcr = options.includePgcr !== false;
    const onProgress = options.onProgress ?? (() => undefined);
    const membershipFilter = options.membershipIds?.length
      ? new Set(options.membershipIds)
      : null;

    await this.manifest.ensureReadyForArchiveSnapshot();
    const snapshotCulture = this.locale.culture;

    onProgress(this.progress('archive.progress.collectingActivities'), 5);
    let activities = await this.activityDb.activities.toArray();
    if (membershipFilter) {
      activities = activities.filter((a) => membershipFilter.has(String(a.membershipId)));
    }

    onProgress(this.progress('archive.progress.collectingFavorites'), 10);
    const favorites = await this.activityDb.getFavorites();

    onProgress(this.progress('archive.progress.buildingManifestSubset'), 15);
    const referenceIds = new Set<string>();
    for (const act of activities) {
      const ref = act.activityDetails?.referenceId;
      if (ref != null) {
        referenceIds.add(String(ref));
      }
    }

    const d2ActivityDefs: Record<string, unknown> = {};
    const d2PresentationNodes: Record<string, unknown> = {};
    for (const refId of referenceIds) {
      const def = this.manifest.getActivityDefinitionRaw(refId);
      if (def) {
        d2ActivityDefs[refId] = def;
      }
    }
    for (const node of Object.values(this.manifest.getPresentationNodes())) {
      if (node && typeof node === 'object') {
        d2PresentationNodes[String((node as { hash?: number }).hash ?? '')] = node;
      }
    }

    onProgress(this.progress('archive.progress.snapshottingTitles'), 20);
    const titlesSnapshot: ArchiveTitlesSnapshot = {};
    for (const acct of accounts) {
      if (membershipFilter && !membershipFilter.has(acct.membershipId)) {
        continue;
      }
      try {
        const titles = await this.titleService.getPlayerTitles({
          game: acct.game,
          membershipType: acct.membershipType,
          membershipId: acct.membershipId,
          displayName: acct.displayName,
          platform: acct.platform,
        });
        titlesSnapshot[this.membershipKey(acct)] = titles;
      } catch {
        titlesSnapshot[this.membershipKey(acct)] = [];
      }
    }

    onProgress(this.progress('archive.progress.collectingPgcr'), 30);
    const pgcrEntries: PrunedPgcr[] = includePgcr ? await this.pgcrCache.getAllEntries() : [];

    onProgress(this.progress('archive.progress.collectingImageUrls'), 35);
    const urlCategories = this.collectMediaUrls(activities, accounts, titlesSnapshot);

    onProgress(this.progress('archive.progress.downloadingImages', { done: 0, total: 0 }), 40);
    const assetMap: ArchiveAssetMap = {};
    const mediaByBungiePath = new Map<string, Blob>();
    const allUrls = [
      ...[...urlCategories.pgcr].map((p) => ({ path: p, category: 'pgcr' as MediaCategory })),
      ...[...urlCategories.seals].map((p) => ({ path: p, category: 'seals' as MediaCategory })),
      ...[...urlCategories.avatars].map((p) => ({ path: p, category: 'avatars' as MediaCategory })),
      ...[...urlCategories.icons].map((p) => ({ path: p, category: 'icons' as MediaCategory })),
    ];
    let done = 0;
    const concurrency = 6;
    for (let i = 0; i < allUrls.length; i += concurrency) {
      const batch = allUrls.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async ({ path, category }) => {
          try {
            const blob = await firstValueFrom(
              this.http.get(bungieAbsoluteUrl(path), { responseType: 'blob' })
            );
            const ext = extensionFromBungiePath(path);
            const rel = `media/${category}/${hashAssetPath(path)}${ext}`;
            assetMap[path] = rel;
            mediaByBungiePath.set(path, blob);
          } catch {
            /* skip failed CDN fetch */
          }
          done++;
          onProgress(
            this.progress('archive.progress.downloadingImages', { done, total: allUrls.length }),
            40 + (done / Math.max(allUrls.length, 1)) * 40
          );
        })
      );
    }

    const now = new Date().toISOString();
    const manifest: ArchiveManifest = {
      version: ARCHIVE_VERSION,
      frozenAt: now,
      lastSyncedAt: now,
      culture: snapshotCulture,
      accounts,
      includePgcr,
      activityCount: activities.length,
      pgcrCount: pgcrEntries.length,
      mediaCount: mediaByBungiePath.size,
    };

    return {
      manifest,
      assetMap,
      favorites,
      activities,
      titlesSnapshot,
      d2ActivityDefs,
      d2PresentationNodes,
      pgcrEntries,
      mediaByBungiePath,
    };
  }

  /** Ping Bungie to see if live sync is possible. */
  async isBungieReachable(): Promise<boolean> {
    try {
      const headers = new HttpHeaders({ 'X-API-Key': environment.bungie.API_KEY });
      await firstValueFrom(
        this.http.get(`${environment.bungie.API_ROOT}/Destiny2/Manifest/`, {
          headers,
          observe: 'response',
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  /** True if IndexedDB has activities newer than the archive's lastSyncedAt. */
  async hasActivitiesSince(isoDate: string): Promise<boolean> {
    const lastSync = new Date(isoDate).getTime();
    if (Number.isNaN(lastSync)) {
      return true;
    }
    const activities = await this.activityDb.activities.toArray();
    return activities.some((a) => {
      const period = a.period ? new Date(a.period).getTime() : 0;
      return period > lastSync;
    });
  }

  async importArchiveBlob(blob: Blob): Promise<ArchiveImportResult> {
    const file = new File([blob], `refresh${ARCHIVE_EXTENSION}`, { type: 'application/zip' });
    return this.importArchive(file);
  }

  async importArchive(file: File): Promise<ArchiveImportResult> {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as ArchiveManifest;
    const assetMap = JSON.parse(await zip.file('asset-map.json')!.async('string')) as ArchiveAssetMap;

    await this.archiveMedia.clearAll();
    const mediaFolder = zip.folder('media');
    if (mediaFolder) {
      const paths = Object.keys(zip.files).filter((p) => p.startsWith('media/') && !p.endsWith('/'));
      for (const path of paths) {
        const entry = zip.file(path);
        if (!entry) {
          continue;
        }
        const blob = await entry.async('blob');
        const bungiePath = Object.entries(assetMap).find(([, rel]) => rel === path)?.[0];
        if (bungiePath) {
          await this.archiveMedia.store(bungiePath, blob, blob.type || 'image/jpeg');
        }
      }
    }

    const activities = JSON.parse(await zip.file('data/activities.json')!.async('string')) as StoredActivity[];
    await this.activityDb.activities.clear();
    if (activities.length) {
      await this.activityDb.activities.bulkPut(activities);
    }

    const favoritesRaw = zip.file('data/favorites.json');
    if (favoritesRaw) {
      const favorites = JSON.parse(await favoritesRaw.async('string')) as FavoriteAccount[];
      await this.activityDb.favorites.clear();
      if (favorites.length) {
        await this.activityDb.favorites.bulkPut(favorites);
      }
    }

    let importedPgcr = 0;
    const pgcrFolder = zip.folder('data/pgcr');
    if (pgcrFolder && manifest.includePgcr) {
      const pgcrPaths = Object.keys(zip.files).filter((p) => p.startsWith('data/pgcr/') && p.endsWith('.json'));
      const batch: PrunedPgcr[] = [];
      for (const p of pgcrPaths) {
        const entry = zip.file(p);
        if (!entry) {
          continue;
        }
        batch.push(JSON.parse(await entry.async('string')) as PrunedPgcr);
      }
      if (batch.length) {
        await this.pgcrCache.importEntries(batch);
        importedPgcr = batch.length;
      }
    }

    const d2Defs = zip.file('manifest/d2-activity-defs.json');
    const d2Nodes = zip.file('manifest/d2-presentation-nodes.json');
    if (d2Defs && d2Nodes) {
      this.manifest.loadFromArchive(
        JSON.parse(await d2Defs.async('string')),
        JSON.parse(await d2Nodes.async('string'))
      );
    }

    this.archiveRuntime.activateOffline(manifest, assetMap);
    const titlesRaw = zip.file('data/titles-snapshot.json');
    if (titlesRaw) {
      localStorage.setItem('destinyChronicle.titlesSnapshot', await titlesRaw.async('string'));
    }
    localStorage.setItem(DEVICE_READY_KEY, manifest.frozenAt);
    localStorage.setItem('destinyChronicle.lastExportManifest', JSON.stringify(manifest));

    return {
      manifest,
      importedActivities: activities.length,
      importedPgcr,
      importedMedia: Object.keys(assetMap).length,
    };
  }

  async updateArchive(
    accounts: ArchiveAccount[],
    existingManifest: ArchiveManifest | null,
    options: ArchiveExportOptions = {}
  ): Promise<void> {
    let manifest = existingManifest;
    if (!manifest) {
      try {
        const raw = localStorage.getItem('destinyChronicle.lastExportManifest');
        if (raw) {
          manifest = JSON.parse(raw) as ArchiveManifest;
        }
      } catch {
        manifest = null;
      }
    }
    if (!manifest) {
      await this.exportArchive(accounts, options);
      return;
    }
    const lastSync = new Date(manifest.lastSyncedAt).getTime();
    const activities = await this.activityDb.activities.toArray();
    const newActivities = activities.filter((a) => {
      const period = a.period ? new Date(a.period).getTime() : 0;
      return period > lastSync;
    });

    if (newActivities.length === 0) {
      options.onProgress?.(this.progress('archive.upToDate'), 100);
      return;
    }

    await this.exportArchive(accounts, {
      ...options,
      includePgcr: options.includePgcr ?? manifest.includePgcr,
      onProgress: (msg, pct) =>
        options.onProgress?.(this.progress('archive.progress.updatePrefix', { message: msg }), pct),
    });
  }

  exitOfflineMode(): void {
    this.archiveRuntime.deactivateOffline();
    localStorage.removeItem(DEVICE_READY_KEY);
    localStorage.removeItem('destinyChronicle.titlesSnapshot');
  }

  private membershipKey(acct: ArchiveAccount): string {
    return `${acct.game}|${acct.membershipType}|${acct.membershipId}`;
  }

  private collectMediaUrls(
    activities: StoredActivity[],
    accounts: ArchiveAccount[],
    titles: ArchiveTitlesSnapshot
  ): { pgcr: Set<string>; seals: Set<string>; avatars: Set<string>; icons: Set<string> } {
    const pgcr = new Set<string>();
    const seals = new Set<string>();
    const avatars = new Set<string>();
    const icons = new Set<string>();

    const add = (set: Set<string>, url: string | null | undefined) => {
      const p = normalizeBungiePath(url);
      if (p) {
        set.add(p);
      }
    };

    for (const act of activities) {
      const ref = act.activityDetails?.referenceId;
      const mode = act.activityDetails?.mode ?? 0;
      const isD1 = mode <= 4 || (act as StoredActivity & { game?: string }).game === 'D1';
      const img = this.manifest.getActivityPgcrImage(ref, isD1);
      add(pgcr, img);
      const icon = this.manifest.getActivityIcon(ref, isD1);
      add(icons, icon);
    }

    for (const acct of accounts) {
      add(avatars, acct.iconPath);
    }

    for (const rows of Object.values(titles)) {
      for (const row of rows as TitleItem[]) {
        add(seals, row.icon);
        add(seals, row.altIcon);
        add(seals, row.gildedIcon);
      }
    }

    return { pgcr, seals, avatars, icons };
  }
}
