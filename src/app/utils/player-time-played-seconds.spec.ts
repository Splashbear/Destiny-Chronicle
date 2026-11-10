import { playerTimePlayedSeconds } from './player-time-played-seconds';

describe('playerTimePlayedSeconds', () => {
  it('prefers the player timePlayedSeconds over instance activityDurationSeconds', () => {
    expect(
      playerTimePlayedSeconds({
        values: {
          timePlayedSeconds: { basic: { value: 132 } },
          activityDurationSeconds: { basic: { value: 13916 } },
        },
      })
    ).toBe(132);
  });

  it('prefers a numeric timePlayedSeconds over archive durationSeconds when both exist', () => {
    expect(
      playerTimePlayedSeconds({
        timePlayedSeconds: 101,
        durationSeconds: 4187,
        values: { activityDurationSeconds: { basic: { value: 4288 } } },
      })
    ).toBe(101);
  });

  it('falls back to archive durationSeconds only when no player-time field exists', () => {
    expect(playerTimePlayedSeconds({ durationSeconds: 801 })).toBe(801);
  });

  it('caps at 24 hours', () => {
    expect(
      playerTimePlayedSeconds({ values: { timePlayedSeconds: { basic: { value: 100000 } } } })
    ).toBe(86400);
  });
});
