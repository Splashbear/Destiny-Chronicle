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
import {
  CardGame,
  OtdDefinition,
  OtdDefLookup,
  OtdRow,
  reportUrl,
  zonedParts,
} from './discord-otd-card';

export type FirstsKind = 'raids' | 'dungeons';

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
export function firstsKindOf(def: OtdDefinition | undefined, game: CardGame): FirstsKind | null {
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
}

/** Group completed clears of one kind into raid/dungeon families. */
export function groupFirsts(
  rows: OtdRow[],
  kind: FirstsKind,
  game: CardGame,
  lookup: OtdDefLookup
): FirstsGroup[] {
  // One instance can carry several rows for the account (one per character that was in it).
  // The account cleared it if any of them completed, so merge by game + instance id first.
  const merged = new Map<string, OtdRow>();
  for (const r of rows) {
    if (r.game !== game || !r.instanceId || !r.period) continue;
    const key = `${r.game}:${r.instanceId}`;
    const prev = merged.get(key);
    if (!prev || (r.completed && !prev.completed)) merged.set(key, r);
  }
  const byName = new Map<string, FirstsGroup>();
  const sorted = [...merged.values()]
    .filter((r) => r.completed)
    .sort((a, b) => Date.parse(a.period) - Date.parse(b.period));
  for (const row of sorted) {
    const hash = String(row.activityHash);
    const def = lookup(game, hash);
    if (firstsKindOf(def, game) !== kind) continue;
    const name = (def?.name ?? '').trim();
    if (!name) continue;
    const baseName = firstsFamily(name, kind, game);
    if (!baseName) continue;
    let group = byName.get(baseName);
    if (!group) {
      group = {
        baseName,
        game,
        clears: 0,
        candidates: [],
        icon: def?.icon ?? null,
        iconMode: kind === 'raids' ? FIRSTS_MODE.Raid : FIRSTS_MODE.Dungeon,
      };
      byName.set(baseName, group);
    }
    group.clears++;
    if (group.candidates.length < FIRSTS_VERIFY_CANDIDATES) {
      group.candidates.push({ instanceId: String(row.instanceId), period: row.period, activityHash: hash });
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
    lines: Array<{ kind: 'first'; icon: string | null }>;
    url: string;
  };
}

export function formatFirstDate(period: string, timeZone: string): string | null {
  const p = zonedParts(period, timeZone);
  return p ? `${MONTHS[p.month - 1]} ${p.day}, ${p.year}` : null;
}

export function buildFirstsCard(opts: FirstsCardOptions): FirstsCard {
  const maxLines = opts.maxLines ?? 25;
  const noun = opts.kind === 'raids' ? 'raid' : 'dungeon';
  const lines: FirstsLine[] = opts.groups.map((g) => {
    // The first clear is the earliest one whose date Bungie's own report confirmed.
    const confirmed = g.candidates.find((c) => opts.verified[c.instanceId]);
    const period = confirmed ? opts.verified[confirmed.instanceId] : null;
    const link = confirmed ?? g.candidates[0];
    const icon = g.icon ?? opts.modeIconFor?.(g.game, g.iconMode) ?? null;
    return {
      kind: 'first',
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
  for (const l of shown) {
    const e = l.icon ? opts.emojiFor?.(l.icon) : undefined;
    const bits = [l.name + (l.game === 'D1' ? ' · D1' : '')];
    if (l.dateLabel) bits.push(l.dateLabel);
    bits.push(`${l.clears} ${l.clears === 1 ? 'clear' : 'clears'}`);
    out.push(`${e ? `${e} ` : ''}${bits.join(' · ')} [Report](${l.reportUrl})`);
  }
  if (!total) out.push(`No ${noun} clears on this account.`);
  if (hidden > 0) out.push(`[+${hidden} more](${url})`);
  out.push(`[Open in Destiny Chronicle](${url})`);

  const title = `First clears: ${opts.player.name} · ${opts.kind === 'raids' ? 'Raids' : 'Dungeons'}`;
  return {
    embed: {
      title,
      description: out.join('\n'),
      color: FIRSTS_EMBED_COLOR,
      footer: { text: `${total} ${noun}${total === 1 ? '' : 's'} · ${clears} ${clears === 1 ? 'clear' : 'clears'}` },
    },
    model: {
      title,
      kind: opts.kind,
      firsts: shown,
      hidden,
      total,
      clears,
      lines: shown.map((l) => ({ kind: 'first', icon: l.icon })),
      url,
    },
  };
}
