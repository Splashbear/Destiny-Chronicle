import {
  MedalModeGroupId,
  MedalSubtypeId,
  MEDAL_SUBTYPE_ORDER,
} from '../models/accomplishments-medals.model';
import { D2_MEDALS_BY_NAME } from '../data/d2-medals-catalog';
import { D1_MEDALS_BY_STAT_ID } from '../data/d1-medals-catalog';

const MODE_SET = new Set<MedalModeGroupId>(['Crucible', 'Gambit', 'Vanguard', 'Other']);
const SUBTYPE_SET = new Set<string>(MEDAL_SUBTYPE_ORDER);

/** Subtypes that belong under each D2 mode (MEDALS_LIST only — no D1 tiers / Other). */
export const MODE_SUBTYPES: Record<'Crucible' | 'Gambit' | 'Vanguard', MedalSubtypeId[]> = {
  Crucible: [
    'Multi + Streak',
    'Combat',
    'Weapons',
    'Class',
    'Gold Tier',
    'Gametypes',
    'Iron Banner',
    'Crimson Days',
    'Trials of Osiris',
  ],
  Gambit: ['Prowess', 'Invading', 'Speed', 'Team', 'Supers'],
  Vanguard: ['Multi + Streak', 'Weapons', 'Elemental'],
};

/** Aggregate / summary stats that are not individual medals. */
const AGGREGATE_MEDAL_STAT_IDS = new Set(
  [
    'medalsearned',
    'allmedalsearned',
    'medalsunknown',
    'unknownmedals',
    'medalscore',
    'allmedalscore',
    'precisionkills', // sometimes leaked; not a medal
  ].map((s) => s.toLowerCase())
);

export function normalizeMedalName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function asMode(raw: string | undefined): MedalModeGroupId | null {
  if (!raw) return null;
  return MODE_SET.has(raw as MedalModeGroupId) ? (raw as MedalModeGroupId) : null;
}

function asSubtype(raw: string | undefined): MedalSubtypeId | null {
  if (!raw) return null;
  return SUBTYPE_SET.has(raw) ? (raw as MedalSubtypeId) : null;
}

/** True for summary rows like "Medals Earned" / "Unknown Medals". */
export function isAggregateMedalStat(statId: string, name?: string): boolean {
  const id = String(statId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!id) return true;
  if (AGGREGATE_MEDAL_STAT_IDS.has(id)) return true;
  if (/^(all)?medals?(earned|unknown|score)$/i.test(id)) return true;
  if (/^medals?earned$/i.test(id) || /^unknownmedals?$/i.test(id)) return true;
  const n = normalizeMedalName(name || '');
  if (n === 'medals earned' || n === 'unknown medals' || n === 'all medals earned') return true;
  return false;
}

/**
 * Look up D2 medal placement from MEDALS_LIST (by display name).
 * A few names appear in more than one mode — pass description or heuristicMode to disambiguate.
 */
export function lookupD2MedalCatalog(
  name: string,
  opts?: { description?: string; heuristicMode?: MedalModeGroupId }
): {
  mode: MedalModeGroupId;
  subtype: MedalSubtypeId;
  description: string;
  order: number;
  hash: string;
} | null {
  const list = D2_MEDALS_BY_NAME[normalizeMedalName(name)];
  if (!list?.length) return null;

  let entry = list[0];
  if (list.length > 1) {
    const desc = normalizeMedalName(opts?.description || '');
    const byDesc = desc
      ? list.find((e) => normalizeMedalName(e.description) === desc)
      : undefined;
    const byMode = opts?.heuristicMode
      ? list.find((e) => e.mode === opts.heuristicMode)
      : undefined;
    entry = byDesc || byMode || list[0];
  }

  const mode = asMode(entry.mode);
  const subtype = asSubtype(entry.subtype);
  if (!mode || !subtype) return null;
  return {
    mode,
    subtype,
    description: entry.description,
    order: entry.order,
    hash: entry.hash,
  };
}

/** Look up D1 medal placement from D1_MEDALS_LIST (by historical statId). */
export function lookupD1MedalCatalog(statId: string): {
  mode: MedalModeGroupId;
  subtype: MedalSubtypeId;
  description: string;
  name: string;
  order: number;
} | null {
  const key = String(statId || '')
    .toLowerCase()
    .trim();
  if (!key) return null;
  const alt = key.startsWith('medal') && !key.startsWith('medals') ? `medals${key.slice(5)}` : '';
  const alt2 = key.startsWith('medals') ? `medal${key.slice(6)}` : '';
  const entry =
    D1_MEDALS_BY_STAT_ID[key] ||
    (alt ? D1_MEDALS_BY_STAT_ID[alt] : undefined) ||
    (alt2 ? D1_MEDALS_BY_STAT_ID[alt2] : undefined);
  if (!entry) return null;
  const mode = asMode(entry.mode);
  const subtype = asSubtype(entry.subtype);
  if (!mode || !subtype) return null;
  return {
    mode,
    subtype,
    description: entry.description,
    name: entry.name,
    order: entry.order,
  };
}

