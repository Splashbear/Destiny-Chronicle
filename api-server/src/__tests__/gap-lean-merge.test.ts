import * as fs from 'fs/promises';
import * as path from 'path';
import { ArchiveService } from '../services/archive.service';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'gap-lean');

describe('Option A gap lean dual-root', () => {
  let gapRoot: string;
  let compactRoot: string;

  beforeAll(async () => {
    gapRoot = path.join(FIXTURES_DIR, 'ready');
    compactRoot = path.join(FIXTURES_DIR, 'compact');
    await fs.mkdir(gapRoot, { recursive: true });
    await fs.mkdir(compactRoot, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  it('keeps gap lean disabled by default', () => {
    const svc = new ArchiveService('', '', '', '', compactRoot);
    expect(svc.isGapLeanEnabled()).toBe(false);
  });

  it('enables gap lean only when root + flag set', () => {
    const off = new ArchiveService('', '', '', '', compactRoot, gapRoot, false);
    expect(off.isGapLeanEnabled()).toBe(false);
    const on = new ArchiveService('', '', '', '', compactRoot, gapRoot, true);
    expect(on.isGapLeanEnabled()).toBe(true);
    expect(on.getGapIndexRoot()).toBe(gapRoot);
  });

  it('does not enable when flag true but root empty', () => {
    const svc = new ArchiveService('', '', '', '', compactRoot, '', true);
    expect(svc.isGapLeanEnabled()).toBe(false);
  });
});
