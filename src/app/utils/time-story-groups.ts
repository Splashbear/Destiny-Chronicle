/**
 * Coarse groups for "Your Destiny, by the hours" section 1.
 * Mapped from Activity Breakdown section keys / modes so the two views agree.
 * Trials stays its own group (TRIALS_BREAKDOWN_SPEC).
 */
export const TIME_STORY_GROUP_IDS = [
  'raids',
  'dungeons',
  'crucible',
  'trials',
  'gambit',
  'strikes-nightfalls',
  'story-patrol-seasonal',
  'other',
] as const;

export type TimeStoryGroupId = (typeof TIME_STORY_GROUP_IDS)[number];

export const TIME_STORY_GROUP_LABELS: Record<TimeStoryGroupId, string> = {
  raids: 'Raids',
  dungeons: 'Dungeons',
  crucible: 'Crucible',
  trials: 'Trials',
  gambit: 'Gambit',
  'strikes-nightfalls': 'Strikes & Nightfalls',
  'story-patrol-seasonal': 'Story/Patrol/Seasonal',
  other: 'Other',
};

/** Colors chosen for contrast on near-black panels (#14110D). */
export const TIME_STORY_GROUP_COLORS: Record<TimeStoryGroupId, string> = {
  raids: '#E8C36A',
  dungeons: '#C4843A',
  crucible: '#D4544A',
  trials: '#EDE6DA',
  gambit: '#3D9B6E',
  'strikes-nightfalls': '#5B8AD6',
  'story-patrol-seasonal': '#9B7AC8',
  other: '#8A8276',
};

/** PvE rotator / story / patrol modes that collapse into Story/Patrol/Seasonal. */
const STORY_PATROL_SEASONAL_MODES = new Set([
  2, // Story
  6, // Patrol
  7, // AllPvE
  40, // Social
  77, // Menagerie
  78, // VexOffensive
  79, // NightmareHunt
  83, // Sundial
  85, // Dares
  86, // Offensive
  87, // LostSector
  92, // Relic
]);

const STORY_PATROL_SEASONAL_SECTIONS = new Set([
  'seasonal-arena',
  'battlegrounds',
  'exotic-story-missions',
  'story-strikes',
  'prison-of-elders',
]);

/**
 * Map an Activity Breakdown section key (override or `mode-N`) to a time-story group.
 */
export function timeStoryGroupFromSection(
  sectionKey: string,
  mode: number = 0
): TimeStoryGroupId {
  if (sectionKey === 'dungeon' || mode === 82) return 'dungeons';
  if (sectionKey === 'trials-osiris' || sectionKey === 'trials-nine') return 'trials';
  if (sectionKey === 'pvp') return 'crucible';
  if (sectionKey === 'gambit') return 'gambit';
  if (sectionKey === 'strikes' || sectionKey === 'nightfall') return 'strikes-nightfalls';
  if (sectionKey === 'mode-4' || mode === 4) return 'raids';
  if (STORY_PATROL_SEASONAL_SECTIONS.has(sectionKey) || STORY_PATROL_SEASONAL_MODES.has(mode)) {
    return 'story-patrol-seasonal';
  }
  return 'other';
}

export function isTimeStoryGroupId(value: unknown): value is TimeStoryGroupId {
  return typeof value === 'string' && (TIME_STORY_GROUP_IDS as readonly string[]).includes(value);
}
