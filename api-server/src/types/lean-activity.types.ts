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
