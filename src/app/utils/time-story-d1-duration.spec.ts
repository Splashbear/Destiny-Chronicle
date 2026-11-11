import { timeStorySourceSeconds } from './time-story-source';
import {
  applyCachedD1Duration,
  backfillD1DurationsFromCache,
  needsD1DurationBackfill,
} from './time-story-d1-duration';
import {
  aggregateUnifiedCountRows,
  buildUnifiedYearBars,
  filterUnifiedByYear,
  instanceIdsForSection,
  type UnifiedBreakdownSource,
} from './unified-breakdown-year';

describe('D1 missing duration backfill', () => {
  const missing: any = {
    instanceId: 'd1-1',
    period: '2016-06-01T12:00:00Z',
    membershipId: 'ps',
    game: 'D1',
    mode: 4,
    activityHash: 'raid',
  };

  it('fills a cached PGCR duration and uses it as game duration, not personal time', async () => {
    expect(needsD1DurationBackfill(missing)).toBe(true);
    const filled = await backfillD1DurationsFromCache([missing], async () => 4187);
    expect(filled[0].durationSeconds).toBe(4187);
    expect(filled[0].timePlayedSeconds == null || filled[0].timePlayedSeconds === undefined).toBe(true);
    expect(timeStorySourceSeconds(filled[0])).toBe(4187);
  });

  it('leaves time unknown when the cache has no duration', async () => {
    const filled = await backfillD1DurationsFromCache([missing], async () => null);
    expect(needsD1DurationBackfill(filled[0])).toBe(true);
    expect(filled[0].durationSeconds == null || filled[0].durationSeconds === undefined).toBe(true);
    expect(timeStorySourceSeconds(filled[0])).toBe(0);
  });

  it('does not overwrite a proven player-time or existing lean duration', async () => {
    const withPlayer = { ...missing, timePlayedSeconds: 900 };
    const withDuration = { ...missing, instanceId: 'd1-2', durationSeconds: 600 };
    const filled = await backfillD1DurationsFromCache([withPlayer, withDuration], async () => 4187);
    expect(filled[0].timePlayedSeconds).toBe(900);
    expect(filled[0].durationSeconds).toBeUndefined();
    expect(timeStorySourceSeconds(filled[0])).toBe(900);
    expect(filled[1].durationSeconds).toBe(600);
    expect(timeStorySourceSeconds(filled[1])).toBe(600);
  });

  it('backfilled seconds agree across year bars, table rows, and results population', async () => {
    const filled = await backfillD1DurationsFromCache([missing], async () => 4187);
    const record: UnifiedBreakdownSource = {
      instanceId: filled[0].instanceId,
      period: filled[0].period,
      membershipId: filled[0].membershipId,
      game: 'D1',
      sectionKey: 'mode-4',
      sectionLabel: 'Raid',
      referenceId: 'raid',
      baseName: 'Vault of Glass',
      variantName: '',
      mode: 4,
      seconds: timeStorySourceSeconds(filled[0]),
      completed: true,
    };
    const bars = buildUnifiedYearBars([record], 'UTC', ['mode-4']);
    const yearRows = filterUnifiedByYear([record], 2016, 'UTC');
    const table = aggregateUnifiedCountRows(yearRows);
    expect(bars.years[0].year).toBe(2016);
    expect(bars.totalSeconds).toBe(4187);
    expect(bars.totalGames).toBe(1);
    expect(yearRows[0].seconds).toBe(4187);
    expect(table[0].timeSeconds).toBe(4187);
    expect(table[0].runs).toBe(1);
    expect(instanceIdsForSection(yearRows, 'mode-4')).toEqual(['d1-1']);
  });
});
