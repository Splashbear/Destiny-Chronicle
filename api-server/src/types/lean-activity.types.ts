/**
 * Lean activity structure from Parquet archives.
 * Maps to columns in splashbear_activities.parquet and cl_by_mid_hash_v3.
 */
export interface LeanActivity {
  instance_id: string;
  period: string;
  activity_hash: number;
  director_activity_hash: number;
  mode: number;
  membership_id: string;
  membership_type: number;
  display_name: string;
  character_id: string;
  completed: boolean;
  deaths: number;
  kills: number;
  assists: number;
  duration_seconds: number;
  standing: number;
  starting_phase_index: number;
  fireteam_id: string;
  is_private: boolean;
  dump_id: string;
  game: 'D1' | 'D2';
}

/**
 * Coverage watermark indicates the maximum instance_id available in the archive.
 * Activities with instance_id <= max_instance_id are available in the archive;
 * higher instance_ids must be fetched from live Bungie API.
 */
export interface CoverageWatermark {
  max_instance_id: string;
  as_of: string;
  dump_id: string;
}

/**
 * Membership activities response.
 */
export interface MembershipActivitiesResponse {
  membership_id: string;
  activities: LeanActivity[];
  source: 'archive' | 'mixed' | 'live';
  count: number;
}

/**
 * Single instance response.
 */
export interface InstanceResponse {
  instance_id: string;
  activity: LeanActivity | null;
  source: 'archive' | 'live';
}

/**
 * Light activity row for player activities API.
 * Subset of LeanActivity with fields relevant for browsing.
 */
export interface LightActivityRow {
  instanceId: string;
  period: string;
  activityHash: number;
  mode: number;
  membershipId: string;
  membershipType: number;
  characterId: string;
  completed: boolean;
  deaths: number;
  kills?: number;
  assists?: number;
  durationSeconds: number;
  game: 'D1' | 'D2';
  displayName?: string;
}

/**
 * Coverage information for player activities response.
 */
export interface PlayerActivitiesCoverage {
  level: 'full' | 'partial' | 'absent';
  source: 'lite' | 'extract' | 'compact_ids' | 'none' | 'pending' | 'archive';
  rowCount: number;
  distinctInstances?: number;
  minPeriod: string | null;
  maxPeriod: string | null;
  watermarkNote?: string;
  indexComplete?: boolean;
  filtersApplied?: boolean;
  notes?: string[];
}

/**
 * Player activities response for GET /players/:membershipId/activities
 */
export interface PlayerActivitiesResponse {
  membershipId: string;
  coverage: PlayerActivitiesCoverage;
  activities: LightActivityRow[];
}

/**
 * Batch player activities response for POST /players/activities/batch
 */
export interface BatchPlayerActivitiesResponse {
  [membershipId: string]: PlayerActivitiesResponse;
}
