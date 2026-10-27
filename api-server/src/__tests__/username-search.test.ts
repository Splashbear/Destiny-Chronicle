import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from 'duckdb-async';
import {
  normalizeUsernameSearchKey,
  UsernameSearchService,
  usernameSearchPrefixKey,
} from '../services/username-search.service';

const q = (p: string) => p.replace(/\\/g, '/');

describe('username-search index', () => {
  let tmp: string;
  let names: string;
  let root: string;

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uname-'));
    root = path.join(tmp, 'search_root');
    names = path.join(tmp, 'names.parquet');
    const db = await Database.create(':memory:');
    await db.all(`COPY (SELECT * FROM (VALUES
      (4611686018461937667::BIGINT, 'hollz333', '2019-01-01T00:00:00Z', '2020-10-25T03:13:09Z'),
      (4611686018461937667, 'OldTag', '2018-01-01T00:00:00Z', '2018-06-01T00:00:00Z'),
      (2::BIGINT, 'Splashbear', '2020-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
      (3::BIGINT, 'Private Guardian', '2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z')
    ) t(mid, name, first_seen, last_seen)) TO '${q(names)}' (FORMAT parquet)`);
    await db.close();
  });

  afterAll(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  test('normalize strips accents and bungie codes', () => {
    expect(normalizeUsernameSearchKey('Hóllz333#9999')).toBe('hollz333');
    expect(usernameSearchPrefixKey('hollz333')).toBe('ho');
  });

  test('build + search finds Hollz by prefix; skips Private Guardian', async () => {
    const svc = new UsernameSearchService(root);
    const built = await svc.buildFromNameTable(names);
    expect(built.mids).toBe(2);
    expect(svc.isReady()).toBe(true);

    const hits = await svc.search('hollz');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      membershipId: '4611686018461937667',
      displayName: 'hollz333',
      nameSource: 'archive_index',
    });
    expect(hits[0].lastSeen).toContain('2020-10-25');

    const short = await svc.search('ho');
    expect(short).toEqual([]);

    const none = await svc.search('zzzz');
    expect(none).toEqual([]);
  });

  test('prior name still resolves to latest displayName', async () => {
    const svc = new UsernameSearchService(root);
    if (!svc.isReady()) await svc.buildFromNameTable(names);
    const hits = await svc.search('oldtag');
    expect(hits[0]).toMatchObject({
      membershipId: '4611686018461937667',
      displayName: 'hollz333',
      matchedPriorName: true,
    });
  });
});
