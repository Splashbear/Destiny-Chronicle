import { anyFlawlessFamilyMatches, flawlessFamilyMatches } from './flawless-family-match';

describe('flawlessFamilyMatches', () => {
  it('matches exact and The-stripped Pantheon labels', () => {
    expect(flawlessFamilyMatches('The Pantheon', 'The Pantheon')).toBe(true);
    expect(flawlessFamilyMatches('The Pantheon', 'Pantheon')).toBe(true);
    expect(flawlessFamilyMatches('Last Wish', 'Last Wish')).toBe(true);
    expect(flawlessFamilyMatches('Scourge of the Past', 'Garden of Salvation')).toBe(false);
  });

  it('matches any list entry', () => {
    expect(anyFlawlessFamilyMatches('Vault of Glass', ['Last Wish', 'Vault of Glass'])).toBe(true);
    expect(anyFlawlessFamilyMatches('Crown of Sorrow', ['Last Wish'])).toBe(false);
  });
});
