import {
  timeStoryGroupFromSection,
  TIME_STORY_GROUP_IDS,
  TIME_STORY_GROUP_LABELS,
} from './time-story-groups';

describe('timeStoryGroupFromSection', () => {
  it('maps Activity Breakdown keys onto the eight time-story groups', () => {
    expect(timeStoryGroupFromSection('mode-4', 4)).toBe('raids');
    expect(timeStoryGroupFromSection('dungeon', 82)).toBe('dungeons');
    expect(timeStoryGroupFromSection('pvp', 10)).toBe('crucible');
    expect(timeStoryGroupFromSection('trials-osiris', 84)).toBe('trials');
    expect(timeStoryGroupFromSection('trials-nine', 39)).toBe('trials');
    expect(timeStoryGroupFromSection('gambit', 63)).toBe('gambit');
    expect(timeStoryGroupFromSection('strikes', 3)).toBe('strikes-nightfalls');
    expect(timeStoryGroupFromSection('nightfall', 46)).toBe('strikes-nightfalls');
    expect(timeStoryGroupFromSection('mode-2', 2)).toBe('story-patrol-seasonal');
    expect(timeStoryGroupFromSection('mode-6', 6)).toBe('story-patrol-seasonal');
    expect(timeStoryGroupFromSection('seasonal-arena', 85)).toBe('story-patrol-seasonal');
    expect(timeStoryGroupFromSection('battlegrounds', 3)).toBe('story-patrol-seasonal');
    expect(timeStoryGroupFromSection('exotic-story-missions', 2)).toBe('story-patrol-seasonal');
    expect(timeStoryGroupFromSection('story-strikes', 2)).toBe('story-patrol-seasonal');
    expect(timeStoryGroupFromSection('prison-of-elders', 21)).toBe('story-patrol-seasonal');
    expect(timeStoryGroupFromSection('mode-0', 0)).toBe('other');
    expect(timeStoryGroupFromSection('sparrow-racing-league', 29)).toBe('other');
  });

  it('keeps Trials out of Crucible', () => {
    expect(timeStoryGroupFromSection('trials-osiris', 84)).not.toBe('crucible');
    expect(timeStoryGroupFromSection('pvp', 5)).toBe('crucible');
  });

  it('has a label for every group and never says playtime', () => {
    for (const id of TIME_STORY_GROUP_IDS) {
      const label = TIME_STORY_GROUP_LABELS[id];
      expect(label.length).toBeGreaterThan(0);
      expect(label.toLowerCase()).not.toContain('playtime');
    }
  });
});
