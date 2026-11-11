import '@angular/compiler';
import { TimeStoryService } from './time-story.service';
import { leanFromArchiveLight } from '../utils/time-story-source';

describe('TimeStoryService.getYearBars', () => {
  const lean = leanFromArchiveLight({
    instanceId: '1',
    period: '2023-06-01T12:00:00Z',
    membershipId: 'mid',
    characterId: 'c1',
    game: 'D2' as const,
    mode: 4,
    activityHash: 123,
    durationSeconds: 4187,
  })!;

  it('aggregates year bars from lean sources when the manifest never loaded', async () => {
    const loader = { getTimeStorySources: () => [lean] };
    const archiveApi = {
      fetchPlayerActivities: async () => {
        throw new Error('should not refetch archive');
      },
    };
    const manifest = {
      isLoadedSync: false,
      getActivityName: () => 'Loading...',
      getActivityFamilyName: () => 'Loading...',
    };
    const breakdown = { timeStoryGroupForActivity: () => 'raids' as const };
    const svc = new TimeStoryService(breakdown as any, loader as any, archiveApi as any, manifest as any);

    const result = await svc.getYearBars([{ membershipId: 'mid', game: 'D2' }], {}, 'UTC');
    expect(result.years.map(y => y.year)).toEqual([2023]);
    expect(result.totalGames).toBe(1);
    expect(result.totalSeconds).toBe(4187);
  });
});

describe('TimeStoryService.getYearGroupResults', () => {
  function leanRow(period: string, mode: number, instanceId: string, extras: Record<string, unknown> = {}) {
    return leanFromArchiveLight({
      instanceId,
      period,
      membershipId: (extras['membershipId'] as string) ?? 'mid',
      characterId: 'c1',
      game: (extras['game'] as 'D1' | 'D2') ?? 'D2',
      mode,
      activityHash: (extras['activityHash'] as number) ?? 123,
      durationSeconds: 600,
    })!;
  }

  it('lists every matching year+group row from lean sources and does not refetch archive or PGCR', async () => {
    const story = [
      leanRow('2019-12-15T18:00:00Z', 2, 's1'),
      leanRow('2019-06-01T18:00:00Z', 2, 's2'),
      leanRow('2019-06-01T17:00:00Z', 2, 's3'),
    ];
    const trials = leanRow('2019-12-15T19:00:00Z', 39, 't1');
    const d1 = leanRow('2019-06-01T16:00:00Z', 2, 'd1', { game: 'D1', membershipId: 'd1mid' });
    const sources = { 'mid|D2': [...story, trials], 'd1mid|D1': [d1] };
    let archiveCalls = 0;
    let pgcrCalls = 0;
    const loader = {
      getTimeStorySources: (membershipId: string, game: 'D1' | 'D2') =>
        sources[`${membershipId}|${game}`] || [],
    };
    const archiveApi = {
      fetchPlayerActivities: async () => {
        archiveCalls += 1;
        throw new Error('should not refetch archive');
      },
      fetchPgcr: async () => {
        pgcrCalls += 1;
        throw new Error('should not fetch PGCR');
      },
    };
    const manifest = {
      getActivityName: () => 'Patrol',
      getActivityFamilyName: () => 'Patrol',
    };
    const breakdown = {
      timeStoryGroupForActivity: (activity: { activityDetails?: { mode?: number } }) =>
        activity.activityDetails?.mode === 39 ? 'trials' : 'story-patrol-seasonal',
    };
    const svc = new TimeStoryService(breakdown as any, loader as any, archiveApi as any, manifest as any);
    const result = await svc.getYearGroupResults(
      [{ membershipId: 'mid', game: 'D2' }],
      {},
      2019,
      'story-patrol-seasonal',
      'UTC',
      3
    );
    expect(result.totalGames).toBe(3);
    expect(result.countMatchesChart).toBe(true);
    expect(result.rows.map(r => r.instanceId)).toEqual(['s1', 's2', 's3']);
    expect(result.rows.some(r => r.instanceId === 't1' || r.instanceId === 'd1')).toBe(false);
    expect(archiveCalls).toBe(0);
    expect(pgcrCalls).toBe(0);
    expect(svc.activityNameForSource('D2', 123)).toBe('Patrol');
  });
});
