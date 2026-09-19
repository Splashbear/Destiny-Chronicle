import { parseUsernames, looksLikeSingleBungieName, shouldSearchAsSingleUsername } from './search-usernames';

describe('search usernames', () => {
  it('splits comma-separated gamertags into two queries', () => {
    expect(parseUsernames('splashbear, puddlecubs')).toEqual(['splashbear', 'puddlecubs']);
    expect(shouldSearchAsSingleUsername('splashbear, puddlecubs')).toBe(false);
  });

  it('splits newline-separated names', () => {
    expect(parseUsernames('splashbear\npuddlecubs')).toEqual(['splashbear', 'puddlecubs']);
  });

  it('keeps a Bungie Name with # as one query even if the name has a comma', () => {
    expect(looksLikeSingleBungieName('Last, First#1234')).toBe(true);
    expect(shouldSearchAsSingleUsername('Last, First#1234')).toBe(true);
  });

  it('does not treat a comma list without # as one person', () => {
    expect(shouldSearchAsSingleUsername('splashbear, puddlecubs')).toBe(false);
    expect(looksLikeSingleBungieName('splashbear, puddlecubs')).toBe(false);
  });
});
