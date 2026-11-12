import { ManifestCacheService } from './manifest-cache.service';

function ensureLocalStorage(): void {
  if (typeof globalThis.localStorage !== 'undefined') return;
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
}

describe('ManifestCacheService IndexedDB migration', () => {
  beforeEach(() => {
    ensureLocalStorage();
    try {
      localStorage.setItem(ManifestCacheService.LEGACY_LOCAL_STORAGE_KEY, '{"old":true}');
    } catch {
      // ignore
    }
  });

  it('removes the legacy localStorage blob on construct', async () => {
    const svc = new ManifestCacheService();
    expect(localStorage.getItem(ManifestCacheService.LEGACY_LOCAL_STORAGE_KEY)).toBeNull();
    await svc.clearCache();
  });

  it('serves hot reads from the in-memory mirror after cacheManifestData', async () => {
    const svc = new ManifestCacheService();
    const key = svc.manifestComponentKey('v1', 'en', 'DestinyActivityDefinition');
    await svc.cacheManifestData(key, { hello: 'world' });
    const hit = await svc.getManifestData(key);
    expect(hit).toEqual({ hello: 'world' });
    await svc.clearCache();
    expect(await svc.getManifestData(key)).toBeNull();
  });
});
