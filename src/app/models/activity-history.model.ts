export interface ActivityHistory {
  period: string;
  activityDetails: {
    referenceId: string;
    instanceId: string;
    mode: number;
  };
  values: {
    assists?: { basic: { value: number } };
    completed?: { basic: { value: number } };
    deaths?: { basic: { value: number } };
    kills?: { basic: { value: number } };
    score?: { basic: { value: number } };
    timePlayedSeconds?: { basic: { value: number } };
    team?: { basic: { value: number } };
    standing?: { basic: { value: number } };
    playerCount?: { basic: { value: number } };
  };
  validated?: boolean;
  validatedAt?: string;
  pgcrUnavailable?: boolean;
  /** Optional: character class string from PGCR (e.g., "Hunter", "Titan", "Warlock"). */
  characterClass?: string;
  /** Optional: membership type for platform identification (1=Xbox, 2=PSN, 3=Steam, etc.) */
  membershipType?: number;

  /**
   * Explicit game identifier added at persistence time so components can safely
   * distinguish Destiny 1 vs Destiny 2 rows without casting.
   */
  game?: 'D1' | 'D2';
  /** D1 mode-0 / cl_patch rows with no usable PGCR stats — do not zero-fill. */
  statsUnavailable?: boolean;
}

export interface Character {
  characterId: string;
  membershipType: number;
  membershipId: string;
  activities?: any[];
} 