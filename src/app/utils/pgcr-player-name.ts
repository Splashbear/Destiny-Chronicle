/** Prefer Bungie Name (Name#1234) over legacy displayName / generic "Guardian". */
export function resolvePgcrPlayerName(destinyUserInfo: {
  displayName?: string;
  bungieGlobalDisplayName?: string;
  bungieGlobalDisplayNameCode?: number | string;
} | null | undefined): string {
  if (!destinyUserInfo) {
    return 'Guardian';
  }

  const global = destinyUserInfo.bungieGlobalDisplayName?.trim();
  const code = destinyUserInfo.bungieGlobalDisplayNameCode;
  if (global && code != null && String(code) !== '') {
    return `${global}#${code}`;
  }

  const legacy = destinyUserInfo.displayName?.trim();
  if (legacy && legacy.toLowerCase() !== 'guardian') {
    return legacy;
  }

  if (global) {
    return global;
  }

  return 'Guardian';
}

export function pickBestPlayerDisplayName(current: string, next: string | undefined): string {
  if (!next || next === 'Guardian') {
    return current;
  }
  if (!current || current === 'Guardian') {
    return next;
  }
  if (next.includes('#') && !current.includes('#')) {
    return next;
  }
  if (current.includes('#') && !next.includes('#')) {
    return current;
  }
  return next.length > current.length ? next : current;
}
