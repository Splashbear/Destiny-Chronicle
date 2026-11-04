/**
 * /firsts Discord card: pure builder (no network, no Discord SDK).
 *
 * One line per raid (or dungeon) family: the date of the first clear and the number of clears.
 * Families come from the site's own getBaseRaidName, so "Last Wish: Standard" and
 * "Last Wish: Master" are one line. Raid/dungeon status comes from Bungie's definition data
 * (activity mode types, activity type name), not from guessing at names.
 *
 * Rules: Bungie icons only. A date is shown only when the caller verified it against Bungie's
 * own report (PGCR) for that clear. Without verification the line has no date: nothing is guessed.
 * Only clears Bungie marks as completed count, keyed by game + instance id.
 */
import { buildDeepLinkUrl } from './deep-link';
import {
  D2_DUNGEON_VARIANT_DEFS,
  D2_RAID_VARIANT_DEFS,
  isRiteOfTheNineDungeonName,
  normalizeDesertPerpetualName,
} from './d2-activity-variants';
import { D1_RAID_VARIANT_DEFS_AGGREGATE } from './d1-raid-variants';
import { baseActivityNameFromVersioned } from './date-activity-grouping';
import { pantheonEventForActivity } from '../config/pantheon.config';
import {
  CardGame,
  OtdDefinition,
  OtdDefLookup,
  OtdRow,
  reportUrl,
  zonedParts,
} from './discord-otd-card';

export type FirstsKind = 'raids' | 'dungeons' | 'pantheon';

/** Section titles of the site's "Pantheon Events" block, in the site's order. */
export const PANTHEON_SECTIONS = ['The Pantheon', 'Monument of Triumph Pantheon', 'Rite of the Nine'] as const;
const RITE_DUNGEON_ORDER = ['Spire of the Watcher', 'Ghosts of the Deep', 'Prophecy'];

export const FIRSTS_MODE = { Raid: 4, Dungeon: 82 } as const;
export const FIRSTS_EMBED_COLOR = 0xc9a227;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** How many of the earliest clears the pipeline may check against Bungie's reports before giving up on a date. */
export const FIRSTS_VERIFY_CANDIDATES = 3;

/**
 * Raid / dungeon from Bungie's activity type name ("Raid", "Dungeon"), falling back to its mode types.
 * The type name wins: Bungie files one Crota's End activity under the dungeon mode but the Raid type.
 * D1 has raids only.
 */
export function firstsKindOf(def: OtdDefinition | undefined, game: CardGame): 'raids' | 'dungeons' | null {
  if (!def) return null;
  const type = (def.typeName ?? '').trim().toLowerCase();
  if (type === 'raid') return 'raids';
  if (type === 'dungeon' && game === 'D2') return 'dungeons';
  if (type) return null;
  const modes = def.modes ?? [];
  if (game === 'D2') {
    if (modes.includes(FIRSTS_MODE.Raid)) return 'raids';
    if (modes.includes(FIRSTS_MODE.Dungeon)) return 'dungeons';
  }
  return null;
}

/**
 * The site's own family for an activity name, or null when the site's Firsts tab does not list it
 * (Pantheon has its own section there; Rite of the Nine runs and older raids outside its lists are skipped).
 */
export function firstsFamily(name: string, kind: FirstsKind, game: CardGame): string | null {
  const base = baseActivityNameFromVersioned(name.trim());
  if (game === 'D1') return D1_RAID_VARIANT_DEFS_AGGREGATE.has(base) ? base : null;
  if (kind === 'dungeons' && isRiteOfTheNineDungeonName(name)) return null;
  const family = normalizeDesertPerpetualName(base, 'Normal').baseName;
  const defs = kind === 'raids' ? D2_RAID_VARIANT_DEFS : D2_DUNGEON_VARIANT_DEFS;
  return defs.has(family) ? family : null;
}

/**
 * Where an activity sits in the site's Pantheon Events block, using the site's own rules
 * (pantheon.config hashes/names, Rite of the Nine dungeon names). One line per activity version,
 * as on the site: "Atraks Sovereign", "Calus Resplendent: Customize", "Prophecy: Eternity".
 */
export function pantheonEntry(hash: string, name: string): { section: string; label: string } | null {
  const n = name.trim();
  const event = pantheonEventForActivity(hash, n);
  if (event === 'legacy-pantheon') return { section: PANTHEON_SECTIONS[0], label: n.replace(/^The Pantheon:\s*/, '') };
  if (event === 'mot-pantheon') return { section: PANTHEON_SECTIONS[1], label: n.replace(/^Pantheon:\s*/, '') };
  if (isRiteOfTheNineDungeonName(n) && RITE_DUNGEON_ORDER.some((d) => n.startsWith(d))) {
    return { section: PANTHEON_SECTIONS[2], label: n };
  }
  return null;
}

