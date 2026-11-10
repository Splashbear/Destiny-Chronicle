import {
  anniversaryCardFlavor,
  anniversaryWhenPhrase,
  formatActivityNameList,
} from './anniversary-share-flavor';

describe('anniversaryCardFlavor', () => {
  it('keeps type-aware wording for a single first', () => {
    expect(anniversaryCardFlavor([
      { activityName: "Darkness's Doorstep", yearsAgo: 6, type: 'guardian-first' },
    ])).toBe("Six years ago tonight, you stood in Darkness's Doorstep.");
  });

  it('lists every first in one sentence when years match', () => {
    expect(anniversaryCardFlavor([
      { activityName: "Darkness's Doorstep", yearsAgo: 6, type: 'guardian-first' },
      { activityName: 'The Shattered Throne', yearsAgo: 6, type: 'guardian-first' },
      { activityName: 'Leviathan', yearsAgo: 6, type: 'guardian-first' },
    ])).toBe(
      "Six years ago tonight, you first cleared Darkness's Doorstep, The Shattered Throne, and Leviathan."
    );
  });

  it('uses On this day when anniversary ages differ', () => {
    expect(anniversaryCardFlavor([
      { activityName: "Darkness's Doorstep", yearsAgo: 6, type: 'guardian-first' },
      { activityName: 'The Shattered Throne', yearsAgo: 8, type: 'guardian-first' },
      { activityName: 'Leviathan', yearsAgo: 9, type: 'guardian-first' },
    ])).toBe(
      "On this day, you first cleared Darkness's Doorstep, The Shattered Throne, and Leviathan."
    );
  });
});

describe('formatActivityNameList', () => {
  it('joins two and three names', () => {
    expect(formatActivityNameList(['A', 'B'])).toBe('A and B');
    expect(formatActivityNameList(['A', 'B', 'C'])).toBe('A, B, and C');
  });
});

describe('anniversaryWhenPhrase', () => {
  it('uses number words through fifteen', () => {
    expect(anniversaryWhenPhrase(6)).toBe('Six years ago tonight');
    expect(anniversaryWhenPhrase(1)).toBe('One year ago tonight');
  });
});
