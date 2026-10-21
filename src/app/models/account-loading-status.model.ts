/** Per-account status shown in the loading modal (CODE_CLEANUP_SPEC). */
export interface AccountLoadingStatus {
  accountKey: string;
  displayName: string;
  platform: string;
  game: 'D1' | 'D2';
  membershipType: number;
  status:
    | 'fetching-profile'
    | 'loading-characters'
    | 'fetching-activities'
    | 'organizing-pgcrs'
    | 'displaying-activities'
    | 'complete'
    | 'error';
  progress?: number;
  message: string;
  timestamp: Date;
}
