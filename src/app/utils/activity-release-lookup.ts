import { ACTIVITY_RELEASE_DATES } from '../models/activity-release-dates';

/** Map Firsts card base names onto ACTIVITY_RELEASE_DATES keys. */
const RELEASE_ALIASES: Record<string, string> = {
  'Shattered Throne': 'The Shattered Throne',
  'The Shattered Throne': 'The Shattered Throne',
  "Warlord's Ruin": "Warlord's Ruin",
  'Warlords Ruin': "Warlord's Ruin",
  'Red War (Base Game)': 'Red War',
  'Season of the Outlaw (Forsaken)': 'Season of the Outlaw',
  'The Desert Perpetual (Epic): Contest': 'The Desert Perpetual: Epic',
  'The Desert Perpetual (Epic)': 'The Desert Perpetual: Epic',
  'Desert Perpetual (Epic): Contest': 'The Desert Perpetual: Epic',
  'Desert Perpetual (Epic)': 'The Desert Perpetual: Epic',
  'The Desert Perpetual: Epic: Contest': 'The Desert Perpetual: Epic',
  'The Desert Perpetual: Epic: Standard': 'The Desert Perpetual: Epic',
};

/**
 * Release day for a raid, dungeon, story expansion/season, Pantheon encounter, or event.
 * Remakes that share a D1 name use the "(D2)" key when game is D2.
 */
export function lookupActivityReleaseDate(baseName: string, game: 'D1' | 'D2'): string | null {
  const raw = String(baseName || '').trim();
  if (!raw) return null;

  // Epic Desert Perpetual launched later than Standard — match before the base raid key.
  if (/desert\s*perpetual/i.test(raw) && /\bepic\b/i.test(raw)) {
    return ACTIVITY_RELEASE_DATES['The Desert Perpetual: Epic'] || null;
  }

  for (const candidate of releaseLookupCandidates(raw)) {
    const aliased = RELEASE_ALIASES[candidate] || candidate;
    if (game === 'D2') {
      const d2Key = `${aliased} (D2)`;
      if (ACTIVITY_RELEASE_DATES[d2Key]) return ACTIVITY_RELEASE_DATES[d2Key];
    }
    if (ACTIVITY_RELEASE_DATES[aliased]) return ACTIVITY_RELEASE_DATES[aliased];
    if (ACTIVITY_RELEASE_DATES[candidate]) return ACTIVITY_RELEASE_DATES[candidate];
  }
  return null;
}

/** Full name, alias, and post-colon fragment (e.g. Pantheon encounter title). */
function releaseLookupCandidates(raw: string): string[] {
  const out: string[] = [raw];
  const colon = raw.indexOf(':');
  if (colon >= 0) {
    const after = raw.slice(colon + 1).trim();
    if (after && !out.includes(after)) out.push(after);
  }
  return out;
}
