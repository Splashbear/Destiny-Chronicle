import { ActivityHistory } from './activity-history.model';

/** Activity row stamped with the selected account for date/browse UI. */
export interface ActivityWithMembership extends ActivityHistory {
  membershipId: string;
  membershipType: number;
  displayName: string;
  platform: string;
  game: 'D1' | 'D2';
  iconPath?: string;
}
