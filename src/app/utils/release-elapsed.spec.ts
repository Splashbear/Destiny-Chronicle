import { formatReleaseElapsed } from './release-elapsed';
import { lookupActivityReleaseDate } from './activity-release-lookup';
import { fireteamNamesFromPgcr, shortFireteamName } from './firsts-fireteam';

describe('formatReleaseElapsed', () => {
  it('is Day One when the clear is on the release calendar day', () => {
    expect(formatReleaseElapsed('2021-12-07', '2021-12-07T20:15:00Z')).toBe('Day One');
  });

  it('counts days from release to the first clear', () => {
    expect(formatReleaseElapsed('2019-10-29', '2019-11-02T18:00:00Z')).toBe('4 days');
    expect(formatReleaseElapsed('2022-05-27', '2022-05-28T12:00:00Z')).toBe('1 day');
  });

  it('uses years, months, and days like the spreadsheet', () => {
    expect(formatReleaseElapsed('2018-09-25', '2018-11-07T16:00:00Z')).toBe('1 month, 13 days');
    expect(formatReleaseElapsed('2023-05-26', '2023-06-27T16:00:00Z')).toBe('1 month, 1 day');
  });

  it('returns null when the clear is before release or the dates are bad', () => {
    expect(formatReleaseElapsed('2021-12-07', '2021-12-06T12:00:00Z')).toBeNull();
    expect(formatReleaseElapsed('bad', '2021-12-07T12:00:00Z')).toBeNull();
  });
});

describe('lookupActivityReleaseDate', () => {
  it('finds dungeon and remake raid dates', () => {
    expect(lookupActivityReleaseDate('The Shattered Throne', 'D2')).toBe('2018-09-25');
    expect(lookupActivityReleaseDate('Shattered Throne', 'D2')).toBe('2018-09-25');
    expect(lookupActivityReleaseDate('Vault of Glass', 'D2')).toBe('2021-05-22');
    expect(lookupActivityReleaseDate('Vault of Glass', 'D1')).toBe('2014-09-16');
    expect(lookupActivityReleaseDate("Warlord's Ruin", 'D2')).toBe('2023-12-01');
  });

  it('finds story expansion, season, Pantheon, and Rite dates', () => {
    expect(lookupActivityReleaseDate('Red War', 'D2')).toBe('2017-09-06');
    expect(lookupActivityReleaseDate('Season of the Wish', 'D2')).toBe('2023-11-28');
    expect(lookupActivityReleaseDate('Episode: Heresy', 'D2')).toBe('2025-02-04');
    expect(lookupActivityReleaseDate('The Pantheon: Atraks Sovereign', 'D2')).toBe('2024-04-30');
    expect(lookupActivityReleaseDate('Atraks Sovereign', 'D2')).toBe('2024-04-30');
    expect(lookupActivityReleaseDate('Pantheon: Calus Resplendent', 'D2')).toBe('2026-06-09');
    expect(lookupActivityReleaseDate('Rite of the Nine', 'D2')).toBe('2025-05-06');
    expect(lookupActivityReleaseDate('The Dark Below', 'D1')).toBe('2014-12-09');
    expect(lookupActivityReleaseDate('The Edge of Fate', 'D2')).toBe('2025-07-15');
    expect(lookupActivityReleaseDate('Season of Reclamation', 'D2')).toBe('2025-07-15');
    expect(lookupActivityReleaseDate('Renegades', 'D2')).toBe('2025-12-02');
    expect(lookupActivityReleaseDate('The Desert Perpetual', 'D2')).toBe('2025-07-19');
    expect(lookupActivityReleaseDate('The Desert Perpetual: Epic', 'D2')).toBe('2025-09-27');
    expect(lookupActivityReleaseDate('The Desert Perpetual (Epic): Contest', 'D2')).toBe('2025-09-27');
  });
});

describe('fireteamNamesFromPgcr', () => {
  it('prefers the short Bungie name and dedupes characters', () => {
    expect(shortFireteamName({
      bungieGlobalDisplayName: 'Yevinn',
      bungieGlobalDisplayNameCode: 1234,
      displayName: 'YevinnPSN',
    })).toBe('Yevinn');

    const names = fireteamNamesFromPgcr({
      entries: [
        { player: { destinyUserInfo: { membershipId: '1', bungieGlobalDisplayName: 'Yevinn', bungieGlobalDisplayNameCode: 1 } }, characterId: 'a' },
        { player: { destinyUserInfo: { membershipId: '1', bungieGlobalDisplayName: 'Yevinn', bungieGlobalDisplayNameCode: 1 } }, characterId: 'b' },
        { player: { destinyUserInfo: { membershipId: '2', displayName: 'BigCush' } }, characterId: 'c' },
        { player: { destinyUserInfo: { membershipId: '3', displayName: 'Guardian' } }, characterId: 'd' },
      ],
    });
    expect(names).toEqual(['Yevinn', 'BigCush']);
  });
});
