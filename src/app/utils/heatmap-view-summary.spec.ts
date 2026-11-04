import {
  buildHeatmapViewSummary,
  describeScopedCharacters,
  describeScopedPlatforms,
} from './heatmap-view-summary';

describe('heatmap-view-summary', () => {
  it('names a single scoped platform and lists a few when cards filter', () => {
    expect(describeScopedPlatforms(['Xbox'], { accountFilterActive: true })).toBe('Xbox');
    expect(
      describeScopedPlatforms(['Xbox', 'PSN'], { accountFilterActive: true })
    ).toBe('Xbox · PSN');
    expect(
      describeScopedPlatforms(['Xbox', 'PSN', 'Steam', 'Epic'], {
        accountFilterActive: true,
      })
    ).toBe('4 platforms');
  });

  it('keeps All platforms when no account-card filter is active', () => {
    expect(
      describeScopedPlatforms(['Xbox', 'PSN', 'Steam'], { accountFilterActive: false })
    ).toBe('All platforms');
  });

  it('prefers an explicit platform selection over the scoped list', () => {
    expect(
      describeScopedPlatforms(['Xbox', 'PSN'], {
        accountFilterActive: true,
        selectedName: 'Xbox',
      })
    ).toBe('Xbox');
  });

  it('describes characters under an account-card filter', () => {
    expect(
      describeScopedCharacters(['D2 Xbox Titan'], { accountFilterActive: true })
    ).toBe('D2 Xbox Titan');
    expect(
      describeScopedCharacters(['A', 'B', 'C'], { accountFilterActive: true })
    ).toBe('3 characters');
    expect(
      describeScopedCharacters(['A', 'B'], { accountFilterActive: false })
    ).toBe('All characters');
  });

  it('builds the Showing line without duplicating platform when a character is picked', () => {
    expect(
      buildHeatmapViewSummary({
        character: 'D2 Xbox Titan',
        platform: 'Xbox',
        year: 'All years',
        characterIsSpecific: true,
      })
    ).toBe('D2 Xbox Titan · All years');
    expect(
      buildHeatmapViewSummary({
        character: 'All characters',
        platform: 'Xbox · PSN',
        year: 'All years',
        season: 'The Taken King',
        characterIsSpecific: false,
      })
    ).toBe('All characters · Xbox · PSN · All years · The Taken King');
  });
});
