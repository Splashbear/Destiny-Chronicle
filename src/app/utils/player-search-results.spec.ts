import {
  dedupePlayerSearchDisplay,
  mapD1SearchPlayers,
  mapD2PrefixSearchResults,
  mapMembershipsByIdResponse,
  mapSearchAllGamesToBundle,
  pickCrossSavePlayer,
  pickSoleSearchPlayer,
} from './player-search-results';
import { PlayerSearchDisplay } from '../models/player-search-display.model';

function d2(partial: Partial<PlayerSearchDisplay> & { membershipId: string }): PlayerSearchDisplay {
  return {
    displayName: partial.displayName || 'P',
    membershipId: partial.membershipId,
    membershipType: partial.membershipType ?? 2,
    game: 'D2',
    platform: partial.platform || 'PlayStation',
    isCrossSavePrimary: partial.isCrossSavePrimary,
    crossSaveOverride: partial.crossSaveOverride,
  } as PlayerSearchDisplay;
}

describe('player-search-results', () => {
  it('dedupes by game|membershipId', () => {
    const a = d2({ membershipId: '1' });
    const b = d2({ membershipId: '1', displayName: 'dup' });
    const c = d2({ membershipId: '2' });
    expect(dedupePlayerSearchDisplay([a, b, c]).map(p => p.membershipId)).toEqual(['1', '2']);
  });

  it('maps D1 xbox+psn with game D1', () => {
    const rows = mapD1SearchPlayers(
      [{ displayName: 'x', membershipId: '1', membershipType: 1 }],
      [{ displayName: 'p', membershipId: '2', membershipType: 2 }]
    );
    expect(rows.map(r => r.game)).toEqual(['D1', 'D1']);
    expect(rows[0].platform).toBe('Xbox');
    expect(rows[1].platform).toBe('PlayStation');
  });

  it('maps prefix search results and picks primary cross-save', () => {
    const d2rows = mapD2PrefixSearchResults([
      {
        bungieGlobalDisplayName: 'Splash',
        bungieGlobalDisplayNameCode: 1078,
        destinyMemberships: [
          {
            membershipId: '10',
            membershipType: 2,
            isCrossSavePrimary: true,
            crossSaveOverride: 2,
          },
          {
            membershipId: '11',
            membershipType: 3,
            isCrossSavePrimary: false,
            crossSaveOverride: 2,
          },
        ],
      },
    ]);
    expect(d2rows.length).toBe(2);
    expect(d2rows[0].displayName).toBe('Splash#1078');
    expect(pickCrossSavePlayer(d2rows, 'primary')?.membershipId).toBe('10');
  });

  it('maps SearchAllGames DestinyPlayer array with override cross-save', () => {
    const bundle = mapSearchAllGamesToBundle(
      'splashbear',
      {
        ErrorCode: 1,
        Response: [
          { displayName: 'A', membershipId: '1', membershipType: 2, crossSaveOverride: 2 },
          { displayName: 'B', membershipId: '2', membershipType: 3, crossSaveOverride: 0 },
        ],
      },
      [],
      []
    );
    expect(bundle.d2.length).toBe(2);
    expect(bundle.crossSave?.membershipId).toBe('1');
  });

  it('maps memberships-by-id into D1 vs D2', () => {
    const bundle = mapMembershipsByIdResponse(
      [
        { membershipId: 'd1', membershipType: 2, displayName: 'Old', crossSaveOverride: 0 },
        {
          membershipId: 'd2',
          membershipType: 2,
          displayName: 'New',
          crossSaveOverride: 2,
          isCrossSavePrimary: true,
        },
      ],
      { displayName: 'Net' }
    );
    expect(bundle.d1.map(p => p.membershipId)).toEqual(['d1']);
    expect(bundle.d2.map(p => p.membershipId)).toEqual(['d2']);
    expect(bundle.crossSave?.membershipId).toBe('d2');
    expect(pickSoleSearchPlayer(bundle.d1, bundle.d2, bundle.crossSave)?.membershipId).toBe('d2');
  });
});
