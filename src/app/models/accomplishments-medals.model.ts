/** One MEDALS_LIST medal for Accomplishments (count may be 0 if unearned). */
export interface AccomplishmentMedal {
  statId: string;
  name: string;
  description: string;
  iconPath: string;
  /** Times earned from record objective progress; 0 = unearned. */
  count: number;
  modeGroup: MedalModeGroupId;
  subtype: MedalSubtypeId;
  /** Presentation / catalog order when known (lower = earlier in Bungie tree). */
  catalogOrder?: number;
}

/** Top-level mode buckets (UI: Crucible / Gambit / Vanguard). */
export type MedalModeGroupId = 'Crucible' | 'Gambit' | 'Vanguard' | 'Other';

/** UI always shows these three mode tabs (MEDALS_LIST top level). */
export const MEDAL_MODE_GROUP_ORDER: MedalModeGroupId[] = [
  'Crucible',
  'Gambit',
  'Vanguard',
];

/**
 * Subtypes from MEDALS_LIST (D2) and D1_MEDALS_LIST (D1 tiers).
 * Heuristic fallbacks may still produce 'Other'.
 */
export type MedalSubtypeId =
  | 'Multi + Streak'
  | 'Combat'
  | 'Weapons'
  | 'Class'
  | 'Gold Tier'
  | 'Gametypes'
  | 'Iron Banner'
  | 'Crimson Days'
  | 'Trials of Osiris'
  | 'Elemental'
  | 'Prowess'
  | 'Invading'
  | 'Speed'
  | 'Team'
  | 'Supers'
  | 'Tier 1'
  | 'Tier 2'
  | 'Tier 3'
  | 'Tier 4'
  | 'Tier 5'
  | 'Tier 6'
  | 'Tier 7'
  | 'Ability'
  | 'Completions'
  | 'Multi-kill'
  | 'Super'
  | 'Other';

export const MEDAL_SUBTYPE_ORDER: MedalSubtypeId[] = [
  'Multi + Streak',
  'Combat',
  'Weapons',
  'Class',
  'Gold Tier',
  'Gametypes',
  'Iron Banner',
  'Crimson Days',
  'Trials of Osiris',
  'Elemental',
  'Prowess',
  'Invading',
  'Speed',
  'Team',
  'Supers',
  'Tier 1',
  'Tier 2',
  'Tier 3',
  'Tier 4',
  'Tier 5',
  'Tier 6',
  'Tier 7',
  'Ability',
  'Completions',
  'Multi-kill',
  'Super',
  'Other',
];

export interface MedalModeGroup {
  id: MedalModeGroupId;
  medals: AccomplishmentMedal[];
}

export interface AccountMedalsResult {
  membershipId: string;
  membershipType: number;
  fetchedAt: string;
  groups: MedalModeGroup[];
  totalEarned: number;
  /** Privacy / empty / error messaging for the UI. */
  status: 'ok' | 'hidden' | 'empty' | 'error';
  message?: string;
}
