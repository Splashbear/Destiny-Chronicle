import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { STORY_RELEASE_ANCHORS } from '../config/story-first-missions';

/** Story release ids that are the classic “first ever” tutorial missions. */
export const FIRST_EVER_STORY_RELEASE_IDS = new Set(['d1-base', 'd2-red-war']);

/**
 * Pick the First Ever completion from already-loaded Guardian Firsts for one game.
 * Prefers A Guardian Rises (D1) / Homecoming (D2), then any story, then earliest first.
 */
export function pickFirstEverFromFirsts(
  list: ActivityFirstCompletion[],
  game: 'D1' | 'D2'
): ActivityFirstCompletion | undefined {
  const scoped = (list || []).filter(f => f.game === game);
  if (!scoped.length) return undefined;

  const anchors = STORY_RELEASE_ANCHORS.filter(
    a => FIRST_EVER_STORY_RELEASE_IDS.has(a.releaseId) && a.game === game
  );
  const tutorialNames = new Set(anchors.map(a => a.label));
  const tutorialRefs = new Set(anchors.flatMap(a => a.referenceIds));

  const byDate = (a: ActivityFirstCompletion, b: ActivityFirstCompletion) =>
    new Date(a.completionDate || a.period).getTime() -
    new Date(b.completionDate || b.period).getTime();

  const tutorials = scoped.filter(
    f =>
      (f.storyReleaseId && FIRST_EVER_STORY_RELEASE_IDS.has(f.storyReleaseId)) ||
      tutorialNames.has(f.name) ||
      tutorialRefs.has(String(f.referenceId))
  );
  const stories = scoped.filter(f => f.type === 'story');
  const pool = tutorials.length ? tutorials : stories.length ? stories : scoped;
  return [...pool].sort(byDate)[0];
}
