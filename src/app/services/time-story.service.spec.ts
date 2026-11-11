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
