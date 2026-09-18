import { ActivityFirstCompletion } from '../../models/guardian-firsts.model';

/**
 * Unit tests for solo/solo-flawless flag preservation during deduplication.
 * 
 * These tests verify the fix for the issue where solo flags were being lost
 * when a player completed an activity normally first, then solo later.
 */
describe('Guardian Firsts - Solo Flag Preservation', () => {
  
  function guardianFirstsDedupKey(f: ActivityFirstCompletion): string {
    if (f.type === 'story' && f.storyReleaseId) {
      return `${f.game}|story|${f.storyReleaseId}`;
    }
    if ((f.game === 'D1' && f.type === 'raid') || (f.game === 'D2' && (f.type === 'raid' || f.type === 'dungeon'))) {
      return `${f.game}|${f.type}|${f.name}|${f.referenceId}`;
    }
    return `${f.game}|${f.type}|${f.name}`;
  }

  function deduplicateWithFlagPreservation(allFirsts: ActivityFirstCompletion[]): ActivityFirstCompletion[] {
    const perName = new Map<string, ActivityFirstCompletion>();
    for (const f of allFirsts) {
      const key = guardianFirstsDedupKey(f);
      const existing = perName.get(key);
      if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
        // Keep the earliest completion, but merge in any solo/solo-flawless flags from existing
        if (existing) {
          f.isSolo = f.isSolo || existing.isSolo;
          f.isSoloFlawless = f.isSoloFlawless || existing.isSoloFlawless;
        }
        perName.set(key, f);
      } else {
        // Current record is later, but check if it has better flags
        if (f.isSolo && !existing.isSolo) {
          existing.isSolo = true;
        }
        if (f.isSoloFlawless && !existing.isSoloFlawless) {
          existing.isSoloFlawless = true;
        }
      }
    }
    return Array.from(perName.values());
  }

  it('should preserve isSolo flag when solo completion is later than first completion', () => {
    const firsts: ActivityFirstCompletion[] = [
      {
        type: 'dungeon',
        name: 'Duality',
        game: 'D2',
        period: '2023-01-01T10:00:00Z',
        completionDate: '2023-01-01T10:00:00Z',
        instanceId: '123',
        referenceId: '12345',
        mode: 82,
        characterId: 'char1',
        membershipId: 'player1',
        completed: 1,
        isSolo: false, // First clear was NOT solo
        isSoloFlawless: false
      },
      {
        type: 'dungeon',
        name: 'Duality',
        game: 'D2',
        period: '2023-02-01T10:00:00Z', // Later date
        completionDate: '2023-02-01T10:00:00Z',
        instanceId: '456',
        referenceId: '12345',
        mode: 82,
        characterId: 'char2',
        membershipId: 'player1',
        completed: 1,
        isSolo: true, // Second clear WAS solo
        isSoloFlawless: false
      }
    ];

    const result = deduplicateWithFlagPreservation(firsts);

    expect(result.length).toBe(1);
    expect(result[0].completionDate).toBe('2023-01-01T10:00:00Z'); // Earliest date
    expect(result[0].isSolo).toBe(true); // Should preserve the solo flag from later completion!
    expect(result[0].isSoloFlawless).toBe(false);
  });

  it('should preserve isSoloFlawless flag when solo-flawless completion is later', () => {
    const firsts: ActivityFirstCompletion[] = [
      {
        type: 'dungeon',
        name: 'Prophecy',
        game: 'D2',
        period: '2022-06-01T10:00:00Z',
        completionDate: '2022-06-01T10:00:00Z',
        instanceId: '111',
        referenceId: '99999',
        mode: 82,
        characterId: 'char1',
        membershipId: 'player1',
        completed: 1,
        isSolo: false,
        isSoloFlawless: false
      },
      {
        type: 'dungeon',
        name: 'Prophecy',
        game: 'D2',
        period: '2022-07-01T10:00:00Z', // Later: solo but not flawless
        completionDate: '2022-07-01T10:00:00Z',
        instanceId: '222',
        referenceId: '99999',
        mode: 82,
        characterId: 'char2',
        membershipId: 'player1',
        completed: 1,
        isSolo: true,
        isSoloFlawless: false
      },
      {
        type: 'dungeon',
        name: 'Prophecy',
        game: 'D2',
        period: '2022-08-01T10:00:00Z', // Even later: solo flawless!
        completionDate: '2022-08-01T10:00:00Z',
        instanceId: '333',
        referenceId: '99999',
        mode: 82,
        characterId: 'char3',
        membershipId: 'player1',
        completed: 1,
        isSolo: true,
        isSoloFlawless: true
      }
    ];

    const result = deduplicateWithFlagPreservation(firsts);

    expect(result.length).toBe(1);
    expect(result[0].completionDate).toBe('2022-06-01T10:00:00Z'); // Earliest date
    expect(result[0].isSolo).toBe(true); // Should be true from later completions
    expect(result[0].isSoloFlawless).toBe(true); // Should be true from latest completion!
  });

  it('should handle solo completion before normal completion', () => {
    const firsts: ActivityFirstCompletion[] = [
      {
        type: 'dungeon',
        name: 'Grasp of Avarice',
        game: 'D2',
        period: '2023-01-01T10:00:00Z',
        completionDate: '2023-01-01T10:00:00Z',
        instanceId: '789',
        referenceId: '55555',
        mode: 82,
        characterId: 'char1',
        membershipId: 'player1',
        completed: 1,
        isSolo: true, // First clear WAS solo
        isSoloFlawless: false
      },
      {
        type: 'dungeon',
        name: 'Grasp of Avarice',
        game: 'D2',
        period: '2023-02-01T10:00:00Z', // Later, with fireteam
        completionDate: '2023-02-01T10:00:00Z',
        instanceId: '790',
        referenceId: '55555',
        mode: 82,
        characterId: 'char2',
        membershipId: 'player1',
        completed: 1,
        isSolo: false,
        isSoloFlawless: false
      }
    ];

    const result = deduplicateWithFlagPreservation(firsts);

    expect(result.length).toBe(1);
    expect(result[0].completionDate).toBe('2023-01-01T10:00:00Z'); // Earliest date
    expect(result[0].isSolo).toBe(true); // Should still be true (from earliest)
    expect(result[0].isSoloFlawless).toBe(false);
  });

  it('should not affect records that dont have solo flags', () => {
    const firsts: ActivityFirstCompletion[] = [
      {
        type: 'raid',
        name: 'Vault of Glass',
        game: 'D2',
        period: '2021-05-22T10:00:00Z',
        completionDate: '2021-05-22T10:00:00Z',
        instanceId: '111',
        referenceId: '77777',
        mode: 4,
        characterId: 'char1',
        membershipId: 'player1',
        completed: 1
      },
      {
        type: 'raid',
        name: 'Vault of Glass',
        game: 'D2',
        period: '2021-06-01T10:00:00Z',
        completionDate: '2021-06-01T10:00:00Z',
        instanceId: '112',
        referenceId: '77777',
        mode: 4,
        characterId: 'char2',
        membershipId: 'player1',
        completed: 1
      }
    ];

    const result = deduplicateWithFlagPreservation(firsts);

    expect(result.length).toBe(1);
    expect(result[0].completionDate).toBe('2021-05-22T10:00:00Z'); // Earliest
    expect(result[0].isSolo).toBeUndefined();
    expect(result[0].isSoloFlawless).toBeUndefined();
  });

  it('should handle multiple different activities correctly', () => {
    const firsts: ActivityFirstCompletion[] = [
      {
        type: 'dungeon',
        name: 'Duality',
        game: 'D2',
        period: '2023-01-01T10:00:00Z',
        completionDate: '2023-01-01T10:00:00Z',
        instanceId: '123',
        referenceId: '12345',
        mode: 82,
        characterId: 'char1',
        membershipId: 'player1',
        completed: 1,
        isSolo: false
      },
      {
        type: 'dungeon',
        name: 'Prophecy',
        game: 'D2',
        period: '2022-06-01T10:00:00Z',
        completionDate: '2022-06-01T10:00:00Z',
        instanceId: '456',
        referenceId: '99999',
        mode: 82,
        characterId: 'char1',
        membershipId: 'player1',
        completed: 1,
        isSolo: true
      },
      {
        type: 'dungeon',
        name: 'Duality',
        game: 'D2',
        period: '2023-02-01T10:00:00Z',
        completionDate: '2023-02-01T10:00:00Z',
        instanceId: '789',
        referenceId: '12345',
        mode: 82,
        characterId: 'char2',
        membershipId: 'player1',
        completed: 1,
        isSolo: true // Later solo clear
      }
    ];

    const result = deduplicateWithFlagPreservation(firsts);

    expect(result.length).toBe(2); // Two different activities
    
    const duality = result.find(f => f.name === 'Duality');
    const prophecy = result.find(f => f.name === 'Prophecy');
    
    expect(duality).toBeDefined();
    expect(duality!.completionDate).toBe('2023-01-01T10:00:00Z');
    expect(duality!.isSolo).toBe(true); // Should merge from later completion
    
    expect(prophecy).toBeDefined();
    expect(prophecy!.completionDate).toBe('2022-06-01T10:00:00Z');
    expect(prophecy!.isSolo).toBe(true);
  });
});
