export interface ActivityDetails {
  instanceId: string;
  referenceId: number;
  mode: number;
  displayName?: string;
}

export interface Activity {
  name: string;
  completions: number;
  firstClear: Date;
  activityDetails?: ActivityDetails;
  period?: string;
  game?: string;
  // Add properties from ActivityFirstCompletion
  type?: string;
  completionDate?: string | Date;
  instanceId?: string;
  referenceId?: number;
  membershipId?: string;
  characterId?: string;
  mode?: number;
  values?: any;
  completed?: number | boolean;
}

export interface Title {
  name: string;
  completed: Date;
} 