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

describe('TimeStoryService multi-account scope and dedupe', () => {
  function leanRow(opts: {
    instanceId: string;
    membershipId: string;
    game: 'D1' | 'D2';
    timePlayedSeconds?: number;
    durationSeconds?: number;
    period?: string;
    mode?: number;
    activityHash?: number;
  }) {
    return leanFromArchiveLight({
      instanceId: opts.instanceId,
      period: opts.period ?? '2023-06-01T12:00:00Z',
      membershipId: opts.membershipId,
      characterId: 'c1',
      game: opts.game,
      mode: opts.mode ?? 4,
      activityHash: opts.activityHash ?? 123,
      durationSeconds: opts.durationSeconds ?? 4000,
      timePlayedSeconds: opts.timePlayedSeconds,
    })!;
  }

  function service(sources: Record<string, ReturnType<typeof leanRow>[]>) {
    const loader = {
      getTimeStorySources: (membershipId: string, game: 'D1' | 'D2') =>
        sources[`${membershipId}|${game}`] || [],
    };
    const archiveApi = {
      fetchPlayerActivities: async () => {
        throw new Error('should not refetch archive when both scopes are loaded');
      },
    };
    const manifest = {
      getActivityName: () => 'Last Wish',
      getActivityFamilyName: () => 'Last Wish',
    };
    const breakdown = { timeStoryGroupForActivity: () => 'raids' as const };
    return new TimeStoryService(breakdown as any, loader as any, archiveApi as any, manifest as any);
  }

  const identity = { splash: 'D2:splashbear#1078', puddle: 'D2:puddlecubbs#1', splashPs: 'D2:splashbear#1078' };

  it('keeps the same instance as two games when two different selected accounts were in it, and adds both personal times', async () => {
    const splash = leanRow({ instanceId: 'raid-1', membershipId: 'splash', game: 'D2', timePlayedSeconds: 1800 });
    const puddle = leanRow({ instanceId: 'raid-1', membershipId: 'puddle', game: 'D2', timePlayedSeconds: 2400 });
    const svc = service({ 'splash|D2': [splash], 'puddle|D2': [puddle] });
    const scopes = [
      { membershipId: 'splash', game: 'D2' as const },
      { membershipId: 'puddle', game: 'D2' as const },
    ];
    const bars = await svc.getYearBars(scopes, identity, 'UTC');
    const results = await svc.getYearGroupResults(scopes, identity, 2023, 'raids', 'UTC', bars.totalGames);
    const eras = await svc.getEras(scopes, identity, 'UTC');
    expect(bars.totalGames).toBe(2);
    expect(bars.totalSeconds).toBe(1800 + 2400);
    expect(results.totalGames).toBe(2);
    expect(results.rows.reduce((sum, row) => sum + row.seconds, 0)).toBe(4200);
    expect(results.countMatchesChart).toBe(true);
    const wish = eras.find(era => era.activityName === 'Last Wish');
    expect(wish?.games).toBe(2);
    expect(wish?.seconds).toBe(4200);
  });

  it('counts a cross-save guardian once and keeps the first selected platform\'s personal time, not the longer one', async () => {
    const xbox = leanRow({ instanceId: 'raid-1', membershipId: 'splash', game: 'D2', timePlayedSeconds: 1800 });
    const steam = leanRow({ instanceId: 'raid-1', membershipId: 'splashPs', game: 'D2', timePlayedSeconds: 2400 });
    const svc = service({ 'splash|D2': [xbox], 'splashPs|D2': [steam] });
    const xboxFirst = await svc.getYearBars(
      [
        { membershipId: 'splash', game: 'D2' },
        { membershipId: 'splashPs', game: 'D2' },
      ],
      identity,
      'UTC'
    );
    const steamFirst = await svc.getYearBars(
      [
        { membershipId: 'splashPs', game: 'D2' },
        { membershipId: 'splash', game: 'D2' },
      ],
      identity,
      'UTC'
    );
    expect(xboxFirst.totalGames).toBe(1);
    expect(steamFirst.totalGames).toBe(1);
    expect(xboxFirst.totalSeconds).toBe(1800);
    expect(steamFirst.totalSeconds).toBe(2400);
    expect(xboxFirst.totalSeconds).not.toBe(steamFirst.totalSeconds);
    expect(xboxFirst.totalSeconds + steamFirst.totalSeconds).not.toBe(1800); // not a sum of both
  });

  it('keeps a D1 account distinct from D2 on the same membership id', async () => {
    const d2 = leanRow({ instanceId: '1001', membershipId: 'ps', game: 'D2', timePlayedSeconds: 1000 });
    const d1 = leanRow({
      instanceId: '1001',
      membershipId: 'ps',
      game: 'D1',
      timePlayedSeconds: 500,
      period: '2016-06-01T12:00:00Z',
      activityHash: 99,
    });
    const svc = service({ 'ps|D2': [d2], 'ps|D1': [d1] });
    const identityShared = { ps: 'D2:splashbear#1078' };
    const bars = await svc.getYearBars(
      [
        { membershipId: 'ps', game: 'D2' },
        { membershipId: 'ps', game: 'D1' },
      ],
      identityShared,
      'UTC'
    );
    expect(bars.totalGames).toBe(2);
    expect(bars.totalSeconds).toBe(1500);
    expect(bars.years.map(y => y.year).sort()).toEqual([2016, 2023]);
  });
});
