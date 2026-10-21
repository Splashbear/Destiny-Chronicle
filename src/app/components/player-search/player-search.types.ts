/** Shared types for player-search view models (CODE_CLEANUP_SPEC). */
import { SafeHtml } from '@angular/platform-browser';
import { ActivityHistory, Character } from '../../models/activity-history.model';
import { ActivityWithMembership } from '../../models/activity-with-membership.model';

export interface TypeGroup {
  name: string;
  type: string;
  icon: SafeHtml | null;
  activities: ActivityWithMembership[];
  image?: SafeHtml | null;
  isD1: boolean;
  /** Track PGCR instanceIds already included to prevent cross-platform duplicates */
  seenInstanceIds?: Set<string>;
}

export interface YearGroup {
  year: string;
  typeGroups: TypeGroup[];
}

export interface ChronologicalActivityRow {
  activity: ActivityWithMembership;
  activityName: string;
  activityType: string;
  version: string;
  isD1: boolean;
  game: 'D1' | 'D2';
}

export interface GameGroup {
  game: 'D1' | 'D2';
  yearGroups: YearGroup[];
}

export type CharacterWithGame = Character & {
  game?: 'D1' | 'D2';
  mode?: number;
  membershipType: number;
  membershipId: string;
};

export interface ActivityCache {
  activities: ActivityHistory[];
  timestamp: number;
  type: string;
  game: string;
}

export interface VerificationResult {
  profileName: string;
  characterId: string;
  characterClass: string;
  apiCount: number;
  dbCount: number;
  synced: boolean;
  missingIds: string[];
}

export interface TitleObjective {
  complete: boolean;
  progress?: number;
  completionValue?: number;
  objectiveHash?: number;
  visible?: boolean;
}

export interface TitleRecord {
  completed: boolean;
  objectives?: TitleObjective[];
  state: number;
  completedCount?: number;
}

export interface ProfileRecordsResponse {
  data?: {
    records?: { [key: string]: TitleRecord };
    privacy?: number;
  };
  error?: string;
}
