import { Injectable } from '@angular/core';
import { openDB, IDBPDatabase } from 'idb';
import { hashAssetPath } from '../utils/archive-hash';

const DB_NAME = 'DestinyChronicleArchiveMedia';
const DB_VERSION = 1;

interface MediaRecord {
  key: string;
  bungiePath: string;
  mimeType: string;
  blob: Blob;
}

@Injectable({ providedIn: 'root' })
export class ArchiveMediaService {
  private dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('media')) {
        db.createObjectStore('media', { keyPath: 'key' });
      }
    },
  });

  private blobUrlCache = new Map<string, string>();

  async clearAll(): Promise<void> {
    for (const url of this.blobUrlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.blobUrlCache.clear();
    const db = await this.dbPromise;
    await db.clear('media');
  }

  async store(bungiePath: string, blob: Blob, mimeType = 'image/jpeg'): Promise<string> {
    const key = hashAssetPath(bungiePath);
    const db = await this.dbPromise;
    await db.put('media', { key, bungiePath, mimeType, blob } satisfies MediaRecord);
    const url = URL.createObjectURL(blob);
    this.blobUrlCache.set(bungiePath, url);
    this.blobUrlCache.set(key, url);
    return url;
  }

  async getBlobUrl(bungiePath: string): Promise<string | undefined> {
    const cached = this.blobUrlCache.get(bungiePath);
    if (cached) {
      return cached;
    }
    const key = hashAssetPath(bungiePath);
    const byKey = this.blobUrlCache.get(key);
    if (byKey) {
      return byKey;
    }
    const db = await this.dbPromise;
    const row = (await db.get('media', key)) as MediaRecord | undefined;
    if (!row?.blob) {
      return undefined;
    }
    const url = URL.createObjectURL(row.blob);
    this.blobUrlCache.set(bungiePath, url);
    this.blobUrlCache.set(key, url);
    return url;
  }

  resolveSync(bungiePath: string): string | undefined {
    return this.blobUrlCache.get(bungiePath) ?? this.blobUrlCache.get(hashAssetPath(bungiePath));
  }

  async count(): Promise<number> {
    const db = await this.dbPromise;
    return db.count('media');
  }
}
