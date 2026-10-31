import {
  PgcrCharacterClassEnrichHost,
  PgcrCharacterClassEnrichService,
} from './pgcr-character-class-enrich.service';
import { ActivityHistory } from '../models/activity-history.model';

describe('PgcrCharacterClassEnrichService', () => {
  it('skips when every activity already has characterClass', async () => {
    let batches = 0;
    const host: PgcrCharacterClassEnrichHost = {
      getSelectedPlayers: () => [
        {
          displayName: 'P',
          membershipId: '1',
          membershipType: 2,
          game: 'D2',
          platform: 'PS',
        } as any,
      ],
      getPlayerKey: (p) => `D2|${p.membershipId}`,
      getSelectedCharacterId: () => 'c1',
      getPlatformName: () => 'PS',
      getPgcrBatchSize: () => 30,
      updateLoadingProgress: () => undefined,
      validatePgcrBatch: async () => {
        batches++;
        return [];
      },
      getFilteredActivitiesForDate: () => [],
    };
    const acts = [
      {
        characterClass: 'Hunter',
        membershipId: '1',
        game: 'D2',
        activityDetails: { instanceId: '9' },
      } as any,
    ] as ActivityHistory[];
    await new PgcrCharacterClassEnrichService().enrichActivitiesWithCharacterClass(host, acts);
    expect(batches).toBe(0);
  });

  it('merges class onto matching instance ids', async () => {
    const host: PgcrCharacterClassEnrichHost = {
      getSelectedPlayers: () => [
        {
          displayName: 'P',
          membershipId: '1',
          membershipType: 2,
          game: 'D2',
          platform: 'PS',
        } as any,
      ],
      getPlayerKey: (p) => `D2|${p.membershipId}`,
      getSelectedCharacterId: () => 'c1',
      getPlatformName: () => 'PS',
      getPgcrBatchSize: () => 30,
      updateLoadingProgress: () => undefined,
      validatePgcrBatch: async (acts) =>
        acts.map(a => ({
          ...a,
          characterClass: 'Warlock',
        })),
      getFilteredActivitiesForDate: () => [],
    };
    const acts = [
      {
        membershipId: '1',
        game: 'D2',
        activityDetails: { instanceId: '42' },
      } as any,
    ] as ActivityHistory[];
    await new PgcrCharacterClassEnrichService().enrichActivitiesWithCharacterClass(host, acts);
    expect((acts[0] as any).characterClass).toBe('Warlock');
  });
});
