export interface PlatformAccount {
  platformType: number;
  membershipId: string;
  displayName: string;
  platformGroups: PlatformGroup[];
}

export interface PlatformGroup {
  game: string;
  activities: any[]; // TODO: Replace with proper activity type
} 