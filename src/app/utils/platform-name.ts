/** Bungie membershipType → display platform label. */
export function getPlatformName(membershipType: number | undefined): string {
  switch (membershipType) {
    case 1:
      return 'Xbox';
    case 2:
      return 'PlayStation';
    case 3:
      return 'Steam';
    case 4:
      return 'Blizzard';
    case 5:
      return 'Stadia';
    case 6:
      return 'Epic';
    default:
      return 'Unknown';
  }
}
