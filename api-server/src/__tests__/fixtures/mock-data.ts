/**
 * Mock data generator for testing
 */

import { LeanActivity } from '../../types/lean-activity.types';

export const MOCK_MEMBERSHIP_ID = '4611686018488107374';
export const MOCK_INSTANCE_ID_ARCHIVED = '12345678901';
export const MOCK_INSTANCE_ID_LIVE = '16000000000';

export function createMockActivity(overrides?: Partial<LeanActivity>): LeanActivity {
  return {
    instance_id: MOCK_INSTANCE_ID_ARCHIVED,
    period: '2021-04-23T19:30:00Z',
    activity_hash: 123456,
    director_activity_hash: 123456,
    mode: 4,
    membership_id: MOCK_MEMBERSHIP_ID,
    membership_type: 3,
    display_name: 'TestGuardian',
    character_id: '2305843009504575107',
    completed: true,
    deaths: 5,
    kills: 150,
    assists: 20,
    duration_seconds: 1800,
    standing: 0,
    starting_phase_index: 0,
    fireteam_id: 'fireteam-123',
    is_private: false,
    dump_id: 'd2-pgcr-archive-v1',
    game: 'D2',
    ...overrides,
  };
}

export const MOCK_ACTIVITIES: LeanActivity[] = [
  createMockActivity({
    instance_id: '12345678901',
    period: '2021-04-23T19:30:00Z',
    activity_hash: 123456,
  }),
  createMockActivity({
    instance_id: '12345678902',
    period: '2021-04-23T20:15:00Z',
    activity_hash: 789012,
    kills: 200,
    deaths: 3,
  }),
  createMockActivity({
    instance_id: '12345678903',
    period: '2021-04-23T21:00:00Z',
    activity_hash: 345678,
    completed: false,
    standing: 1,
  }),
];
