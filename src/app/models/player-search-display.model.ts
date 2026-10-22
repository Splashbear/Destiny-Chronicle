export interface PlayerSearchDisplay {
  displayName: string;
  membershipId: string;
  membershipType: number;
  platform: string;
  game: 'D1' | 'D2';
  iconPath?: string;
  isPublic?: boolean;
}
