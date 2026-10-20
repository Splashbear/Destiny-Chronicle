export interface AccomplishmentBadge {
  hash: string;
  name: string;
  iconPath: string;
  acquired: number;
  total: number;
  /** True when any character / profile has every child collectible. */
  complete: boolean;
  remaining: number;
}

export interface AccomplishmentEmblem {
  hash: string;
  name: string;
  iconPath: string;
}

export interface AccountCollectionsResult {
  membershipId: string;
  membershipType: number;
  fetchedAt: string;
  badges: AccomplishmentBadge[];
  emblems: AccomplishmentEmblem[];
  status: 'ok' | 'hidden' | 'empty' | 'error';
  message?: string;
}
