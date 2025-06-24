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

  /**
   * Explicit game identifier added at persistence time so components can safely
   * distinguish Destiny 1 vs Destiny 2 rows without casting.
   */
  game?: 'D1' | 'D2';
}

export interface Character {
  characterId: string;
  membershipType: number;
  membershipId: string;
  activities?: any[];
} 