import { ActivityHistory } from './activity-history.model';

export interface ActivityWithMembership extends ActivityHistory {
  membershipType: number;
  membershipId: string;
  characterId: string;
}

export interface ActivityFirstCompletion {
  referenceId: number;
  period: string;
  game: 'D1' | 'D2';
  name: string;
  type: string;
  completionDate: string;
  instanceId: string;
  mode: number;
  completed: boolean;
  characterId: string;
} 