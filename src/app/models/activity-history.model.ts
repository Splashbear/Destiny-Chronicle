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
  };
}

export interface Character {
  characterId: string;
  membershipType: number;
  membershipId: string;
  activities?: any[];
} 