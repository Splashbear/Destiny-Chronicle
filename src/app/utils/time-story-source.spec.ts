import {
  leanFromArchiveLight,
  leanFromBungieHistory,
  mergeTimeStorySourceRows,
  timeStorySourceSeconds,
} from './time-story-source';
import { convertLightActivityToHistory } from './activity-history-normalize';
import { playerTimePlayedSeconds } from './player-time-played-seconds';

describe('time story source rows', () => {
  const archiveLight = {
    instanceId: '1',
    period: '2023-06-01T12:00:00Z',
    membershipId: 'mid',
    characterId: 'c1',
    game: 'D2' as const,
    mode: 4,
    activityHash: 123,
    durationSeconds: 4187,
  };

  it('reads archive lean rows as duration-only and does not invent player time', () => {
    const row = leanFromArchiveLight(archiveLight);
    expect(row?.timePlayedSeconds).toBeNull();
    expect(row?.durationSeconds).toBe(4187);
    expect(timeStorySourceSeconds(row!)).toBe(4187);
  });

  it('uses a player-time field on the archive lean row when one exists', () => {
    const row = leanFromArchiveLight({ ...archiveLight, timePlayedSeconds: 101 });
    expect(row?.timePlayedSeconds).toBe(101);
    expect(timeStorySourceSeconds(row!)).toBe(101);
  });

  it('prefers Bungie player time over archive duration for the same instance', () => {
    const archive = leanFromArchiveLight(archiveLight)!;
    const bungie = leanFromBungieHistory({
      period: '2023-06-01T12:00:00Z',
      membershipId: 'mid',
      characterId: 'c1',
      game: 'D2',
      activityDetails: { instanceId: '1', referenceId: 123, mode: 4 },
      values: { timePlayedSeconds: { basic: { value: 132 } } },
    })!;
    const merged = mergeTimeStorySourceRows([archive], [bungie]);
    expect(merged.length).toBe(1);
    expect(merged[0].timePlayedSeconds).toBe(132);
    expect(timeStorySourceSeconds(merged[0])).toBe(132);
  });

  it('keeps duration fallback when Bungie history has no player-time field', () => {
    const archive = leanFromArchiveLight(archiveLight)!;
    const bungie = leanFromBungieHistory({
      period: '2023-06-01T12:00:00Z',
      membershipId: 'mid',
      game: 'D2',
      activityDetails: { instanceId: '1', referenceId: 123, mode: 4 },
    })!;
    const merged = mergeTimeStorySourceRows([archive], [bungie]);
    expect(merged[0].timePlayedSeconds).toBeNull();
    expect(timeStorySourceSeconds(merged[0])).toBe(4187);
  });

  it('does not use convertLightActivityToHistory aliased duration as player time', () => {
    const converted = convertLightActivityToHistory(archiveLight);
    // The site-wide converter still copies durationSeconds into
    // values.timePlayedSeconds for Total Time Played / heatmap sums.
    expect(converted.values?.timePlayedSeconds?.basic?.value).toBe(4187);
    expect(playerTimePlayedSeconds(converted)).toBe(4187);
    const lean = leanFromArchiveLight(archiveLight)!;
    expect(lean.timePlayedSeconds).toBeNull();
    expect(timeStorySourceSeconds(lean)).toBe(4187);
  });
});
