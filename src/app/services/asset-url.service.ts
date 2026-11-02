import { Injectable } from '@angular/core';
import { BUNGIE_ORIGIN, isOfficialBungieHost, normalizeBungiePath, parseHttpUrl } from '../utils/archive-hash';
import { isPlaceholderBungieIcon } from '../utils/bungie-icon-path';
import { ArchiveRuntimeService } from './archive-runtime.service';

@Injectable({ providedIn: 'root' })
export class AssetUrlService {
  constructor(private archiveRuntime: ArchiveRuntimeService) {}

  /** Resolve a Bungie CDN path or full URL to a displayable src. */
  resolve(pathOrUrl: string | null | undefined): string {
    if (!pathOrUrl) {
      return '';
    }
    const trimmed = pathOrUrl.trim();
    if (trimmed.startsWith('assets/') || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
      return trimmed;
    }
    const absolute = parseHttpUrl(trimmed);
    if (absolute && !isOfficialBungieHost(absolute.hostname)) {
      return trimmed;
    }

    const bungiePath = normalizeBungiePath(trimmed);
    if (bungiePath) {
      const local = this.archiveRuntime.resolveLocalPath(bungiePath);
      if (local) {
        return local;
      }
      return BUNGIE_ORIGIN + bungiePath;
    }

    if (trimmed.startsWith('http')) {
      return trimmed;
    }
    return trimmed;
  }

  /**
   * Resolve an icon path for display. Empty / Bungie missing_icon placeholders
   * return '' so callers can show a branded fallback instead of a broken img.
   */
  resolveIcon(pathOrUrl: string | null | undefined): string {
    if (!pathOrUrl || isPlaceholderBungieIcon(pathOrUrl)) {
      return '';
    }
    return this.resolve(pathOrUrl);
  }

  isBungiePath(pathOrUrl: string): boolean {
    return normalizeBungiePath(pathOrUrl) !== null;
  }
}
