export interface ActivityTypeOption {
  label: string;
  d1Mode?: number;
  d2Mode?: number;
}

export const ACTIVITY_TYPE_OPTIONS: ActivityTypeOption[] = [
  { label: 'All', d1Mode: undefined, d2Mode: undefined },
  { label: 'Story', d1Mode: 2, d2Mode: 2 },
  { label: 'Raid', d1Mode: 4, d2Mode: 4 },
  { label: 'Dungeon', d2Mode: 82 }, // Dungeons are D2 only
  { label: 'Strike', d1Mode: 3, d2Mode: 3 },
  { label: 'Nightfall', d1Mode: 16, d2Mode: 16 },
  { label: 'Crucible', d1Mode: 5, d2Mode: 5 },
  { label: 'Gambit', d2Mode: 63 },
  // Add more as needed
]; 