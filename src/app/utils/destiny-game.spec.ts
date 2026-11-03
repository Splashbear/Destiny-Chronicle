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
    expect(gameFromMembership(2, 0)).toBe('D1');
    expect(gameFromMembership(2, 2)).toBe('D2');
    expect(gameFromMembership(1, 3)).toBe('D2');
    expect(gameFromMembership(3)).toBe('D2');
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
        { membershipType: 2, membershipId: 'b', crossSaveOverride: 2 },
        { membershipType: 3, membershipId: 'c' },
      ],
      { displayName: 'n' }
    );
    expect(d1.map(p => p.membershipId)).toEqual(['a']);
    expect(d2.map(p => p.membershipId)).toEqual(['b', 'c']);
  });
});
