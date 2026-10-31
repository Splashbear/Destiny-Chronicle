import { buildSharePermalinkUrl } from './share-permalink-url';

describe('buildSharePermalinkUrl', () => {
  it('builds date + players query', () => {
    const url = buildSharePermalinkUrl({
      date: '2021-04-23',
      players: [
        {
          displayName: 'A',
          membershipId: '1',
          membershipType: 2,
          game: 'D2',
          platform: 'PSN',
        },
      ],
    });
    expect(url.startsWith('/share?')).toBe(true);
    expect(url).toContain('date=2021-04-23');
    expect(url).toContain('players=');
  });

  it('adds text view flag', () => {
    expect(buildSharePermalinkUrl({ textView: true })).toBe('/share?view=text');
  });

  it('returns root when there is nothing to share', () => {
    expect(buildSharePermalinkUrl({})).toBe('/');
    expect(buildSharePermalinkUrl({ players: [] })).toBe('/');
  });
});
