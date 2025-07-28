import { Injectable } from '@angular/core';
import { compressToEncodedURIComponent as compress, decompressFromEncodedURIComponent as decompress } from 'lz-string';

@Injectable({ providedIn: 'root' })
export class ShareService {
  /** Build share link fragment from given state */
  generateHash(state: any): string {
    const json = JSON.stringify(state);
    return compress(json); // url-safe & compressed
  }

  parseHash(hash: string): any | null {
    try {
      const json = decompress(hash);
      if (!json) return null;
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  buildLink(state: any): string {
    return `${location.origin}${location.pathname}#share=${this.generateHash(state)}`;
  }
} 