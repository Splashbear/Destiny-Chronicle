/** Map a platform string (Xbox, PlayStation, Steam, …) to Bungie membershipType. */
export function platformIdFromName(platform: string | undefined): number {
  if (!platform) return 0;
  const p = platform.toLowerCase();
  if (p.includes('xbox')) return 1;
  if (p.includes('playstation') || p.includes('psn') || p.includes('ps')) return 2;
  if (p.includes('steam') || p.includes('pc')) return 3;
  if (p.includes('blizzard') || p.includes('battlenet')) return 4;
  if (p.includes('stadia')) return 5;
  if (p.includes('epic')) return 6;
  return 0;
}

/** Short display name for platform tabs (mobile-friendly). */
export function platformShortName(platform: string): string {
  if (!platform) return '';
  const p = platform.toLowerCase();
  if (p.includes('xbox')) return 'Xbox';
  if (p.includes('playstation') || p.includes('psn')) return 'PS';
  if (p.includes('steam')) return 'Steam';
  if (p.includes('blizzard') || p.includes('battlenet')) return 'BNet';
  if (p.includes('stadia')) return 'Stadia';
  if (p.includes('epic')) return 'Epic';
  return platform;
}

export function classIconUrl(className?: string): string | undefined {
  if (!className) return undefined;
  const c = className.toLowerCase();
  if (c.includes('hunter')) return 'assets/icons/destiny/class-hunter-svgrepo-com.svg';
  if (c.includes('titan')) return 'assets/icons/destiny/class-titan-svgrepo-com.svg';
  if (c.includes('warlock')) return 'assets/icons/destiny/class-warlock-svgrepo-com.svg';
  return undefined;
}

export function platformIconUrl(membershipType: number): string {
  switch (membershipType) {
    case 1:
      return 'assets/icons/platforms/xbox.png';
    case 2:
      return 'assets/icons/platforms/ps.png';
    case 3:
      return 'assets/icons/platforms/steam.png';
    case 4:
      return 'assets/icons/platforms/blizzard.svg';
    case 5:
      return 'assets/icons/platforms/stadia.png';
    case 6:
      return 'assets/icons/platforms/egs.png';
    default:
      return '';
  }
}

export function gameIconUrl(game: 'D1' | 'D2' | string): string {
  return game === 'D1'
    ? 'assets/icons/destiny/Destiny 1 icon.jpg'
    : 'assets/icons/destiny/Destiny 2 icon.png';
}
