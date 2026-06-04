export const ARCHIVE_VERSION = 1;
export const ARCHIVE_EXTENSION = '.chronicle.zip';

export interface ArchiveAccount {
  membershipId: string;
  membershipType: number;
  displayName: string;
  platform: string;
  game: 'D1' | 'D2';
  iconPath?: string;
}

export interface ArchiveManifest {
  version: number;
  frozenAt: string;
  lastSyncedAt: string;
  /** Bungie manifest culture used for D2 definition strings in this archive (e.g. `es`, `fr`). */
  culture?: string;
  accounts: ArchiveAccount[];
  includePgcr: boolean;
  activityCount: number;
  pgcrCount: number;
  mediaCount: number;
}

export interface ArchiveAssetMap {
  [bungiePath: string]: string;
}

export interface ArchiveTitlesSnapshot {
  [membershipKey: string]: unknown[];
}

export interface ArchiveExportOptions {
  includePgcr?: boolean;
  membershipIds?: string[];
  onProgress?: (message: string, percent: number) => void;
  /** When false, skip browser download (used for in-place refresh). Default true. */
  downloadFile?: boolean;
}

export interface ArchiveBuildResult {
  blob: Blob;
  manifest: ArchiveManifest;
}

export interface ArchiveImportResult {
  manifest: ArchiveManifest;
  importedActivities: number;
  importedPgcr: number;
  importedMedia: number;
}
