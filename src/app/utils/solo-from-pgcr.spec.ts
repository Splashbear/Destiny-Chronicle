import { flawlessFromPgcr, soloFromPgcr } from './solo-from-pgcr';

describe('soloFromPgcr', () => {
  it('detects solo flawless from Bungie-shaped entries', () => {
    const r = soloFromPgcr({
      entries: [
        {
          player: { destinyUserInfo: { membershipId: '111' } },
          values: { deaths: { basic: { value: 0 } } },
        },
      ],
    });
    expect(r).toEqual({ isSolo: true, isSoloFlawless: true, resolved: true });
  });

  it('detects fireteam (not solo) from multiple memberships', () => {
    const r = soloFromPgcr({
      entries: [
        { player: { destinyUserInfo: { membershipId: '1' } }, values: { deaths: { basic: { value: 0 } } } },
        { player: { destinyUserInfo: { membershipId: '2' } }, values: { deaths: { basic: { value: 0 } } } },
      ],
    });
    expect(r).toEqual({ isSolo: false, isSoloFlawless: false, resolved: true });
  });

  it('falls through empty membership ids on entries to pruned players', () => {
    const r = soloFromPgcr({
      entries: [{ player: { destinyUserInfo: { membershipId: '' } }, values: { deaths: { basic: { value: 0 } } } }],
      players: [{ id: '999', deaths: 0 }],
    });
    expect(r).toEqual({ isSolo: true, isSoloFlawless: true, resolved: true });
  });

  it('returns unresolved when roster has no usable ids', () => {
    const r = soloFromPgcr({
      entries: [{ player: { destinyUserInfo: {} }, values: { deaths: { basic: { value: 0 } } } }],
      players: [{ id: '', deaths: 0 }],
    });
    expect(r.resolved).toBe(false);
  });
});

describe('flawlessFromPgcr', () => {
  it('is true when all deaths are zero', () => {
    expect(
      flawlessFromPgcr({
        players: [
          { deaths: 0 },
          { deaths: 0 },
        ],
      })
    ).toBe(true);
  });

  it('is false when any death exists', () => {
    expect(flawlessFromPgcr({ players: [{ deaths: 1 }] })).toBe(false);
  });
});
