import { ActivityHistory } from '../models/activity-history.model';
import { ActivityMode } from '../models/activity-types';
import { BungieMembershipType } from 'bungie-api-ts/user';
import { PlatformAccount } from '../models/platform-account.model';
import { APP_CONSTANTS } from '../constants/app.constants';

// Platform and game type constants
export const PLATFORM_TYPES = ['1', '2', '3', '4', '5'] as const;
export const GAME_TYPES = ['D1', 'D2'] as const;

// Type guards for platform and game types
export function isPlatformType(type: string): type is typeof PLATFORM_TYPES[number] {
  return (PLATFORM_TYPES as readonly string[]).includes(type);
}

export function isGameType(type: string): type is typeof GAME_TYPES[number] {
  return (GAME_TYPES as readonly string[]).includes(type);
}

// Type guard for ActivityHistory
export function isActivityHistory(activity: unknown): activity is ActivityHistory {
  return (
    typeof activity === 'object' &&
    activity !== null &&
    'period' in activity &&
    'activityDetails' in activity &&
    'values' in activity &&
    typeof (activity as ActivityHistory).period === 'string' &&
    typeof (activity as ActivityHistory).activityDetails === 'object' &&
    typeof (activity as ActivityHistory).values === 'object'
  );
}

// Type guard for ActivityMode
export function isActivityMode(type: string): type is ActivityMode {
  return ['Story', 'Raid', 'Dungeon', 'Strike', 'Crucible', 'Gambit', 'Other'].includes(type);
}

// Type guard for PlatformAccount
export function isPlatformAccount(value: unknown): value is PlatformAccount {
  return (
    typeof value === 'object' &&
    value !== null &&
    'platformType' in value &&
    'membershipId' in value &&
    'displayName' in value &&
    'platformGroups' in value &&
    Array.isArray((value as PlatformAccount).platformGroups) &&
    (value as PlatformAccount).platformGroups.every(group => 
      typeof group === 'object' &&
      group !== null &&
      'game' in group &&
      'activities' in group &&
      Array.isArray(group.activities)
    )
  );
}

// Type guard for required fields
export function hasRequiredFields(obj: unknown, requiredFields: string[]): boolean {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  for (const field of requiredFields) {
    if (!(field in obj)) {
      return false;
    }
  }

  return true;
}

// Type guard for activity data
export function isValidActivityData(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const activityData = data as { startTime: string; endTime: string; activityType: ActivityMode };
  
  if (!activityData.startTime || !activityData.endTime || !activityData.activityType) {
    return false;
  }

  const startDate = new Date(activityData.startTime);
  const endDate = new Date(activityData.endTime);
  
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return false;
  }

  if (startDate > endDate) {
    return false;
  }

  if (!Object.values(APP_CONSTANTS.ACTIVITY_TYPES).includes(activityData.activityType)) {
    return false;
  }

  return true;
}

// Type guard for membership type
export function isValidMembershipType(type: number): boolean {
  return [1, 2, 3, 4, 5].includes(type);
}

// Type guard for platform type
export function isValidPlatformType(type: number): boolean {
  return [1, 2, 3, 4, 5].includes(type);
}

// Type guard for date validation
export function isValidDate(date: string | Date): boolean {
  const d = new Date(date);
  return d instanceof Date && !isNaN(d.getTime());
}

// Type guard for platform account data
export function isValidPlatformAccountData(data: unknown): data is PlatformAccount[] {
  if (!Array.isArray(data)) {
    throw new Error('Platform account data must be an array');
  }

  return data.filter((item): item is PlatformAccount => {
    return (
      typeof item === 'object' &&
      item !== null &&
      'platformType' in item &&
      'membershipId' in item &&
      'displayName' in item
    );
  }).length === data.length;
} 