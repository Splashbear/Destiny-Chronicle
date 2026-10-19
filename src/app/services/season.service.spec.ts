import { SeasonService } from './season.service';

describe('SeasonService', () => {
  const seasons = new SeasonService();

  it('starts Episode Heresy on 4 February 2025', () => {
    expect(seasons.getSeasonForDate('D2', 2025, 2, 3)).toBe('Episode: Revenant');
    expect(seasons.getSeasonForDate('D2', 2025, 2, 4)).toBe('Episode: Heresy');
  });

  it('keeps the 2025 season names used on the site', () => {
    expect(seasons.getSeasonForDate('D2', 2025, 10, 19)).toBe('Season of Reclamation');
    expect(seasons.getSeasonForDate('D2', 2026, 10, 19)).toBe('Season of the Lawless');
  });
});
