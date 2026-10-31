import { d1ArchiveRowsForCharacter } from './d1-archive-character-rows';
import { PlayerActivitiesResponse } from '../core/data/archive-api.service';

describe('d1ArchiveRowsForCharacter', () => {
  const character = { membershipId: 'm1', characterId: 'c1' };

  it('filters to the character and forces game D1', () => {
    const archiveData = {
      activities: [
        {
          instanceId: '100',
          characterId: 'c1',
          period: '2015-01-01T00:00:00Z',
          referenceId: 1,
          mode: 3,
        },
        {
          instanceId: '200',
          characterId: 'c2',
          period: '2015-01-02T00:00:00Z',
          referenceId: 2,
          mode: 3,
        },
        {
          instanceId: '',
          characterId: 'c1',
          period: '2015-01-03T00:00:00Z',
          referenceId: 3,
          mode: 3,
        },
      ],
    } as unknown as PlayerActivitiesResponse;

    const rows = d1ArchiveRowsForCharacter(archiveData, character);
    expect(rows.length).toBe(1);
    expect(rows[0].membershipId).toBe('m1');
    expect(rows[0].characterId).toBe('c1');
    expect(rows[0].game).toBe('D1');
    expect(rows[0].activityDetails?.instanceId).toBe('100');
  });

  it('returns empty for null archive', () => {
    expect(d1ArchiveRowsForCharacter(null, character)).toEqual([]);
  });
});
