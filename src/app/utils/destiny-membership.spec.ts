import {
  effectiveMembershipType,
  mapLinkedProfilesToD2SearchRows,
  prefixSearchHasDestinyMemberships,
} from './destiny-membership';

describe('destiny-membership', () => {
  it('uses crossSaveOverride when membershipType is 254', () => {
    expect(effectiveMembershipType({ membershipType: 254, crossSaveOverride: 3 })).toBe(3);
  });

  it('keeps Steam membershipType 3', () => {
    expect(effectiveMembershipType({ membershipType: 3, crossSaveOverride: 0 })).toBe(3);
  });

  it('detects empty prefix results', () => {
    expect(prefixSearchHasDestinyMemberships(null)).toBe(false);
    expect(prefixSearchHasDestinyMemberships({ ErrorCode: 1, Response: { searchResults: [] } })).toBe(false);
    expect(prefixSearchHasDestinyMemberships({
      ErrorCode: 1,
      Response: { searchResults: [{ destinyMemberships: [] }] },
    })).toBe(false);
  });

  it('detects usable prefix memberships', () => {
    expect(prefixSearchHasDestinyMemberships({
      ErrorCode: 1,
      Response: {
        searchResults: [{ destinyMemberships: [{ membershipType: 3, membershipId: '1' }] }],
      },
    })).toBe(true);
  });

  it('maps LinkedProfiles rows with platform displayName when Bungie Name is empty', () => {
    const rows = mapLinkedProfilesToD2SearchRows(
      [{
        membershipType: 2,
        membershipId: '4611686018461937667',
        displayName: 'hollz333',
        bungieGlobalDisplayName: '',
        isCrossSavePrimary: false,
        crossSaveOverride: 0,
      }],
      'Hollz333',
    );
    expect(rows).toEqual([{
      displayName: 'hollz333',
      membershipId: '4611686018461937667',
      membershipType: 2,
      game: 'D2',
      isCrossSavePrimary: false,
      crossSaveOverride: 0,
    }]);
  });
});
