import { getFirstsOnCalendarDate } from './anniversary-helper';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { ActivityHistory } from '../models/activity-history.model';

describe('getFirstsOnCalendarDate', () => {
  it('should return empty array when no firsts provided', () => {
    const result = getFirstsOnCalendarDate([], '2024-04-23');
    expect(result).toEqual([]);
  });

  it('should return empty array when no date provided', () => {
    const firsts: ActivityFirstCompletion[] = [{
      type: 'raid',
      name: 'Vault of Glass',
      game: 'D2',
      period: '2021-05-22T14:30:00Z',
      completionDate: '2021-05-22T14:30:00Z',
      instanceId: '123',
      referenceId: '1441982566',
      mode: 4,
      characterId: 'char123',
      membershipId: 'mem123',
      completed: 1
    }];
    const result = getFirstsOnCalendarDate(firsts, '');
    expect(result).toEqual([]);
  });

  it('should match exact date', () => {
    const firsts: ActivityFirstCompletion[] = [{
      type: 'raid',
      name: 'Vault of Glass',
      game: 'D2',
      period: '2021-05-22T14:30:00Z',
      completionDate: '2021-05-22T14:30:00Z',
      instanceId: '123',
      referenceId: '1441982566',
      mode: 4,
      characterId: 'char123',
      membershipId: 'mem123',
      completed: 1
    }];
    const result = getFirstsOnCalendarDate(firsts, '2021-05-22');
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('guardian-first');
    expect(result[0].matchReason).toBe('exact-date');
  });

  it('should match anniversary (same month+day, different year)', () => {
    const firsts: ActivityFirstCompletion[] = [{
      type: 'raid',
      name: 'Vault of Glass',
      game: 'D2',
      period: '2021-05-22T14:30:00Z',
      completionDate: '2021-05-22T14:30:00Z',
      instanceId: '123',
      referenceId: '1441982566',
      mode: 4,
      characterId: 'char123',
      membershipId: 'mem123',
      completed: 1
    }];
    const result = getFirstsOnCalendarDate(firsts, '2024-05-22');
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('guardian-first');
    expect(result[0].matchReason).toBe('anniversary');
  });

  it('should not match different month+day', () => {
    const firsts: ActivityFirstCompletion[] = [{
      type: 'raid',
      name: 'Vault of Glass',
      game: 'D2',
      period: '2021-05-22T14:30:00Z',
      completionDate: '2021-05-22T14:30:00Z',
      instanceId: '123',
      referenceId: '1441982566',
      mode: 4,
      characterId: 'char123',
      membershipId: 'mem123',
      completed: 1
    }];
    const result = getFirstsOnCalendarDate(firsts, '2024-05-23');
    expect(result.length).toBe(0);
  });

  it('should include solo completions for dungeons', () => {
    const firsts: ActivityFirstCompletion[] = [{
      type: 'dungeon',
      name: 'Prophecy',
      game: 'D2',
      period: '2020-06-09T18:00:00Z',
      completionDate: '2020-06-09T18:00:00Z',
      instanceId: '456',
      referenceId: '2032534090',
      mode: 82,
      characterId: 'char123',
      membershipId: 'mem123',
      completed: 1,
      isSolo: true
    }];
    const result = getFirstsOnCalendarDate(firsts, '2024-06-09');
    expect(result.length).toBe(2); // Regular first + solo
    expect(result.some(r => r.type === 'guardian-first')).toBe(true);
    expect(result.some(r => r.type === 'solo')).toBe(true);
  });

  it('should include solo flawless completions for dungeons', () => {
    const firsts: ActivityFirstCompletion[] = [{
      type: 'dungeon',
      name: 'Prophecy',
      game: 'D2',
      period: '2020-06-09T18:00:00Z',
      completionDate: '2020-06-09T18:00:00Z',
      instanceId: '456',
      referenceId: '2032534090',
      mode: 82,
      characterId: 'char123',
      membershipId: 'mem123',
      completed: 1,
      isSolo: true,
      isSoloFlawless: true
    }];
    const result = getFirstsOnCalendarDate(firsts, '2024-06-09');
    expect(result.length).toBe(3); // Regular first + solo + solo flawless
    expect(result.some(r => r.type === 'guardian-first')).toBe(true);
    expect(result.some(r => r.type === 'solo')).toBe(true);
    expect(result.some(r => r.type === 'solo-flawless')).toBe(true);
  });

  it('should include First Ever activity when provided', () => {
    const firstEver: ActivityHistory = {
      period: '2014-09-09T12:00:00Z',
      activityDetails: {
        referenceId: 123456,
        instanceId: '789',
        mode: 2
      },
      values: {}
    } as any;
    const result = getFirstsOnCalendarDate([], '2024-09-09', firstEver);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('first-ever');
    expect(result[0].matchReason).toBe('anniversary');
  });

  it('should match multiple firsts on same date', () => {
    const firsts: ActivityFirstCompletion[] = [
      {
        type: 'raid',
        name: 'Vault of Glass',
        game: 'D2',
        period: '2021-05-22T14:30:00Z',
        completionDate: '2021-05-22T14:30:00Z',
        instanceId: '123',
        referenceId: '1441982566',
        mode: 4,
        characterId: 'char123',
        membershipId: 'mem123',
        completed: 1
      },
      {
        type: 'raid',
        name: 'Deep Stone Crypt',
        game: 'D2',
        period: '2020-11-21T19:00:00Z',
        completionDate: '2021-05-22T20:00:00Z', // Same date, different time
        instanceId: '124',
        referenceId: '910380154',
        mode: 4,
        characterId: 'char123',
        membershipId: 'mem123',
        completed: 1
      }
    ];
    const result = getFirstsOnCalendarDate(firsts, '2024-05-22');
    expect(result.length).toBe(2);
  });

  it('should handle leap year dates correctly', () => {
    const firsts: ActivityFirstCompletion[] = [{
      type: 'raid',
      name: 'Vault of Glass',
      game: 'D2',
      period: '2020-02-29T14:30:00Z',
      completionDate: '2020-02-29T14:30:00Z',
      instanceId: '123',
      referenceId: '1441982566',
      mode: 4,
      characterId: 'char123',
      membershipId: 'mem123',
      completed: 1
    }];
    // 2024 is a leap year, so Feb 29 should match
    const result = getFirstsOnCalendarDate(firsts, '2024-02-29');
    expect(result.length).toBe(1);
    expect(result[0].matchReason).toBe('anniversary');
  });

  it('should exclude non-completion records (completed !== 1)', () => {
    const firsts: ActivityFirstCompletion[] = [
      {
        type: 'raid',
        name: 'Vault of Glass',
        game: 'D2',
        period: '2021-05-22T14:30:00Z',
        completionDate: '2021-05-22T14:30:00Z',
        instanceId: '123',
        referenceId: '1441982566',
        mode: 4,
        characterId: 'char123',
        membershipId: 'mem123',
        completed: 0 // First run/start/attempt (not a completion)
      },
      {
        type: 'raid',
        name: 'Deep Stone Crypt',
        game: 'D2',
        period: '2021-05-22T15:30:00Z',
        completionDate: '2021-05-22T15:30:00Z',
        instanceId: '124',
        referenceId: '910380154',
        mode: 4,
        characterId: 'char123',
        membershipId: 'mem123',
        completed: 1 // Actual completion
      }
    ];
    const result = getFirstsOnCalendarDate(firsts, '2024-05-22');
    // Should only include the completed: 1 record
    expect(result.length).toBe(1);
    expect((result[0].first as ActivityFirstCompletion).name).toBe('Deep Stone Crypt');
    expect((result[0].first as ActivityFirstCompletion).completed).toBe(1);
  });

  it('should accept completed as boolean true', () => {
    const firsts: ActivityFirstCompletion[] = [{
      type: 'raid',
      name: 'Vault of Glass',
      game: 'D2',
      period: '2021-05-22T14:30:00Z',
      completionDate: '2021-05-22T14:30:00Z',
      instanceId: '123',
      referenceId: '1441982566',
      mode: 4,
      characterId: 'char123',
      membershipId: 'mem123',
      completed: true as any // Boolean true is also valid
    }];
    const result = getFirstsOnCalendarDate(firsts, '2024-05-22');
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('guardian-first');
  });

  it('should exclude records with completed as false or 0', () => {
    const firsts: ActivityFirstCompletion[] = [
      {
        type: 'raid',
        name: 'Vault of Glass',
        game: 'D2',
        period: '2021-05-22T14:30:00Z',
        completionDate: '2021-05-22T14:30:00Z',
        instanceId: '123',
        referenceId: '1441982566',
        mode: 4,
        characterId: 'char123',
        membershipId: 'mem123',
        completed: false as any
      },
      {
        type: 'raid',
        name: 'Deep Stone Crypt',
        game: 'D2',
        period: '2021-05-22T15:30:00Z',
        completionDate: '2021-05-22T15:30:00Z',
        instanceId: '124',
        referenceId: '910380154',
        mode: 4,
        characterId: 'char123',
        membershipId: 'mem123',
        completed: 0
      }
    ];
    const result = getFirstsOnCalendarDate(firsts, '2024-05-22');
    expect(result.length).toBe(0);
  });
});
