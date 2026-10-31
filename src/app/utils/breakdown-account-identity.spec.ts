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
});