/** Family (and Pantheon section) of one activity for a card kind, or null when that card does not list it. */
export function firstsClassify(
  def: OtdDefinition | undefined,
  hash: string,
  kind: FirstsKind,
  game: CardGame
): { baseName: string; section?: string } | null {
  const name = (def?.name ?? '').trim();
  if (!name) return null;
  if (kind === 'pantheon') {
    if (game !== 'D2') return null;
    const e = pantheonEntry(hash, name);
    return e ? { baseName: e.label, section: e.section } : null;
  }
  if (firstsKindOf(def, game) !== kind) return null;
  const baseName = firstsFamily(name, kind, game);
  return baseName ? { baseName } : null;
}

/** Every instance (completed or not) of activities a card kind lists: the ones to check in Bungie's reports. */
export function firstsInstances(rows: OtdRow[], kind: FirstsKind, game: CardGame, lookup: OtdDefLookup): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.game !== game || !r.instanceId) continue;
    const hash = String(r.activityHash);
    if (firstsClassify(lookup(game, hash), hash, kind, game)) out.add(String(r.instanceId));
  }
  return [...out];
}

/**
 * Bungie's report (PGCR) verdict for one instance: did any of the account's own entries finish it
 * (completed = 1 and, where Bungie gives one, completionReason 0 = objective completed)?
 */
export interface FirstsReport {
  cleared: boolean;
  period: string;
}

export function firstsKindNoun(kind: FirstsKind): string {
  return kind === 'raids' ? 'raid' : kind === 'dungeons' ? 'dungeon' : 'Pantheon event';
}

export interface FirstsCandidate {
  instanceId: string;
  period: string;
  activityHash: string;
}

export interface FirstsGroup {
  baseName: string;
  game: CardGame;
  /** Completed clears across every difficulty. */
  clears: number;
  /** Earliest completed clears, oldest first (the caller verifies these against Bungie's reports). */
  candidates: FirstsCandidate[];
  /** Bungie icon path of the activity of the earliest clear. */
  icon: string | null;
  /** Bungie mode for the fallback icon. */
  iconMode: number;
  /** Pantheon Events section (pantheon kind only). */
  section?: string;
}

/**
 * Group clears of one kind into families. With `reports` (instanceId -> Bungie's report verdict) a clear is
 * whatever Bungie's report says for the account's own entries, dated by the report; instances without a
 * report fall back to the history rows' completed flag (any character).
 */
export function groupFirsts(
  rows: OtdRow[],
  kind: FirstsKind,
  game: CardGame,
  lookup: OtdDefLookup,
  reports?: Record<string, FirstsReport | null | undefined>
): FirstsGroup[] {
  // One instance can carry several rows for the account (one per character that was in it).
  const merged = new Map<string, OtdRow>();
  for (const r of rows) {
    if (r.game !== game || !r.instanceId || !r.period) continue;
    const key = `${r.game}:${r.instanceId}`;
    const prev = merged.get(key);
    if (!prev || (r.completed && !prev.completed)) merged.set(key, r);
  }
  const clears: Array<{ row: OtdRow; period: string }> = [];
  for (const row of merged.values()) {
    const rep = reports?.[String(row.instanceId)];
    if (rep) {
      if (rep.cleared) clears.push({ row, period: rep.period || row.period });
    } else if (row.completed) {
      clears.push({ row, period: row.period });
    }
  }
  clears.sort((a, b) => Date.parse(a.period) - Date.parse(b.period));
  const byName = new Map<string, FirstsGroup>();
  for (const { row, period } of clears) {
    const hash = String(row.activityHash);
    const def = lookup(game, hash);
    const c = firstsClassify(def, hash, kind, game);
    if (!c) continue;
    const key = `${c.section ?? ''}|${c.baseName}`;
    let group = byName.get(key);
    if (!group) {
      group = {
        baseName: c.baseName,
        game,
        clears: 0,
        candidates: [],
        icon: def?.icon ?? null,
        iconMode: kind === 'dungeons' ? FIRSTS_MODE.Dungeon : FIRSTS_MODE.Raid,
        ...(c.section ? { section: c.section } : {}),
      };
      byName.set(key, group);
    }
    group.clears++;
    if (group.candidates.length < FIRSTS_VERIFY_CANDIDATES) {
      group.candidates.push({ instanceId: String(row.instanceId), period, activityHash: hash });
    }
    if (!group.icon && def?.icon) group.icon = def.icon;
  }
  return [...byName.values()];
}

export interface FirstsPlayer {
  /** Display name with code, e.g. Splashbear#1078 */
  name: string;
  membershipType: number;
  membershipId: string;
  game: CardGame;
}

export interface FirstsCardOptions {
  player: FirstsPlayer;
  kind: FirstsKind;
  groups: FirstsGroup[];
  /** instanceId -> period (ISO) taken from Bungie's report for that clear. Only verified clears appear. */
  verified: Record<string, string>;
  /** IANA zone the date is read in. */
  timeZone: string;
  modeIconFor?: (game: CardGame, modeType: number) => string | null | undefined;
  emojiFor?: (iconPath: string) => string | undefined;
  siteBase?: string;
  maxLines?: number;
}

export interface FirstsLine {
  kind: 'first';
  section?: string;
  name: string;
  game: CardGame;
  /** ISO period of the verified first clear, or null when it could not be verified. */
  period: string | null;
  dateLabel: string | null;
  clears: number;
  icon: string | null;
  reportInstanceId: string;
  reportUrl: string;
}

