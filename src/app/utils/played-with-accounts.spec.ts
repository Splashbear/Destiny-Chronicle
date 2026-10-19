import { d2PlayedWithAccounts, d2PlayedWithMembershipIds } from './played-with-accounts';

describe('d2PlayedWithMembershipIds', () => {
  it('keeps Destiny 2 profiles and drops a Destiny 1-only membership', () => {
    expect(d2PlayedWithMembershipIds([
      { membershipId: '4611686018429785995', game: 'D2' },
      { membershipId: '4611686018429785995', game: 'D1' },
      { membershipId: '4611686018465122437', game: 'D2' },
      { membershipId: '4611686018465122437', game: 'D1' },
      { membershipId: '4611686018467188288', game: 'D2' },
      { membershipId: '4611686018452484164', game: 'D1' }
    ])).toEqual([
      '4611686018429785995',
      '4611686018465122437',
      '4611686018467188288'
    ]);
  });

  it('labels the Destiny 2 account from the loaded profile', () => {
    expect(d2PlayedWithAccounts([
      { membershipId: '4611686018465122437', game: 'D2', displayName: 'Splashbear#1078', platform: 'PSN' },
      { membershipId: '4611686018452484164', game: 'D1', displayName: 'puddlecubs', platform: 'PSN' }
    ])).toEqual([{ id: '4611686018465122437', label: 'Splashbear#1078 (PSN)' }]);
  });

  it('returns nothing when every selected profile is Destiny 1', () => {
    expect(d2PlayedWithMembershipIds([
      { membershipId: '4611686018452484164', game: 'D1' }
    ])).toEqual([]);
  });
});
