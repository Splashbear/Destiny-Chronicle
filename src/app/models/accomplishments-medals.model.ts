/** One earned medal (count > 0) for Accomplishments. */
export interface AccomplishmentMedal {
  statId: string;
  name: string;
  description: string;
  iconPath: string;
  count: number;
  modeGroup: MedalModeGroupId;
}

export type MedalModeGroupId =
  | 'Crucible'
  | 'Gambit'
  | 'Strikes / Vanguard'
  | 'Trials'
  | 'Iron Banner'
  | 'Other';

export const MEDAL_MODE_GROUP_ORDER: MedalModeGroupId[] = [
  'Crucible',
  'Gambit',
  'Strikes / Vanguard',
  'Trials',
  'Iron Banner',
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
