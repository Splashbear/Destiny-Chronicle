import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { STORY_RELEASE_ANCHORS } from '../config/story-first-missions';

/**
 * Story release ids that are the true “first ever” tutorial missions.
 * D1: A Guardian Rises. D2: Homecoming (Red War) or A Guardian Rises (New Light).
 * Seasonal story anchors (e.g. Battleground: Behemoth) must never win First Ever.
 */
export const FIRST_EVER_STORY_RELEASE_IDS = new Set(['d1-base', 'd2-red-war', 'd2-new-light']);

/** Canonical tutorial display names by game (manifest / firsts list). */
export const FIRST_EVER_TUTORIAL_NAMES: Record<'D1' | 'D2', ReadonlySet<string>> = {
  D1: new Set(['A Guardian Rises']),
  D2: new Set(['Homecoming', 'A Guardian Rises']),
};

/** Known activity hashes for First Ever tutorials (all Homecoming variants + New Light). */
export function firstEverTutorialReferenceIds(game: 'D1' | 'D2'): Set<string> {
  const ids = new Set<string>();
  for (const a of STORY_RELEASE_ANCHORS) {
    if (a.game !== game || !FIRST_EVER_STORY_RELEASE_IDS.has(a.releaseId)) continue;
    for (const h of a.referenceIds) ids.add(String(h));
  }
  return ids;
}

/**
 * Pick the First Ever completion from already-loaded Guardian Firsts for one game.
 * Only Homecoming / A Guardian Rises qualify — never an arbitrary story milestone or playlist.
 */
export function pickFirstEverFromFirsts(
  list: ActivityFirstCompletion[],
  game: 'D1' | 'D2'
): ActivityFirstCompletion | undefined {
  const scoped = (list || []).filter(f => f.game === game);
  if (!scoped.length) return undefined;

  const tutorialNames = FIRST_EVER_TUTORIAL_NAMES[game];
  const tutorialRefs = firstEverTutorialReferenceIds(game);

  const byDate = (a: ActivityFirstCompletion, b: ActivityFirstCompletion) =>
    new Date(a.completionDate || a.period).getTime() -
    new Date(b.completionDate || b.period).getTime();

  const tutorials = scoped.filter(f => {
    const name = (f.name || '').trim();
    return (
      (f.storyReleaseId && FIRST_EVER_STORY_RELEASE_IDS.has(f.storyReleaseId)) ||
      (!!name && tutorialNames.has(name)) ||
      tutorialRefs.has(String(f.referenceId))
    );
  });
  if (!tutorials.length) return undefined;

  const named = tutorials.filter(f => {
    const name = (f.name || '').trim();
    return !!name && name !== 'Unknown Activity';
  });
  const pool = named.length ? named : tutorials;
  return [...pool].sort(byDate)[0];
}
