import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { PgcrOverrideStore } from '../services/pgcr-override.store';

describe('PgcrOverrideStore', () => {
  let tempDir: string;
  let store: PgcrOverrideStore;

  beforeEach(() => {
    tempDir = path.join(__dirname, 'fixtures', 'override_store_test');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const mockPgcr = {
    Response: {
      period: '2025-03-16T21:43:05Z',
      activityDetails: {
        instanceId: '12345678901',
        referenceId: 123456,
        directorActivityHash: 789012,
        mode: 4,
        isPrivate: false,
      },
      entries: [
        {
          player: {
            destinyUserInfo: {
              membershipId: '4611686018443970323',
              membershipType: 3,
              displayName: 'TestPlayer',
            },
          },
          characterId: '2305843009265048922',
          values: {
            deaths: { basic: { value: 10 } },
            kills: { basic: { value: 20 } },
            assists: { basic: { value: 5 } },
            completed: { basic: { value: 1 } },
            activityDurationSeconds: { basic: { value: 600 } },
            standing: { basic: { value: 0 } },
          },
        },
      ],
    },
    ErrorCode: 1,
    ErrorStatus: 'Success',
  };

  it('should initialize empty store', async () => {
    store = new PgcrOverrideStore(tempDir);
    await store.initialize();

    const stats = store.getStats();
    expect(stats.totalOverrides).toBe(0);
    expect(stats.d1Overrides).toBe(0);
    expect(stats.d2Overrides).toBe(0);
    expect(store.isAvailable()).toBe(true);
  });

  it('should create store directory if missing', async () => {
    const newDir = path.join(tempDir, 'new_store');
    store = new PgcrOverrideStore(newDir);
    await store.initialize();

    expect(fs.existsSync(newDir)).toBe(true);
    expect(store.isAvailable()).toBe(true);
  });

  it('should save and retrieve D2 PGCR', async () => {
    store = new PgcrOverrideStore(tempDir);
    await store.initialize();

    const instanceId = '12345678901';
    store.put(instanceId, 'D2', mockPgcr);

    expect(store.exists(instanceId, 'D2')).toBe(true);
    const retrieved = store.get(instanceId, 'D2');
    expect(retrieved).toEqual(mockPgcr);

    const stats = store.getStats();
    expect(stats.totalOverrides).toBe(1);
    expect(stats.d2Overrides).toBe(1);
  });

  it('should save D1 and D2 separately', async () => {
    store = new PgcrOverrideStore(tempDir);
    await store.initialize();

    const instanceId = '1234567890'; // Same ID for both games
    store.put(instanceId, 'D1', { ...mockPgcr, game: 'D1' });
    store.put(instanceId, 'D2', { ...mockPgcr, game: 'D2' });

    expect(store.exists(instanceId, 'D1')).toBe(true);
    expect(store.exists(instanceId, 'D2')).toBe(true);

    const d1Pgcr = store.get(instanceId, 'D1');
    const d2Pgcr = store.get(instanceId, 'D2');
    expect(d1Pgcr.game).toBe('D1');
    expect(d2Pgcr.game).toBe('D2');

    const stats = store.getStats();
    expect(stats.totalOverrides).toBe(2);
    expect(stats.d1Overrides).toBe(1);
    expect(stats.d2Overrides).toBe(1);
  });

  it('should organize files by band', async () => {
    store = new PgcrOverrideStore(tempDir);
    await store.initialize();

    // Instance in band 12 (12000000-12999999)
    store.put('12345678', 'D2', mockPgcr);

    // Instance in band 13 (13000000-13999999)
    store.put('13456789', 'D2', mockPgcr);

    const band12Path = path.join(tempDir, 'D2', '12', '12345678.json.gz');
    const band13Path = path.join(tempDir, 'D2', '13', '13456789.json.gz');

    expect(fs.existsSync(band12Path)).toBe(true);
    expect(fs.existsSync(band13Path)).toBe(true);
  });

  it('should compress stored PGCRs', async () => {
    store = new PgcrOverrideStore(tempDir);
    await store.initialize();

    const instanceId = '12345678901';
    store.put(instanceId, 'D2', mockPgcr);

    const filePath = path.join(tempDir, 'D2', '12345', `${instanceId}.json.gz`);
    const compressed = fs.readFileSync(filePath);
    const decompressed = zlib.gunzipSync(compressed).toString('utf8');
    const parsed = JSON.parse(decompressed);

    expect(parsed).toEqual(mockPgcr);
    expect(compressed.length).toBeLessThan(decompressed.length);
  });

  it('should return null for non-existent override', async () => {
    store = new PgcrOverrideStore(tempDir);
    await store.initialize();

    expect(store.exists('99999999', 'D2')).toBe(false);
    expect(store.get('99999999', 'D2')).toBe(null);

    const stats = store.getStats();
    expect(stats.cacheMisses).toBe(1);
  });

  it('should track cache hits', async () => {
    store = new PgcrOverrideStore(tempDir);
    await store.initialize();

    const instanceId = '12345678901';
    store.put(instanceId, 'D2', mockPgcr);

    // First get
    store.get(instanceId, 'D2');
    let stats = store.getStats();
    expect(stats.cacheHits).toBe(1);

    // Second get
    store.get(instanceId, 'D2');
    stats = store.getStats();
    expect(stats.cacheHits).toBe(2);
  });

  it('should handle invalid instance IDs', async () => {
    store = new PgcrOverrideStore(tempDir);
    await store.initialize();

    expect(store.exists('', 'D2')).toBe(false);
    expect(store.exists('abc', 'D2')).toBe(false);
    expect(store.get('', 'D2')).toBe(null);
    expect(store.get('abc', 'D2')).toBe(null);

    // Should not crash
    store.put('', 'D2', mockPgcr);
    store.put('abc', 'D2', mockPgcr);
  });

  it('should count existing overrides on init', async () => {
    // Manually create some overrides
    const d2Dir = path.join(tempDir, 'D2', '12');
    fs.mkdirSync(d2Dir, { recursive: true });
    
    for (let i = 0; i < 5; i++) {
      const instanceId = `12${String(i).padStart(6, '0')}000`;
      const filePath = path.join(d2Dir, `${instanceId}.json.gz`);
      fs.writeFileSync(filePath, zlib.gzipSync(JSON.stringify(mockPgcr)));
    }

    const d1Dir = path.join(tempDir, 'D1', '5');
    fs.mkdirSync(d1Dir, { recursive: true });
    
    for (let i = 0; i < 3; i++) {
      const instanceId = `5${String(i).padStart(6, '0')}000`;
      const filePath = path.join(d1Dir, `${instanceId}.json.gz`);
      fs.writeFileSync(filePath, zlib.gzipSync(JSON.stringify(mockPgcr)));
    }

    // Initialize and check counts
    store = new PgcrOverrideStore(tempDir);
    await store.initialize();

    const stats = store.getStats();
    expect(stats.totalOverrides).toBe(8);
    expect(stats.d2Overrides).toBe(5);
    expect(stats.d1Overrides).toBe(3);
  });

  it('should estimate storage cost', async () => {
    store = new PgcrOverrideStore(tempDir);
    await store.initialize();

    // Default estimate when no files
    const estimate1 = store.estimateStorageCost();
    expect(estimate1).toBeGreaterThan(0);

    // Add some overrides
    for (let i = 0; i < 10; i++) {
      const instanceId = `1234567890${i}`;
      store.put(instanceId, 'D2', mockPgcr);
    }

    // Estimate should be based on actual files
    const estimate2 = store.estimateStorageCost();
    expect(estimate2).toBeGreaterThan(0);
    expect(estimate2).toBeLessThan(20000); // Compressed PGCR should be < 20KB
  });

  it('should handle concurrent writes with tmp files', async () => {
    store = new PgcrOverrideStore(tempDir);
    await store.initialize();

    const instanceId = '12345678901';
    
    // Simulate concurrent writes (same instance)
    store.put(instanceId, 'D2', { ...mockPgcr, version: 1 });
    store.put(instanceId, 'D2', { ...mockPgcr, version: 2 });

    // Should not leave tmp files
    const bandDir = path.join(tempDir, 'D2', '12345');
    const files = fs.readdirSync(bandDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp'));
    expect(tmpFiles.length).toBe(0);

    // Latest write wins
    const retrieved = store.get(instanceId, 'D2');
    expect(retrieved.version).toBe(2);
  });
});
