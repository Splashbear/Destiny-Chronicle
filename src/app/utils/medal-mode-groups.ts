import {
  MedalModeGroupId,
  MedalSubtypeId,
} from '../models/accomplishments-medals.model';

/**
 * Top-level mode: Crucible / Gambit / Vanguard (user-facing).
 * Trials & Iron Banner fold into Crucible as subtypes.
 */
export function medalModeGroup(statId: string, modes: number[] | null | undefined): MedalModeGroupId {
  const id = String(statId || '').toLowerCase();
  const m = Array.isArray(modes) ? modes : [];

  if (id.includes('gambit') || m.includes(63) || m.includes(75) || m.includes(89)) {
    return 'Gambit';
  }
  if (
    id.includes('strike') ||
    id.includes('vanguard') ||
    id.includes('nightfall') ||
    id.includes('pve') ||
    id.includes('patrol') ||
    m.includes(3) ||
    m.includes(16) ||
    m.includes(17) ||
    m.includes(18) ||
    m.includes(46) ||
    m.includes(86)
  ) {
    return 'Vanguard';
  }
  // Crucible + Trials / Iron Banner / Crimson (subtyped separately)
  if (
    id.includes('pvp') ||
    id.includes('crucible') ||
    id.includes('control') ||
    id.includes('clash') ||
    id.includes('trial') ||
    id.includes('ironbanner') ||
    id.includes('iron_banner') ||
    id.includes('crimson') ||
    id.includes('ib_') ||
    m.includes(5) ||
    m.includes(10) ||
    m.includes(12) ||
    m.includes(15) ||
    m.includes(19) ||
    m.includes(25) ||
    m.includes(31) ||
    m.includes(32) ||
    m.includes(37) ||
    m.includes(38) ||
    m.includes(39) ||
    m.includes(41) ||
    m.includes(48) ||
    m.includes(59) ||
    m.includes(62) ||
    m.includes(65) ||
    m.includes(80) ||
    m.includes(84)
  ) {
    return 'Crucible';
  }
  return 'Other';
}

/**
 * Braytech-style subtype within a mode (Weapons, Class, Gold Tier, …).
 * Gold Tier wins when medalTierIdentifier is *_TIER_3.
 */
export function medalSubtype(
  statId: string,
  def: { medalTierIdentifier?: string; medalTierHash?: number; category?: number } | null | undefined
): MedalSubtypeId {
  const id = String(statId || '');
  const low = id.toLowerCase();
  const tier = String(def?.medalTierIdentifier || '').toUpperCase();

  if (tier.includes('TIER_3') || /_tier_3$/i.test(tier)) {
    return 'Gold Tier';
  }

  if (low.includes('trial') || low.includes('osiris')) return 'Trials of Osiris';
  if (low.includes('ironbanner') || low.includes('iron_banner') || low.includes('ib_')) {
    return 'Iron Banner';
  }
  if (low.includes('crimson')) return 'Crimson Days';

  if (
    /medalmulti/i.test(id) ||
    /medalstreak/i.test(id) ||
    /_multi/i.test(id) ||
    /_streak/i.test(id) ||
    low.includes('spree')
  ) {
    return 'Multi + Streak';
  }

  if (/medalweapon/i.test(id) || /_weapon/i.test(id) || low.includes('primary') || low.includes('special') || low.includes('heavy')) {
    return 'Weapons';
  }

  if (
    /medalability/i.test(id) ||
    /medaldefeat/i.test(id) ||
    low.includes('gunslinger') ||
    low.includes('nightstalker') ||
    low.includes('arcstrider') ||
    low.includes('sunbreaker') ||
    low.includes('striker') ||
    low.includes('sentinel') ||
    low.includes('stormcaller') ||
    low.includes('dawnblade') ||
    low.includes('voidwalker') ||
    low.includes('flowwalker') ||
    low.includes('juggernaut') ||
    low.includes('hunter') ||
    low.includes('titan') ||
    low.includes('warlock') ||
    low.includes('class')
  ) {
    return 'Class';
  }

  if (
    low.includes('elemental') ||
    low.includes('arc') ||
    low.includes('solar') ||
    low.includes('void') ||
    low.includes('stasis') ||
    low.includes('strand') ||
    low.includes('thermal') ||
    low.includes('prism')
  ) {
    // Prefer Class/Weapons when already matched; Elemental is mainly Vanguard PvE
    if (!/medalability/i.test(id) && !/medalweapon/i.test(id)) {
      return 'Elemental';
    }
  }

  if (
    /medalmatch/i.test(id) ||
    /medalcontrol/i.test(id) ||
    /medalrumble/i.test(id) ||
    /medalsurvival/i.test(id) ||
    /medalcountdown/i.test(id) ||
    /medalsupremacy/i.test(id) ||
    /medalshowdown/i.test(id) ||
    /medalelimination/i.test(id) ||
    /medalzone/i.test(id) ||
    low.includes('control') ||
    low.includes('rumble') ||
    low.includes('survival') ||
    low.includes('countdown') ||
    low.includes('supremacy') ||
    low.includes('showdown') ||
    low.includes('clash') ||
    low.includes('mayhem') ||
    low.includes('momentum') ||
    low.includes('breakthrough') ||
    low.includes('lockdown') ||
    low.includes('scored')
  ) {
    return 'Gametypes';
  }

  if (
    /medalpayback/i.test(id) ||
    /medalavenger/i.test(id) ||
    /medaldefense/i.test(id) ||
    /medalquickstrike/i.test(id) ||
    /medalsupershutdown/i.test(id) ||
    /medalcycle/i.test(id) ||
    /medalcombat/i.test(id) ||
    low.includes('payback') ||
    low.includes('avenger') ||
    low.includes('shutdown')
  ) {
    return 'Combat';
  }

  return 'Other';
}

/** True when this historical-stats definition is a medal (group Medals = 3). */
export function isMedalHistoricalStat(def: { group?: number; medalTierHash?: number } | null | undefined): boolean {
  if (!def) return false;
  if (def.group === 3) return true;
  return def.medalTierHash != null && Number(def.medalTierHash) > 0;
}
