/** One earned medal (count > 0) for Accomplishments. */
export interface AccomplishmentMedal {
  statId: string;
  name: string;
  description: string;
  iconPath: string;
  count: number;
  modeGroup: MedalModeGroupId;
  subtype: MedalSubtypeId;
}

/** Top-level mode buckets (UI: Crucible / Gambit / Vanguard). */
export type MedalModeGroupId = 'Crucible' | 'Gambit' | 'Vanguard' | 'Other';

export const MEDAL_MODE_GROUP_ORDER: MedalModeGroupId[] = [
  'Crucible',
  'Gambit',
  'Vanguard',
  'Other',
];

/** Braytech-style subtype within a mode. */
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
