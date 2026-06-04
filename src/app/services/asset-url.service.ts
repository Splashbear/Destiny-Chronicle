import { Injectable } from '@angular/core';
import { BUNGIE_ORIGIN, normalizeBungiePath } from '../utils/archive-hash';
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
    if (
      trimmed.startsWith('assets/') ||
      trimmed.startsWith('blob:') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('http') && !trimmed.includes('bungie.net')
    ) {
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

  /** Resolve icon/pgcr path; returns empty string when input is empty. */
  resolveIcon(pathOrUrl: string | null | undefined): string {
    return this.resolve(pathOrUrl);
  }

  isBungiePath(pathOrUrl: string): boolean {
    return normalizeBungiePath(pathOrUrl) !== null;
  }
}
