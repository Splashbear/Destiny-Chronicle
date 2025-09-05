export interface PlayerSearchDisplay {
  displayName: string;
  membershipId: string;
  platform: string;
  game: 'D1' | 'D2';
  iconPath?: string;
  isPublic?: boolean;
}
