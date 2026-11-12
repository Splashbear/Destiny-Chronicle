/**
 * Archive period normalization tests.
 *
 * Archive periods are UTC but lack zone info (e.g. "2025-03-16 21:43:05"),
 * which browsers parse as local time (4-hour shift in New York).
 * Verify that archive-sourced periods are normalized to ISO 8601 with Z.
 */
import { ArchiveService } from '../services/archive.service';

const LEAN_COLS = new Set([
  'instance_id',
  'period',
  'activity_hash',
  'director_activity_hash',
  'mode',
  'membership_id',
  'membership_type',
  'display_name',
  'character_id',
  'completed',
  'deaths',
  'kills',
  'assists',
  'duration_seconds',
  'standing',
  'starting_phase_index',
  'fireteam_id',
  'is_private',
  'dump_id',
  'game',
]);

function leanRow(period: string | null) {
  return {
    instance_id: '123',
    period,
    activity_hash: 1234,
    director_activity_hash: 5678,
    mode: 6,
    membership_id: '4611686018400000437',
    membership_type: 2,
    display_name: 'TestPlayer',
    character_id: '2305843009400000028',
    completed: true,
    deaths: 5,
    kills: 12,
    assists: 3,
    duration_seconds: 600,
    standing: 0,
    starting_phase_index: 0,
    fireteam_id: 'abc123',
    is_private: false,
    dump_id: 'test_dump',
    game: 'D2',
  };
}

function wireFakeArchive(archiveService: ArchiveService, period: string | null) {
  const mockDb = {
    all: jest.fn(async () => [leanRow(period)]),
  };
  (archiveService as any).db = mockDb;
  (archiveService as any).instanceDb = mockDb;
  (archiveService as any).archiveAvailable = true;
  (archiveService as any).leanActivitiesPath = '/test/path';
  (archiveService as any).instanceLookupTimeoutMs = 10_000;
  jest
    .spyOn(archiveService as any, 'describeParquetColumns')
    .mockResolvedValue(LEAN_COLS);
  jest.spyOn(archiveService as any, 'queryInstanceAcrossFireteamIndexes').mockResolvedValue([]);
}

describe('Archive period normalization', () => {
  let archiveService: ArchiveService;

  beforeEach(() => {
    archiveService = new ArchiveService('', '', '', '', '');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes UTC timestamp without zone to ISO 8601 with Z', async () => {
    wireFakeArchive(archiveService, '2025-03-16 21:43:05');
    const activities = await archiveService.getActivitiesByInstanceId('123', 'D2');
    expect(activities).toHaveLength(1);
    expect(activities[0].period).toBe('2025-03-16T21:43:05Z');
  });

  it('preserves already-normalized ISO 8601 timestamps with Z', async () => {
    wireFakeArchive(archiveService, '2020-09-12T03:12:16Z');
    const activities = await archiveService.getActivitiesByInstanceId('456', 'D2');
    expect(activities).toHaveLength(1);
    expect(activities[0].period).toBe('2020-09-12T03:12:16Z');
  });

  it('normalizes ISO 8601 without Z by appending Z', async () => {
    wireFakeArchive(archiveService, '2025-03-16T21:43:05');
    const activities = await archiveService.getActivitiesByInstanceId('789', 'D2');
    expect(activities).toHaveLength(1);
    expect(activities[0].period).toBe('2025-03-16T21:43:05Z');
  });

  it('handles empty or null periods', async () => {
    wireFakeArchive(archiveService, null);
    const activities = await archiveService.getActivitiesByInstanceId('999', 'D2');
    expect(activities).toHaveLength(1);
    expect(activities[0].period).toBe('');
  });
});
