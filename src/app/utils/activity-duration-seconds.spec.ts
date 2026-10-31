import {
  activityDurationSeconds,
  sumActivityDurationSeconds,
} from './activity-duration-seconds';

describe('activityDurationSeconds', () => {
  it('reads D2 timePlayedSeconds.basic.value', () => {
    expect(
      activityDurationSeconds({
        values: { timePlayedSeconds: { basic: { value: 900 } } },
      })
    ).toBe(900);
  });

  it('reads D1 activityDurationSeconds', () => {
    expect(
      activityDurationSeconds({
        values: { activityDurationSeconds: { basic: { value: 480 } } },
      })
    ).toBe(480);
  });

  it('sums a list (Account Summary time-in-activities path)', () => {
    const rows = [
      { values: { timePlayedSeconds: { basic: { value: 100 } } } },
      { values: { timePlayedSeconds: { basic: { value: 200 } } } },
      { values: {} },
    ];
    expect(sumActivityDurationSeconds(rows)).toBe(300);
  });

  it('empty list is 0 — UI must not treat that as success when count > 0', () => {
    expect(sumActivityDurationSeconds([])).toBe(0);
  });
});
