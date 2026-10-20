import { MedalModeGroupId } from '../models/accomplishments-medals.model';

/**
 * Map a historical-stats medal onto a Firsts-style mode bucket.
 * Prefer Bungie mode ids on the definition; fall back to statId heuristics.
 */
export function medalModeGroup(statId: string, modes: number[] | null | undefined): MedalModeGroupId {
  const id = String(statId || '').toLowerCase();
  const m = Array.isArray(modes) ? modes : [];

  if (id.includes('gambit') || m.includes(63) || m.includes(75) || m.includes(89)) {
    return 'Gambit';
  }
  if (id.includes('trial') || m.includes(84) || m.includes(41) || m.includes(65)) {
    return 'Trials';
  }
  if (id.includes('ironbanner') || id.includes('iron_banner') || id.includes('ib_') || m.includes(19)) {
    return 'Iron Banner';
  }
  if (
    id.includes('strike') ||
    id.includes('vanguard') ||
    id.includes('nightfall') ||
    id.includes('pve_') ||
    m.includes(3) ||
    m.includes(16) ||
    m.includes(17) ||
    m.includes(18) ||
    m.includes(46)
  ) {
    return 'Strikes / Vanguard';
  }
  if (
    id.includes('pvp') ||
    id.includes('crucible') ||
    id.includes('control') ||
    id.includes('clash') ||
    m.includes(5) ||
    m.includes(10) ||
    m.includes(12) ||
    m.includes(15) ||
    m.includes(25) ||
    m.includes(31) ||
    m.includes(32) ||
    m.includes(37) ||
    m.includes(38) ||
    m.includes(39) ||
    m.includes(48) ||
    m.includes(59) ||
    m.includes(62) ||
    m.includes(80)
  ) {
    return 'Crucible';
  }
  return 'Other';
}

/** True when this historical-stats definition is a medal (group Medals = 3). */
export function isMedalHistoricalStat(def: { group?: number; medalTierHash?: number } | null | undefined): boolean {
  if (!def) return false;
  if (def.group === 3) return true;
  return def.medalTierHash != null && Number(def.medalTierHash) > 0;
}
