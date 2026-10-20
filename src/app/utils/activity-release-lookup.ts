import { ACTIVITY_RELEASE_DATES } from '../models/activity-release-dates';

/** Map Firsts card base names onto ACTIVITY_RELEASE_DATES keys. */
const RELEASE_ALIASES: Record<string, string> = {
  'Shattered Throne': 'The Shattered Throne',
  'The Shattered Throne': 'The Shattered Throne',
  "Warlord's Ruin": "Warlord's Ruin",
  'Warlords Ruin': "Warlord's Ruin",
};

/**
 * Release day for a raid or dungeon base name.
 * Remakes that share a D1 name use the "(D2)" key when game is D2.
 */
export function lookupActivityReleaseDate(baseName: string, game: 'D1' | 'D2'): string | null {
  const raw = String(baseName || '').trim();
  if (!raw) return null;
  const aliased = RELEASE_ALIASES[raw] || raw;
  if (game === 'D2') {
    const d2Key = `${aliased} (D2)`;
    if (ACTIVITY_RELEASE_DATES[d2Key]) return ACTIVITY_RELEASE_DATES[d2Key];
  }
  return ACTIVITY_RELEASE_DATES[aliased] || ACTIVITY_RELEASE_DATES[raw] || null;
}
