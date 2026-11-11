import {
  breakdownAccountIdentity,
  breakdownActivityDedupeKey,
  breakdownIdentityByMembership,
} from './breakdown-account-identity';

describe('breakdownAccountIdentity', () => {
  it('keeps D1 memberships distinct', () => {
    expect(
      breakdownAccountIdentity({ game: 'D1', membershipId: 'ps', displayName: 'splashbear' })
    ).not.toBe(
      breakdownAccountIdentity({ game: 'D1', membershipId: 'xbox', displayName: 'splashbear' })
    );
  });

  it('treats linked D2 platforms as one guardian', () => {
    const ps = breakdownAccountIdentity({
      game: 'D2',
      membershipId: 'ps',
      bungieGlobalDisplayName: 'Splashbear',
      bungieGlobalDisplayNameCode: 1078,
    });
    const steam = breakdownAccountIdentity({
      game: 'D2',
      membershipId: 'steam',
      displayName: 'Splashbear#1078',
    });
    expect(ps).toBe('D2:splashbear#1078');
    expect(steam).toBe(ps);
  });
});

describe('breakdownIdentityByMembership', () => {
  it('maps each membership to its identity', () => {
    const map = breakdownIdentityByMembership([
      { game: 'D2', membershipId: 'ps', displayName: 'Splashbear#1078' },
      { game: 'D2', membershipId: 'steam', displayName: 'Splashbear#1078' },
    ]);
    expect(map['ps']).toBe(map['steam']);
  });

  it('does not let D1 overwrite a shared mid that already has D2 identity', () => {
    const map = breakdownIdentityByMembership([
      { game: 'D2', membershipId: 'ps', displayName: 'Splashbear#1078' },
      { game: 'D1', membershipId: 'ps', displayName: 'splashbear' },
      { game: 'D2', membershipId: 'steam', displayName: 'Splashbear#1078' },
    ]);
    expect(map['ps']).toBe('D2:splashbear#1078');
    expect(map['ps']).toBe(map['steam']);
  });
});

describe('breakdownActivityDedupeKey', () => {
  it('collapses the same instance across linked memberships', () => {
    const identity = { ps: 'D2:splashbear#1078', steam: 'D2:splashbear#1078' };
    const a = breakdownActivityDedupeKey(
      { membershipId: 'ps', game: 'D2', activityDetails: { instanceId: 'raid-1' } },
      identity
    );
    const b = breakdownActivityDedupeKey(
      { membershipId: 'steam', game: 'D2', activityDetails: { instanceId: 'raid-1' } },
      identity
    );
    expect(a).toBe(b);
  });

  it('keeps the same instance on two different bungie accounts', () => {
    const identity = { splash: 'D2:splashbear#1078', puddle: 'D2:puddlecubbs#' };
    const a = breakdownActivityDedupeKey(
      { membershipId: 'splash', game: 'D2', activityDetails: { instanceId: 'raid-1' } },
      identity
    );
    const b = breakdownActivityDedupeKey(
      { membershipId: 'puddle', game: 'D2', activityDetails: { instanceId: 'raid-1' } },
      identity
    );
    expect(a).not.toBe(b);
  });

  it('does not treat a D1 instance as the same D2 cross-save game, even when the mid is shared', () => {
    const identity = { ps: 'D2:splashbear#1078' };
    const d1 = breakdownActivityDedupeKey(
      { membershipId: 'ps', game: 'D1', activityDetails: { instanceId: '1001' } },
      identity
    );
    const d2 = breakdownActivityDedupeKey(
      { membershipId: 'ps', game: 'D2', activityDetails: { instanceId: '1001' } },
      identity
    );
    expect(d1).toContain('|D1|');
    expect(d2).toContain('|D2|');
    expect(d1).not.toBe(d2);
  });

  it('does not treat a bare display name as a linked identity', () => {
    const a = breakdownAccountIdentity({ game: 'D2', membershipId: 'mid-a', displayName: 'splashbear' });
    const b = breakdownAccountIdentity({ game: 'D2', membershipId: 'mid-b', displayName: 'splashbear' });
    expect(a).toBe('D2:mid-a');
    expect(b).toBe('D2:mid-b');
    expect(a).not.toBe(b);
  });
});
