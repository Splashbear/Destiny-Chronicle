/**
 * Archive period normalization tests.
 * 
 * Archive periods are UTC but lack zone info (e.g. "2025-03-16 21:43:05"),
 * which browsers parse as local time (4-hour shift in New York).
 * Verify that archive-sourced periods are normalized to ISO 8601 with Z.
 */
import { ArchiveService } from '../services/archive.service';

describe('Archive period normalization', () => {
  let archiveService: ArchiveService;
  
  beforeEach(() => {
    archiveService = new ArchiveService('', '', '', '', '');
  });

  it('normalizes UTC timestamp without zone to ISO 8601 with Z', async () => {
    // Mock the database and private method
    const mockDb = {
      all: jest.fn(async () => [{
        instance_id: '123',
        period: '2025-03-16 21:43:05',
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
      }]),
    };
    
    (archiveService as any).db = mockDb;
    (archiveService as any).archiveAvailable = true;
    (archiveService as any).leanActivitiesPath = '/test/path';
    
    const activities = await archiveService.getActivitiesByInstanceId('123', 'D2');
    
    expect(activities).toHaveLength(1);
    expect(activities[0].period).toBe('2025-03-16T21:43:05Z');
  });

  it('preserves already-normalized ISO 8601 timestamps with Z', async () => {
    const mockDb = {
      all: jest.fn(async () => [{
        instance_id: '456',
        period: '2020-09-12T03:12:16Z',
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
      }]),
    };
    
    (archiveService as any).db = mockDb;
    (archiveService as any).archiveAvailable = true;
    (archiveService as any).leanActivitiesPath = '/test/path';
    
    const activities = await archiveService.getActivitiesByInstanceId('456', 'D2');
    
    expect(activities).toHaveLength(1);
    expect(activities[0].period).toBe('2020-09-12T03:12:16Z');
  });

  it('normalizes ISO 8601 without Z by appending Z', async () => {
    const mockDb = {
      all: jest.fn(async () => [{
        instance_id: '789',
        period: '2025-03-16T21:43:05',
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
      }]),
    };
    
    (archiveService as any).db = mockDb;
    (archiveService as any).archiveAvailable = true;
    (archiveService as any).leanActivitiesPath = '/test/path';
    
    const activities = await archiveService.getActivitiesByInstanceId('789', 'D2');
    
    expect(activities).toHaveLength(1);
    expect(activities[0].period).toBe('2025-03-16T21:43:05Z');
  });

  it('handles empty or null periods', async () => {
    const mockDb = {
      all: jest.fn(async () => [{
        instance_id: '999',
        period: null,
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
      }]),
    };
    
    (archiveService as any).db = mockDb;
    (archiveService as any).archiveAvailable = true;
    (archiveService as any).leanActivitiesPath = '/test/path';
    
    const activities = await archiveService.getActivitiesByInstanceId('999', 'D2');
    
    expect(activities).toHaveLength(1);
    expect(activities[0].period).toBe('');
  });
});
