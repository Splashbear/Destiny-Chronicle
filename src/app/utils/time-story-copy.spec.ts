import {
  TIME_STORY_CHART_ARIA_LABEL,
  TIME_STORY_LABEL,
  TIME_STORY_LABEL_TOOLTIP,
  TIME_STORY_MEASUREMENT_NOTE,
  TIME_STORY_TITLE,
} from './time-story-copy';

describe('Time Story visible copy', () => {
  it('keeps the feature title and Time in activities label', () => {
    expect(TIME_STORY_TITLE).toBe('Your Destiny, by the hours');
    expect(TIME_STORY_LABEL).toBe('Time in activities');
    expect(TIME_STORY_CHART_ARIA_LABEL.startsWith('Time in activities')).toBeTrue();
  });

  it('discloses archive game duration and Bungie player time, without claiming all bars are personal participation', () => {
    const disclosure = `${TIME_STORY_LABEL_TOOLTIP} ${TIME_STORY_MEASUREMENT_NOTE} ${TIME_STORY_CHART_ARIA_LABEL}`;
    expect(disclosure).toContain('recorded game duration');
    expect(disclosure).toContain("player's recorded time");
    expect(TIME_STORY_LABEL_TOOLTIP).toContain('Archived entries use recorded game duration');
    expect(TIME_STORY_LABEL_TOOLTIP).toContain("Bungie entries use the player's recorded time where available");
    expect(TIME_STORY_LABEL_TOOLTIP).toContain('not a complete measure of personal participation');
    expect(TIME_STORY_MEASUREMENT_NOTE).toContain('Archived games use recorded game duration');
    expect(TIME_STORY_MEASUREMENT_NOTE).toContain("player's recorded time is used when it is available");
    expect(TIME_STORY_MEASUREMENT_NOTE).toContain('The headline time on this page is unchanged.');
    expect(disclosure.toLowerCase()).not.toContain('playtime');
  });
});
