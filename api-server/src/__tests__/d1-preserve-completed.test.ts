import { sourceCompleted, toLightActivityRow } from '../utils/light-activity-row';
import { LeanActivity } from '../types/lean-activity.types';

function lean(overrides: Partial<LeanActivity>): LeanActivity {
  return {
    instance_id: '2899343525',
    period: '2015-06-29T09:03:41Z',
    activity_hash: 2659248071,
    director_activity_hash: 0,
    mode: 4,
    membership_id: '4611686018429785995',
    membership_type: 1,
    display_name: 'Splashbear',
    character_id: '1',
    completed: null,
    deaths: 0,
    kills: 0,
    assists: 0,
    duration_seconds: 0,
    standing: 0,
    starting_phase_index: 0,
    fireteam_id: '',
    is_private: false,
    dump_id: '',
    game: 'D1',
    ...overrides,
  };
}

describe('sourceCompleted', () => {
  test('preserves 1/true and 0/false', () => {
    expect(sourceCompleted(1)).toBe(true);
    expect(sourceCompleted(1.0)).toBe(true);
    expect(sourceCompleted('1')).toBe(true);
    expect(sourceCompleted(true)).toBe(true);
    expect(sourceCompleted(0)).toBe(false);
    expect(sourceCompleted('0')).toBe(false);
    expect(sourceCompleted(false)).toBe(false);
  });

  test('does not invent a value when the source is null or unknown', () => {
    expect(sourceCompleted(null)).toBeNull();
    expect(sourceCompleted(undefined)).toBeNull();
    expect(sourceCompleted('')).toBeNull();
    expect(sourceCompleted('maybe')).toBeNull();
  });
});

describe('toLightActivityRow D1 stubs', () => {
  test('keeps completed=true when combat stats are missing', () => {
    const row = toLightActivityRow(
      lean({ completed: true, stats_missing: true, kills: 0, deaths: 0, assists: 0, duration_seconds: 0 })
    );
    expect(row.completed).toBe(true);
    expect(row.statsUnavailable).toBe(true);
    expect(row.kills).toBeNull();
    expect(row.deaths).toBeNull();
    expect(row.assists).toBeNull();
    expect(row.durationSeconds).toBeNull();
    expect(row.instanceId).toBe('2899343525');
  });

  test('keeps completed=false when combat stats are missing', () => {
    const row = toLightActivityRow(lean({ completed: false, stats_missing: true }));
    expect(row.completed).toBe(false);
    expect(row.statsUnavailable).toBe(true);
    expect(row.kills).toBeNull();
  });

  test('leaves completed null when the source did not supply one', () => {
    const row = toLightActivityRow(lean({ completed: null, stats_missing: true }));
    expect(row.completed).toBeNull();
    expect(row.statsUnavailable).toBe(true);
  });

  test('D2 rows with stats still pass completed through and are not marked unavailable', () => {
    const row = toLightActivityRow(
      lean({
        game: 'D2',
        completed: true,
        kills: 10,
        deaths: 2,
        assists: 3,
        duration_seconds: 600,
      })
    );
    expect(row.completed).toBe(true);
    expect(row.statsUnavailable).toBeUndefined();
    expect(row.kills).toBe(10);
    expect(row.durationSeconds).toBe(600);
  });
});
