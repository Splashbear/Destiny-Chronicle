import {
  collectModalSearchPlayers,
  filterModalSelectedPlayers,
} from './modal-search-players';
import { PlayerSearchDisplay } from '../models/player-search-display.model';

function player(
  partial: Partial<PlayerSearchDisplay> & { membershipId: string }
): PlayerSearchDisplay {
  return {
    displayName: 'P',
    membershipType: 2,
    game: 'D2',
    platform: 'PSN',
    ...partial,
  } as PlayerSearchDisplay;
}

describe('modal-search-players', () => {
  it('collects cross-save, non-primary D2, and D1', () => {
    const cross = player({ membershipId: '1', isCrossSavePrimary: true });
    const d2 = player({ membershipId: '2' });
    const d1 = player({ membershipId: '3', game: 'D1' });
    const all = collectModalSearchPlayers({
      crossSavePlayer: cross,
      d2SearchResults: [cross, d2],
      d1SearchResults: [d1],
    });
    expect(all.map((p) => p.membershipId)).toEqual(['1', '2', '3']);
  });

  it('filters by selected keys', () => {
    const a = player({ membershipId: 'a' });
    const b = player({ membershipId: 'b' });
    const keys = new Set(['D2|a']);
    const filtered = filterModalSelectedPlayers([a, b], keys, (p) => `D2|${p.membershipId}`);
    expect(filtered).toEqual([a]);
  });
});
