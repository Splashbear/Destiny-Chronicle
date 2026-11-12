import { pgcrLiteToBungieShape } from './pgcr-lite-to-bungie-shape';

describe('pgcrLiteToBungieShape', () => {
  it('lifts period to the top level and keeps entries', () => {
    const body = pgcrLiteToBungieShape({
      game: 'D2',
      _source: 'archive',
      activityDetails: {
        period: '2025-01-01T00:00:00Z',
        instanceId: '12000000000',
        referenceId: 1,
        directorActivityHash: 1,
        mode: 4,
      },
      entries: [{ characterId: '1' }],
    });
    expect(body?.['period']).toBe('2025-01-01T00:00:00Z');
    expect((body?.['activityDetails'] as { instanceId?: string })?.instanceId).toBe('12000000000');
    expect((body?.['entries'] as unknown[])?.length).toBe(1);
  });

  it('returns null without instance or entries', () => {
    expect(pgcrLiteToBungieShape({ activityDetails: { instanceId: '1' } })).toBeNull();
  });
});
