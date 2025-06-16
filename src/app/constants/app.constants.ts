import { ActivityMode } from '../models/activity-types';

export const APP_CONSTANTS = {
  ACTIVITY_TYPES: {
    STORY: 'Story' as ActivityMode,
    PATROL: 'Patrol' as ActivityMode,
    PUBLIC_EVENT: 'Public Event' as ActivityMode,
    RAID: 'Raid' as ActivityMode,
    DUNGEON: 'Dungeon' as ActivityMode,
    STRIKE: 'Strike' as ActivityMode,
    NIGHTFALL: 'Nightfall' as ActivityMode,
    LOST_SECTOR: 'Lost Sector' as ActivityMode,
    EXOTIC_MISSION: 'Exotic Mission' as ActivityMode,
    SEASONAL: 'Seasonal' as ActivityMode,
    SEASONAL_EVENT: 'Seasonal Event' as ActivityMode,
    CRUCIBLE: 'Crucible' as ActivityMode,
    GAMBIT: 'Gambit' as ActivityMode,
    OTHER: 'Other' as ActivityMode
  }
} as const; 