export type MedalDefHints = {
  medalTierIdentifier?: string;
  medalTierHash?: number;
  category?: number;
  contentIconOverrideId?: string;
  modes?: number[] | null;
};

/**
 * Heuristic mode WITHOUT trusting bloated modes[] arrays (Bungie often lists ~48 modes
 * on every medal, including Gambit, which previously mis-filed Crucible medals).
 */
function heuristicModeGroup(statId: string, def?: MedalDefHints | null): MedalModeGroupId {
  const id = String(statId || '').toLowerCase();
  const icon = String(def?.contentIconOverrideId || '').toLowerCase();
  const tier = String(def?.medalTierIdentifier || '').toUpperCase();

  if (
    id.includes('gambit') ||
    icon.includes('gambit') ||
    tier.includes('GAMBIT')
  ) {
    return 'Gambit';
  }

  if (
    tier.startsWith('STRIKE') ||
    tier.includes('PVE') ||
    id.includes('strike') ||
    id.includes('vanguard') ||
    id.includes('nightfall') ||
    icon.includes('pve') ||
    icon.includes('strike') ||
    icon.includes('vanguard')
  ) {
    return 'Vanguard';
  }

  if (
    tier.startsWith('PVP') ||
    id.includes('pvp') ||
    id.includes('crucible') ||
    id.includes('trial') ||
    id.includes('ironbanner') ||
    id.includes('iron_banner') ||
    id.includes('crimson') ||
    icon.includes('pvp') ||
    icon.includes('crucible') ||
    icon.includes('trial') ||
    icon.includes('iron')
  ) {
    return 'Crucible';
  }

  // Do NOT use modes[] — too many medals list every mode including Gambit.
  return 'Other';
}

/**
 * Top-level mode: prefer MEDALS_LIST / D1 list, then heuristic (never bloated modes[]).
 */
export function medalModeGroup(
  statId: string,
  modes: number[] | null | undefined,
  opts?: {
    name?: string;
    description?: string;
    game?: 'D1' | 'D2';
    def?: MedalDefHints | null;
  }
): MedalModeGroupId {
  if (opts?.game === 'D1') {
    const d1 = lookupD1MedalCatalog(statId);
    if (d1) return d1.mode;
  } else if (opts?.name) {
    const heur = heuristicModeGroup(statId, opts.def);
    const d2 = lookupD2MedalCatalog(opts.name, {
      description: opts.description,
      heuristicMode: heur === 'Other' ? undefined : heur,
    });
    if (d2) return d2.mode;
  }

  const mode = heuristicModeGroup(statId, opts?.def ?? { modes });
  // Unclassified → Crucible "Other" rather than inventing a 4th tab
  return mode === 'Other' ? 'Crucible' : mode;
}

/**
 * Subtype within a mode from catalog first, then heuristics.
 */
export function medalSubtype(
  statId: string,
  def: MedalDefHints | null | undefined,
  opts?: { name?: string; description?: string; game?: 'D1' | 'D2' }
): MedalSubtypeId {
  if (opts?.game === 'D1') {
    const d1 = lookupD1MedalCatalog(statId);
    if (d1) return d1.subtype;
  } else if (opts?.name) {
    const heur = heuristicModeGroup(statId, def);
    const d2 = lookupD2MedalCatalog(opts.name, {
      description: opts.description,
      heuristicMode: heur === 'Other' ? undefined : heur,
    });
    if (d2) return d2.subtype;
  }

  const id = String(statId || '');
  const low = id.toLowerCase();
  const tier = String(def?.medalTierIdentifier || '').toUpperCase();
  const icon = String(def?.contentIconOverrideId || '').toLowerCase();

  if (tier.includes('TIER_3') || /_tier_3$/i.test(tier) || icon.includes('gold')) {
    return 'Gold Tier';
  }

  if (low.includes('trial') || low.includes('osiris') || icon.includes('trial')) {
    return 'Trials of Osiris';
  }
  if (low.includes('ironbanner') || low.includes('iron_banner') || low.includes('ib_') || icon.includes('iron')) {
    return 'Iron Banner';
  }
  if (low.includes('crimson') || icon.includes('crimson')) return 'Crimson Days';

  if (low.includes('gambit')) {
    if (low.includes('invade') || low.includes('invader')) return 'Invading';
    if (low.includes('primeval') || low.includes('mote') || low.includes('bank')) return 'Prowess';
    if (low.includes('super')) return 'Supers';
    if (low.includes('team') || low.includes('ally')) return 'Team';
    if (low.includes('speed') || low.includes('fast')) return 'Speed';
    return 'Prowess';
  }

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
    low.includes('hunter') ||
    low.includes('titan') ||
    low.includes('warlock') ||
    low.includes('class')
  ) {
    return 'Class';
  }

  if (
    low.includes('elemental') ||
    ((low.includes('arc') || low.includes('solar') || low.includes('void') || low.includes('stasis') || low.includes('strand')) &&
      (tier.startsWith('STRIKE') || icon.includes('pve')))
  ) {
    return 'Elemental';
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
    low.includes('breakthrough') ||
    low.includes('lockdown')
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