export interface FirstsCard {
  embed: {
    title: string;
    description: string;
    color: number;
    footer: { text: string };
  };
  model: {
    title: string;
    kind: FirstsKind;
    firsts: FirstsLine[];
    hidden: number;
    total: number;
    clears: number;
    lines: Array<{ kind: 'first' | 'header'; icon: string | null }>;
    url: string;
  };
}

export function formatFirstDate(period: string, timeZone: string): string | null {
  const p = zonedParts(period, timeZone);
  return p ? `${MONTHS[p.month - 1]} ${p.day}, ${p.year}` : null;
}

export function buildFirstsCard(opts: FirstsCardOptions): FirstsCard {
  const maxLines = opts.maxLines ?? 25;
  const noun = firstsKindNoun(opts.kind);
  const lines: FirstsLine[] = opts.groups.map((g) => {
    // The first clear is the earliest one whose date Bungie's own report confirmed.
    const confirmed = g.candidates.find((c) => opts.verified[c.instanceId]);
    const period = confirmed ? opts.verified[confirmed.instanceId] : null;
    const link = confirmed ?? g.candidates[0];
    const icon = g.icon ?? opts.modeIconFor?.(g.game, g.iconMode) ?? null;
    return {
      kind: 'first',
      ...(g.section ? { section: g.section } : {}),
      name: g.baseName,
      game: g.game,
      period,
      dateLabel: period ? formatFirstDate(period, opts.timeZone) : null,
      clears: g.clears,
      icon,
      reportInstanceId: link.instanceId,
      reportUrl: reportUrl(link.instanceId, g.game),
    };
  });
  // Newest first clear at the top; lines without a verified date go last.
  lines.sort((a, b) => {
    if (a.period && b.period) return Date.parse(b.period) - Date.parse(a.period) || a.name.localeCompare(b.name);
    if (a.period) return -1;
    if (b.period) return 1;
    return a.name.localeCompare(b.name);
  });

  if (opts.kind === 'pantheon') {
    // The site's Pantheon Events order: section, then Pantheon bosses by name,
    // Rite of the Nine by dungeon with its runs in the order they were first cleared.
    const sec = (l: FirstsLine) => PANTHEON_SECTIONS.indexOf((l.section ?? '') as (typeof PANTHEON_SECTIONS)[number]);
    const rite = (l: FirstsLine) => RITE_DUNGEON_ORDER.findIndex((d) => l.name.startsWith(d));
    const t = (l: FirstsLine) => (l.period ? Date.parse(l.period) : Number.MAX_SAFE_INTEGER);
    lines.sort((a, b) => {
      if (sec(a) !== sec(b)) return sec(a) - sec(b);
      if (a.section === PANTHEON_SECTIONS[2]) return rite(a) - rite(b) || t(a) - t(b);
      return a.name.localeCompare(b.name);
    });
  }
  const total = lines.length;
  const clears = lines.reduce((n, l) => n + l.clears, 0);
  const shown = lines.slice(0, maxLines);
  const hidden = total - shown.length;
  const base = opts.siteBase ?? 'https://destinychronicle.com';
  const url = buildDeepLinkUrl(base, {
    accounts: [
      { membershipType: opts.player.membershipType, membershipId: opts.player.membershipId, game: opts.player.game },
    ],
    tab: 'firsts',
  });

  const out: string[] = [];
  const modelLines: FirstsCard['model']['lines'] = [];
  let section: string | undefined;
  for (const l of shown) {
    if (l.section && l.section !== section) {
      section = l.section;
      out.push(`**${l.section}**`);
      modelLines.push({ kind: 'header', icon: null });
    }
    modelLines.push({ kind: 'first', icon: l.icon });
    const e = l.icon ? opts.emojiFor?.(l.icon) : undefined;
    const bits = [l.name + (l.game === 'D1' ? ' · D1' : '')];
    if (l.dateLabel) bits.push(l.dateLabel);
    bits.push(`${l.clears} ${l.clears === 1 ? 'clear' : 'clears'}`);
    out.push(`${e ? `${e} ` : ''}${bits.join(' · ')} [Report](${l.reportUrl})`);
  }
  if (!total) out.push(`No ${noun} clears on this account.`);
  if (hidden > 0) out.push(`[+${hidden} more](${url})`);
  out.push(`[Open in Destiny Chronicle](${url})`);

  const kindTitle = opts.kind === 'raids' ? 'Raids' : opts.kind === 'dungeons' ? 'Dungeons' : 'Pantheon Events';
  const title = `First clears: ${opts.player.name} · ${kindTitle}`;
  return {
    embed: {
      title,
      description: out.join('\n'),
      color: FIRSTS_EMBED_COLOR,
      footer: { text: `${total} ${opts.kind === 'pantheon' ? (total === 1 ? 'activity' : 'activities') : noun + (total === 1 ? '' : 's')} · ${clears} ${clears === 1 ? 'clear' : 'clears'}` },
    },
    model: {
      title,
      kind: opts.kind,
      firsts: shown,
      hidden,
      total,
      clears,
      lines: modelLines,
      url,
    },
  };
}
