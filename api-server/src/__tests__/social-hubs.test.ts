import {
  filterSocialHubs,
  isSocialHubActivity,
  SOCIAL_HUB_ACTIVITY_HASHES,
} from '../utils/social-hubs';

describe('W6 social hub filter', () => {
  test('mode 40 is always a hub', () => {
    expect(isSocialHubActivity({ mode: 40, activity_hash: 1 })).toBe(true);
  });

  test('mode 0 with Tower hash is a hub', () => {
    expect(isSocialHubActivity({ mode: 0, activity_hash: 3737830648 })).toBe(true);
  });

  test('mode 0 with non-hub hash is kept', () => {
    expect(isSocialHubActivity({ mode: 0, activity_hash: 1148989311 })).toBe(false);
  });

  test('raid/strike modes are kept', () => {
    expect(isSocialHubActivity({ mode: 4, activity_hash: 3737830648 })).toBe(false);
    expect(isSocialHubActivity({ mode: 6, activity_hash: 123 })).toBe(false);
  });

  test('filterSocialHubs counts exclusions', () => {
    const rows = [
      { mode: 4, activity_hash: 1 },
      { mode: 40, activity_hash: 3737830648 },
      { mode: 0, activity_hash: 1771176108 },
      { mode: 2, activity_hash: 99 },
    ];
    const { kept, excluded } = filterSocialHubs(rows);
    expect(excluded).toBe(2);
    expect(kept).toHaveLength(2);
    expect(kept.map((r) => r.mode)).toEqual([4, 2]);
  });

  test('hub hash set includes named hubs from oddity report', () => {
    for (const h of [
      3737830648, 2728138991, 1771176108, 2081550970, 3449580079, 2565561509, 330545737,
      3053411168,
    ]) {
      expect(SOCIAL_HUB_ACTIVITY_HASHES.has(h)).toBe(true);
    }
  });
});
