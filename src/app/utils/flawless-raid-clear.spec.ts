import {
  findFlawlessRaidClearForLabel,
  mergeEarliestFlawlessRaidClear,
  type FlawlessRaidClear,
} from './flawless-raid-clear';

describe('mergeEarliestFlawlessRaidClear', () => {
  it('keeps the earliest clear per base name', () => {
    const byBase = new Map<string, FlawlessRaidClear>();
    mergeEarliestFlawlessRaidClear(byBase, {
      baseName: 'Last Wish',
      instanceId: 'later',
      period: '2020-06-01T00:00:00Z',
    });
    mergeEarliestFlawlessRaidClear(byBase, {
      baseName: 'Last Wish',
      instanceId: 'earlier',
      period: '2019-09-15T00:00:00Z',
    });
    mergeEarliestFlawlessRaidClear(byBase, {
      baseName: 'Garden of Salvation',
      instanceId: 'gos',
      period: '2021-01-01T00:00:00Z',
    });
    expect(byBase.get('Last Wish')?.instanceId).toBe('earlier');
    expect(byBase.get('Garden of Salvation')?.instanceId).toBe('gos');
  });
});

describe('findFlawlessRaidClearForLabel', () => {
  const clears: FlawlessRaidClear[] = [
    { baseName: 'Last Wish', instanceId: 'lw', period: '2019-09-15T00:00:00Z' },
    { baseName: 'Pantheon', instanceId: 'pan', period: '2024-05-01T00:00:00Z' },
  ];

  it('matches Pantheon card labels to scanned clears', () => {
    expect(findFlawlessRaidClearForLabel('The Pantheon', clears)?.instanceId).toBe('pan');
  });

  it('returns null when no family matches', () => {
    expect(findFlawlessRaidClearForLabel('Vault of Glass', clears)).toBeNull();
  });
});
