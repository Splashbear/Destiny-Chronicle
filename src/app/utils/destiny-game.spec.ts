import {
  D1_MAX_INSTANCE_ID,
  gameFromInstanceId,
  gameFromMembership,
  gameFromPgcrShape,
  isD1,
  normalizeGame,
  resolveGame,
  resolveGameDetailed,
} from './destiny-game';
import { isD1Player } from './is-d1-player';
import { isD1PgcrShape, prunePgcr } from './pgcr-prune';
import { mapMembershipsByIdResponse } from './player-search-results';

const D2_PGCR = {
  period: '2024-05-01T00:00:00Z',
  activityDetails: { referenceId: 1, directorActivityHash: 2, instanceId: '14000000000', mode: 4, modes: [4] },
  entries: [{ player: { destinyUserInfo: { membershipId: '1' } }, values: {} }],
};
const D1_PGCR = {
  data: {
    period: '2015-01-01T00:00:00Z',
    activityDetails: { referenceId: 1, instanceId: '1500000000', mode: 4 },
    entries: [{ player: { destinyUserInfo: { membershipId: '2' } }, values: {} }],
  },
};

describe('destiny-game', () => {
  it('prefers explicit game over every other evidence, case-insensitively', () => {
    expect(resolveGameDetailed({ game: 'D1', membershipType: 3, instanceId: '14000000000' }))
      .toEqual({ game: 'D1', source: 'explicit' });
    expect(resolveGameDetailed({ game: 'd2', instanceId: '5' })).toEqual({ game: 'D2', source: 'explicit' });
  });

  it('uses PGCR shape next (D2 markers first, D1 envelope / legacy shape)', () => {
    expect(gameFromPgcrShape(D2_PGCR)).toBe('D2');
    expect(gameFromPgcrShape(D1_PGCR)).toBe('D1');
    expect(gameFromPgcrShape({ activityDetails: { instanceId: '1' }, entries: [{}] })).toBe('D1');
    expect(gameFromPgcrShape({})).toBeNull();
    expect(resolveGameDetailed({ pgcr: D2_PGCR, instanceId: '5' }).source).toBe('pgcr-shape');
  });

  it('instance id band only proves D1; ids above it give no verdict', () => {
    expect(gameFromInstanceId('1500000000')).toBe('D1');
    expect(gameFromInstanceId(D1_MAX_INSTANCE_ID)).toBe('D1');
    expect(gameFromInstanceId(D1_MAX_INSTANCE_ID + 1)).toBeNull();
    expect(gameFromInstanceId('0')).toBeNull();
    expect(gameFromInstanceId('abc')).toBeNull();
    // A recent D1 activity (id far above the band) is not turned into D2 by id alone.
    expect(resolveGameDetailed({ instanceId: '5000000000', membershipType: 2 })).toEqual({
      game: 'D1',
      source: 'membership-type',
    });
  });

  it('membership rules: only Xbox/PSN without cross-save override is D1', () => {
    expect(gameFromMembership(1)).toBe('D1');
    expect(gameFromMembership(2)).toBe('D1');
    // Cross-save fields alone never prove D2 on Xbox/PSN.
    expect(gameFromMembership(2, { crossSaveOverride: 2 })).toBe('D1');
    expect(gameFromMembership(1, { crossSaveOverride: 3 })).toBe('D1');
    expect(gameFromMembership(2, { applicableMembershipTypes: [1, 2, 3] })).toBe('D1');
    // ...but do when the record is otherwise clearly D2.
    expect(gameFromMembership(2, { crossSaveOverride: 1, fromD2Endpoint: true })).toBe('D2');
    expect(gameFromMembership(2, { crossSaveOverride: 1, bungieGlobalDisplayNameCode: 4164 })).toBe('D2');
    expect(gameFromMembership(1, { applicableMembershipTypes: [1, 2, 3], fromD2Endpoint: true })).toBe('D2');
    // Corroboration without any cross-save fields is still D1 on 1/2.
    expect(gameFromMembership(2, { fromD2Endpoint: true })).toBe('D1');
    expect(gameFromMembership(2, { bungieGlobalDisplayNameCode: 1234 })).toBe('D1');
    expect(gameFromMembership(2, { crossSaveOverride: 1, bungieGlobalDisplayNameCode: 0 })).toBe('D1');
    expect(gameFromMembership(3)).toBe('D2');
    expect(gameFromMembership(3, { crossSaveOverride: 1 })).toBe('D2');
    expect(gameFromMembership(254)).toBe('D2');
    expect(gameFromMembership(undefined)).toBeNull();
  });

  it('falls back to D2 (or the caller fallback) with no evidence and has no date cutoff', () => {
    expect(resolveGame({})).toBe('D2');
    expect(resolveGame(null)).toBe('D2');
    expect(resolveGame({ fallback: 'D1' })).toBe('D1');
    expect(isD1({ game: 'D1' })).toBe(true);
    expect(normalizeGame('D1')).toBe('D1');
    expect(normalizeGame('nope')).toBe('D2');
  });

  it('call sites agree with the helper', () => {
    expect(isD1Player({ membershipType: 2, displayName: 'x' })).toBe(true);
    expect(isD1Player({ membershipType: 3 })).toBe(false);
    expect(isD1PgcrShape(D2_PGCR)).toBe(false);
    expect(isD1PgcrShape(D1_PGCR)).toBe(true);
    expect(prunePgcr(D2_PGCR, '1').id).toBe('14000000000');
    const { d1, d2 } = mapMembershipsByIdResponse(
      [
        { membershipType: 1, membershipId: 'a' },
        { membershipType: 2, membershipId: 'b', crossSaveOverride: 1 },
        { membershipType: 3, membershipId: 'c' },
      ],
      { displayName: 'n' }
    );
    expect(d1.map(p => p.membershipId)).toEqual(['a']);
    expect(d2.map(p => p.membershipId)).toEqual(['b', 'c']);
  });
  describe('Puddlecubs-style accounts (D1 PSN vs cross-saved D2 PSN/Xbox/Steam)', () => {
    const D1_PSN = { membershipType: 2, membershipId: '4611686018400004164', displayName: 'Puddlecubs' };

    it('D1 PSN profile with and without cross-save fields stays D1', () => {
      expect(resolveGame({ ...D1_PSN })).toBe('D1');
      expect(resolveGame({ ...D1_PSN, crossSaveOverride: 1 })).toBe('D1');
      expect(resolveGame({ ...D1_PSN, crossSaveOverride: 1, applicableMembershipTypes: [1, 2, 3] })).toBe('D1');
      expect(isD1Player({ ...D1_PSN })).toBe(true);
      expect(isD1Player({ ...D1_PSN, crossSaveOverride: 1, applicableMembershipTypes: [1, 2, 3] })).toBe(true);
      expect(isD1Player({ ...D1_PSN, crossSaveOverride: 1, isCrossSavePrimary: true, bungieGlobalDisplayName: 'Puddlecubs' })).toBe(true);
    });

    it('D2 PSN / Xbox / Steam with the override stay D2 (Xbox is the cross-save primary)', () => {
      const withCode = { crossSaveOverride: 1, applicableMembershipTypes: [1, 2, 3], bungieGlobalDisplayNameCode: 4164 };
      expect(resolveGame({ membershipType: 1, ...withCode })).toBe('D2');
      expect(resolveGame({ membershipType: 2, ...withCode })).toBe('D2');
      expect(resolveGame({ membershipType: 3, ...withCode })).toBe('D2');
      expect(resolveGame({ membershipType: 2, crossSaveOverride: 1, fromD2Endpoint: true })).toBe('D2');
      expect(isD1Player({ membershipType: 2, ...withCode })).toBe(false);
      expect(isD1Player({ membershipType: 3 })).toBe(false);
    });

    it('explicit game always wins over cross-save fields', () => {
      expect(resolveGame({ game: 'D1', membershipType: 2, crossSaveOverride: 1, bungieGlobalDisplayNameCode: 4164, fromD2Endpoint: true })).toBe('D1');
      expect(resolveGame({ game: 'D2', membershipType: 2 })).toBe('D2');
      expect(isD1Player({ game: 'D1', membershipType: 2, crossSaveOverride: 1, bungieGlobalDisplayNameCode: 4164 })).toBe(true);
      expect(isD1Player({ game: 'D2', membershipType: 2 })).toBe(false);
    });

    it('D1 game ids stay D1', () => {
      expect(resolveGame({ instanceId: '1500000000', membershipType: 2, crossSaveOverride: 1, fromD2Endpoint: true })).toBe('D1');
      expect(resolveGame({ instanceId: 2_000_000_000, crossSaveOverride: 1, bungieGlobalDisplayNameCode: 4164, membershipType: 1 })).toBe('D1');
      // Recent D1 ids above the band are not turned into D2 by cross-save fields.
      expect(resolveGame({ instanceId: '5000000000', membershipType: 2, crossSaveOverride: 1 })).toBe('D1');
    });

    it('GetMembershipsById: D2 rows go to d2, a D1 PSN row without cross-save stays in d1', () => {
      const { d1, d2 } = mapMembershipsByIdResponse(
        [
          { membershipType: 1, membershipId: 'x', crossSaveOverride: 1, applicableMembershipTypes: [1, 2, 3], isCrossSavePrimary: true },
          { membershipType: 2, membershipId: 'p', crossSaveOverride: 1 },
          { membershipType: 3, membershipId: 's', crossSaveOverride: 1 },
          { membershipType: 2, membershipId: '4164' },
        ],
        { displayName: 'Puddlecubs' }
      );
      expect(d2.map(p => p.membershipId)).toEqual(['x', 'p', 's']);
      expect(d1.map(p => p.membershipId)).toEqual(['4164']);
      expect(d1[0].game).toBe('D1');
      expect(d2.every(p => p.game === 'D2')).toBe(true);
    });
  });
});
