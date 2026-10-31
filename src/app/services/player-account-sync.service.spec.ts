import { PlayerAccountSyncService } from './player-account-sync.service';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { PlayerAccountSyncHost } from './player-account-sync.service';

function player(id: string, game: 'D1' | 'D2'): PlayerSearchDisplay {
  return {
    displayName: id,
    membershipId: id,
    membershipType: game === 'D1' ? 2 : 3,
    game,
    platform: game === 'D1' ? 'PlayStation' : 'Steam',
  } as PlayerSearchDisplay;
}

describe('PlayerAccountSyncService', () => {
  let svc: PlayerAccountSyncService;
  let order: string[];
  let host: PlayerAccountSyncHost;

  beforeEach(() => {
    svc = new PlayerAccountSyncService();
    order = [];
    host = {
      isD1Player: (p) => p.game === 'D1',
      runWithPlayerSyncLimit: async (task) => task(),
      loadCharacterHistory: async (p) => {
        order.push(`hist:${p.membershipId}`);
      },
      scheduleAfterBrowseReady: (fn) => fn(),
      loadGuardianFirsts: async (p) => {
        order.push(`firsts:${p.membershipId}`);
      },
      loadDungeonSoloFirsts: async () => undefined,
      loadTitlesForPlayer: async (p) => {
        order.push(`titles:${p.membershipId}`);
      },
    };
  });

  it('interleaves D1/D2 by default', async () => {
    await svc.syncPlayers(host, [player('d1a', 'D1'), player('d2a', 'D2'), player('d1b', 'D1')]);
    expect(order.filter(x => x.startsWith('hist:'))).toEqual([
      'hist:d1a',
      'hist:d2a',
      'hist:d1b',
    ]);
  });

  it('preserves order when requested', async () => {
    await svc.syncPlayers(
      host,
      [player('d2a', 'D2'), player('d1a', 'D1')],
      { preserveOrder: true }
    );
    expect(order.filter(x => x.startsWith('hist:'))).toEqual(['hist:d2a', 'hist:d1a']);
  });

  it('honors cancel before start (titles still fire off critical path)', async () => {
    const cancelled: string[] = [];
    await svc.syncPlayers(host, [player('a', 'D2')], {
      shouldContinue: () => false,
      onCancelled: (p, reason) => cancelled.push(`${p.membershipId}:${reason}`),
    });
    expect(order.filter(x => x.startsWith('hist:'))).toEqual([]);
    expect(cancelled).toEqual(['a:cancelled before start']);
    expect(order).toContain('titles:a');
  });
});
