import { loadConfig } from '../utils/config';

describe('GAP_INDEX_EXTRA_ROOTS config', () => {
  const saved = process.env.GAP_INDEX_EXTRA_ROOTS;
  afterEach(() => {
    if (saved === undefined) delete process.env.GAP_INDEX_EXTRA_ROOTS;
    else process.env.GAP_INDEX_EXTRA_ROOTS = saved;
  });

  it('defaults to no extra roots', () => {
    delete process.env.GAP_INDEX_EXTRA_ROOTS;
    expect(loadConfig().gapIndexExtraRoots).toEqual([]);
  });

  it('parses a semicolon-separated list', () => {
    process.env.GAP_INDEX_EXTRA_ROOTS = 'D:\\a;D:\\b';
    expect(loadConfig().gapIndexExtraRoots).toEqual(['D:\\a', 'D:\\b']);
  });
});