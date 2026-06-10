/**
 * Pinnacle "Pantheon Events" for Guardian Firsts.
 * Legacy Pantheon (2024) and Monument of Triumph Pantheon (June 2026+) are separate cards.
 */

export type PantheonEventId = 'legacy-pantheon' | 'mot-pantheon';

export interface PantheonEventConfig {
  id: PantheonEventId;
  /** Card title on Guardian Firsts */
  cardTitle: string;
  /** Activity referenceIds for this Pantheon event card */
  hashes: string[];
  /** Fallback when hash unknown (manifest name contains any of these) */
  namePatterns: string[];
  /** Display order for versions within the card (substring match on activity name) */
  versionSortOrder: string[];
}

/** Original Pantheon: four raid encounters */
export const LEGACY_PANTHEON_CONFIG: PantheonEventConfig = {
  id: 'legacy-pantheon',
  cardTitle: 'The Pantheon',
  hashes: ['4169648176', '4169648177', '4169648179', '4169648182'],
  namePatterns: ['The Pantheon:'],
  versionSortOrder: [
    'Nezarec Sublime',
    'Rhulk Indomitable',
    'Oryx Exalted',
    'Atraks Sovereign'
  ]
};

/** Monument of Triumph Pantheon 2.0 (permanent, June 2026+) */
export const MOT_PANTHEON_CONFIG: PantheonEventConfig = {
  id: 'mot-pantheon',
  cardTitle: 'Monument of Triumph Pantheon',
  hashes: ['2530656885', '1516551982'],
  namePatterns: ['Monument of Triumph Pantheon', 'MoT Pantheon', 'Triumph Pantheon'],
  versionSortOrder: [
    'Morgeth Surpassing',
    'Calus Resplendent'
  ]
};

export const PANTHEON_EVENT_CONFIGS: PantheonEventConfig[] = [
  LEGACY_PANTHEON_CONFIG,
  MOT_PANTHEON_CONFIG
];

export const LEGACY_PANTHEON_HASHES = LEGACY_PANTHEON_CONFIG.hashes;
export const MOT_PANTHEON_HASHES = MOT_PANTHEON_CONFIG.hashes;

export function isLegacyPantheonActivity(referenceId: string | number, name?: string): boolean {
  if (isMotPantheonActivity(referenceId, name)) return false;
  const ref = String(referenceId);
  if (LEGACY_PANTHEON_HASHES.includes(ref)) return true;
  if (!name) return false;
  return LEGACY_PANTHEON_CONFIG.namePatterns.some((p) => name.includes(p));
}

export function isMotPantheonActivity(referenceId: string | number, name?: string): boolean {
  const ref = String(referenceId);
  if (MOT_PANTHEON_HASHES.includes(ref)) return true;
  if (!name) return false;
  // MoT uses "Pantheon: Boss" (no leading "The"); legacy uses "The Pantheon:"
  if (name.startsWith('Pantheon:') && !name.startsWith('The Pantheon:')) return true;
  return MOT_PANTHEON_CONFIG.namePatterns.some((p) => name.includes(p));
}

export function isAnyPantheonActivity(referenceId: string | number, name?: string): boolean {
  return isLegacyPantheonActivity(referenceId, name) || isMotPantheonActivity(referenceId, name);
}

export function pantheonEventForActivity(referenceId: string | number, name?: string): PantheonEventId | null {
  if (isMotPantheonActivity(referenceId, name)) return 'mot-pantheon';
  if (isLegacyPantheonActivity(referenceId, name)) return 'legacy-pantheon';
  return null;
}

export function getPantheonConfig(id: PantheonEventId): PantheonEventConfig {
  return id === 'mot-pantheon' ? MOT_PANTHEON_CONFIG : LEGACY_PANTHEON_CONFIG;
}
