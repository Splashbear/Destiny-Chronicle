/**
 * /otd Discord card: pure builder (no network, no Discord SDK).
 *
 * Input is the account's activity rows (same rows the site's On This Day uses) plus a name/icon
 * lookup built from Bungie's own definitions. Output is a Discord embed object.
 *
 * Rules: Bungie icons only, no earn dates are made up (the Firsts banner only shows what the
 * caller passes in), no coverage or archive wording, and the game stays on every line (D1 years
 * are labelled).
 */
import { buildDeepLinkUrl } from './deep-link';

export type CardGame = 'D1' | 'D2';

export interface OtdRow {
  instanceId: string;
  period: string;
  activityHash: number | string;
  completed?: boolean;
  durationSeconds?: number;
  game: CardGame;
}

export interface OtdDefinition {
  name?: string | null;
  /** Bungie `activityModeTypes` for the activity (D2). Drives the consolidation. */
  modes?: number[];
  /** Bungie activity type name (e.g. "Lost Sector"). */
  typeName?: string | null;
  /** Bungie path such as /common/destiny2_content/icons/abc.png (or a full bungie.net URL). */
  icon?: string | null;
  isPvP?: boolean;
}

/** Look up by game + activity hash. Return undefined when Bungie has no definition. */
export type OtdDefLookup = (game: CardGame, hash: string) => OtdDefinition | undefined;

export interface OtdFirst {
  /** e.g. "Vow of the Disciple" */
  name: string;
  game: CardGame;
  /** Year it was first cleared, taken from a real report. */
  year: number;
}

export interface OtdPlayer {
  /** Display name with code, e.g. Splashbear#1078 */
  name: string;
  membershipType: number;
  membershipId: string;
  /** Game the card is for (pins the deep link). */
  game: CardGame;
}

export interface OtdCardOptions {
  player: OtdPlayer;
  month: number;
  day: number;
  rows: OtdRow[];
  lookup: OtdDefLookup;
  /** IANA zone the calendar day is read in. The site reads the visitor's own zone. */
  timeZone: string;
  /** Bungie icon path for a mode (DestinyActivityModeDefinition), if Bungie has one. */
  modeIconFor?: (game: CardGame, modeType: number) => string | null | undefined;
  /** Optional emoji markup per Bungie icon path, e.g. "<:a1b2:123>". Without it, lines have no icon. */
  emojiFor?: (iconPath: string) => string | undefined;
  /** Firsts that happened on this date. Only pass what was verified. */
  firsts?: OtdFirst[];
  siteBase?: string;
  maxLines?: number;
}

export type OtdKind =
  | 'pvp'
  | 'gambit'
  | 'strikes'
  | 'battlegrounds'
  | 'patrol'
  | 'lostSector'
  | 'named';

/** Bungie DestinyActivityModeType values used for classification. */
export const MODE = {
  Story: 2,
  Strike: 3,
  AllPvP: 5,
  Patrol: 6,
  AllStrikes: 18,
  Gambit: 63,
  GambitPrime: 75,
  LostSector: 87,
} as const;

export interface OtdClass {
  kind: OtdKind;
  /** Grouping key within a year + game. */
  key: string;
  /** Line label before the count. */
  label: string;
  /** Bungie mode used for the mode-level icon, if any. */
  iconMode?: number;
}

/**
 * Classify one activity from Bungie's own definition data (mode types, type name, isPvP).
 * Raids, dungeons, story missions and everything else stay as named lines. No name is invented:
 * the only text added is the mode label ("PvP", "Strikes", ...).
 */
export function classifyActivity(def: OtdDefinition | undefined, name: string): OtdClass {
  const modes = def?.modes ?? [];
  const has = (m: number) => modes.includes(m);
  const type = def?.typeName ?? '';
  if (has(MODE.Gambit) || has(MODE.GambitPrime) || type === 'Gambit') {
    return { kind: 'gambit', key: 'gambit', label: 'Gambit', iconMode: has(MODE.Gambit) ? MODE.Gambit : MODE.GambitPrime };
  }
  // D1 definitions carry no mode list; Bungie files every D1 Crucible playlist under the "Rumble" type.
  if (def?.isPvP || has(MODE.AllPvP) || type === 'Rumble') {
    return { kind: 'pvp', key: 'pvp', label: 'PvP', iconMode: MODE.AllPvP };
  }
  if (has(MODE.LostSector) || def?.typeName === 'Lost Sector') {
    const sector = name.replace(/^Lost Sector:\s*/i, '').trim() || name;
    return { kind: 'lostSector', key: `ls:${sector}`, label: `Lost Sector – ${sector}`, iconMode: MODE.LostSector };
  }
  // Bungie names these "Battleground: ..." even though it files them under Strike.
  if (/battleground/i.test(name)) {
    return { kind: 'battlegrounds', key: 'battlegrounds', label: 'Battlegrounds' };
  }
  if (has(MODE.AllStrikes) || has(MODE.Strike) || type === 'Strike') {
    return { kind: 'strikes', key: 'strikes', label: 'Strikes', iconMode: MODE.AllStrikes };
  }
  if (has(MODE.Patrol) || type === 'Patrol') {
    return { kind: 'patrol', key: 'patrol', label: 'Patrol', iconMode: MODE.Patrol };
  }
  return { kind: 'named', key: `n:${name}`, label: name };
}

export interface OtdLine {
  year: number;
  game: CardGame;
  kind: OtdKind;
  name: string;
  icon: string | null;
  count: number;
  isPvP: boolean;
  totalSeconds: number;
  completed: boolean;
  /** Longest single row of the group: the report link goes here. */
  reportInstanceId: string;
  reportUrl: string;
}

export interface OtdCard {
  embed: {
    title: string;
    description: string;
    color: number;
    footer: { text: string };
  };
  /** Structured form of the card (used by tests and the PNG renderer). */
  model: {
    title: string;
    firsts: OtdFirst[];
    years: Array<{ year: number; label: string; lines: OtdLine[] }>;
    hiddenActivities: number;
    total: number;
    yearCount: number;
    url: string;
  };
}

export const OTD_EMBED_COLOR = 0xc9a227;
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Same link the site uses for a report (D1 has no public Bungie page). */
export function reportUrl(instanceId: string, game: CardGame): string {
  return game === 'D1'
    ? `https://pgcr.eververse.trade/destiny1/${instanceId}`
    : `https://www.bungie.net/en/PGCR/${instanceId}`;
}

export function bungieIconUrl(icon: string | null | undefined): string | null {
  if (!icon) return null;
  if (/^https:\/\/www\.bungie\.net\//.test(icon)) return icon;
  return icon.startsWith('/') ? `https://www.bungie.net${icon}` : null;
}

/** 3845 -> "1h04m", 2280 -> "38m", 45 -> "45s". */
export function formatCardDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Calendar parts of an instant in the given zone. */
export function zonedParts(
  period: string,
  timeZone: string
): { year: number; month: number; day: number } | null {
  const d = new Date(period);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d);
  const pick = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

const UNKNOWN = 'Unknown activity';

const KIND_ICON_MODE: Partial<Record<OtdKind, number>> = {
  pvp: MODE.AllPvP,
  gambit: MODE.Gambit,
  strikes: MODE.AllStrikes,
  patrol: MODE.Patrol,
};

/** Rows on this month/day (zone-local) across all years, grouped per year/game/name. */
export function groupOtdRows(
  rows: OtdRow[],
  month: number,
  day: number,
  timeZone: string,
  lookup: OtdDefLookup,
  modeIconFor?: OtdCardOptions['modeIconFor']
): { lines: OtdLine[]; total: number } {
  const groups = new Map<string, OtdLine & { longest: number; icons: Set<string | null> }>();
  let total = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    const p = zonedParts(row.period, timeZone);
    if (!p || p.month !== month || p.day !== day) continue;
    // One report is one activity: key by game + instanceId.
    const key = `${row.game}:${row.instanceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total++;
    const def = lookup(row.game, String(row.activityHash));
    // Bungie leaves some definitions unnamed; their activity type name (e.g. "Story") is the honest fallback.
    const name = def?.name?.trim() || def?.typeName?.trim() || UNKNOWN;
    const cls = classifyActivity(def, name);
    const gKey = `${p.year}|${row.game}|${cls.key}`;
    const secs = Number(row.durationSeconds) || 0;
    let g = groups.get(gKey);
    if (!g) {
      g = {
        year: p.year,
        game: row.game,
        kind: cls.kind,
        name: cls.label,
        icon: null,
        icons: new Set<string | null>(),
        count: 0,
        isPvP: !!def?.isPvP,
        totalSeconds: 0,
        completed: false,
        reportInstanceId: row.instanceId,
        reportUrl: reportUrl(row.instanceId, row.game),
        longest: -1,
      };
      groups.set(gKey, g);
    }
    g.count++;
    g.icons.add(bungieIconUrl(def?.icon) ? (def?.icon as string) : null);
    g.isPvP = g.isPvP || !!def?.isPvP;
    g.totalSeconds += secs;
    g.completed = g.completed || !!row.completed;
    if (secs > g.longest) {
      g.longest = secs;
      g.reportInstanceId = row.instanceId;
      g.reportUrl = reportUrl(row.instanceId, row.game);
    }
  }
  const lines = [...groups.values()].map(({ longest: _l, icons, ...line }) => {
    // Named lines use their own activity icon. Mode-level lines prefer the mode's Bungie icon,
    // then an icon every activity in the line shares, otherwise none.
    const only = icons.size === 1 ? [...icons][0] : null;
    if (line.kind === 'named' || line.kind === 'lostSector') {
      return { ...line, icon: only };
    }
    const cls = KIND_ICON_MODE[line.kind];
    const modeIcon = cls != null ? modeIconFor?.(line.game, cls) : null;
    return { ...line, icon: (modeIcon && bungieIconUrl(modeIcon) ? modeIcon : null) ?? only };
  });
  return { lines, total };
}

function sortLines(a: OtdLine, b: OtdLine): number {
  if (b.totalSeconds !== a.totalSeconds) return b.totalSeconds - a.totalSeconds;
  return a.name.localeCompare(b.name);
}

/**
 * Share the line budget between years: every year gets its header and top line first (newest
 * year first), then the rest is filled newest year first.
 */
export function allocateLines(
  perYear: Array<{ year: number; lines: OtdLine[] }>,
  maxLines: number
): number[] {
  const caps = perYear.map(() => 0);
  let used = 0;
  // header + first line
  for (let i = 0; i < perYear.length; i++) {
    if (perYear[i].lines.length === 0) continue;
    if (used + 2 > maxLines) break;
    caps[i] = 1;
    used += 2;
  }
  let progressed = true;
  while (progressed && used < maxLines) {
    progressed = false;
    for (let i = 0; i < perYear.length && used < maxLines; i++) {
      if (caps[i] > 0 && caps[i] < perYear[i].lines.length) {
        caps[i]++;
        used++;
        progressed = true;
      }
    }
  }
  return caps;
}

export function buildOtdCard(opts: OtdCardOptions): OtdCard {
  const maxLines = opts.maxLines ?? 25;
  const { lines, total } = groupOtdRows(
    opts.rows,
    opts.month,
    opts.day,
    opts.timeZone,
    opts.lookup,
    opts.modeIconFor
  );
  const byYear = new Map<number, OtdLine[]>();
  for (const line of lines) {
    const list = byYear.get(line.year) ?? [];
    list.push(line);
    byYear.set(line.year, list);
  }
  const yearList = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, ls]) => ({ year, lines: ls.sort(sortLines) }));

  const firstsLines = (opts.firsts ?? []).length;
  const caps = allocateLines(yearList, Math.max(4, maxLines - firstsLines));
  let hiddenActivities = 0;
  const years = yearList
    .map((y, i) => {
      const shown = y.lines.slice(0, caps[i]);
      for (const hidden of y.lines.slice(caps[i])) hiddenActivities += hidden.count;
      const hasD1 = shown.some((l) => l.game === 'D1');
      const hasD2 = shown.some((l) => l.game === 'D2');
      // A year with only D1 rows is labelled D1; a mixed year labels the D1 lines themselves.
      const label = hasD1 && !hasD2 ? `${y.year} · D1` : String(y.year);
      return { year: y.year, label, lines: shown };
    })
    .filter((y) => y.lines.length > 0);

  const base = opts.siteBase ?? 'https://destinychronicle.com';
  const date = `${String(opts.month).padStart(2, '0')}-${String(opts.day).padStart(2, '0')}`;
  const todayYear = zonedParts(new Date().toISOString(), opts.timeZone)?.year ?? new Date().getFullYear();
  const url = buildDeepLinkUrl(base, {
    accounts: [
      {
        membershipType: opts.player.membershipType,
        membershipId: opts.player.membershipId,
        game: opts.player.game,
      },
    ],
    tab: 'otd',
    date: `${todayYear}-${date}`,
  });

  const title = `On This Day: ${opts.player.name} · ${MONTHS[opts.month - 1]} ${opts.day}`;
  const out: string[] = [];
  for (const f of opts.firsts ?? []) {
    out.push(`🏆 **First ${f.name} clear** · ${f.year}${f.game === 'D1' ? ' · D1' : ''}`);
  }
  if (out.length) out.push('');
  const iconText = (line: OtdLine): string => {
    const e = line.icon ? opts.emojiFor?.(line.icon) : undefined;
    return e ? `${e} ` : '';
  };
  for (const y of years) {
    out.push(`**${y.label}**`);
    for (const l of y.lines) {
      const gameTag = l.game === 'D1' && !y.label.endsWith('D1') ? ' · D1' : '';
      const bits: string[] = [];
      // PvP reads as matches; every other grouped line reads "name ×N".
      let label = l.name;
      if (l.kind === 'pvp') {
        if (l.count > 1) bits.push(`${l.count} matches`);
      } else if (l.count > 1) {
        label += ` ×${l.count}`;
      }
      // D1 history carries no durations: leave the time off rather than print 0s.
      if (l.totalSeconds > 0) bits.push(formatCardDuration(l.totalSeconds));
      const link = `[${l.count > 1 ? 'Longest' : 'Report'}](${l.reportUrl})`;
      out.push(`${iconText(l)}${[label + gameTag, ...bits].join(' · ')} ${link}`);
    }
    out.push('');
  }
  if (hiddenActivities > 0) {
    out.push(`[+${hiddenActivities} more](${url})`);
  }
  if (total === 0) {
    out.push(`No activities on ${MONTHS[opts.month - 1]} ${opts.day}.`);
  }
  out.push(`[Open in Destiny Chronicle](${url})`);

  const yearCount = new Set(lines.map((l) => l.year)).size;
  return {
    embed: {
      title,
      description: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
      color: OTD_EMBED_COLOR,
      footer: { text: `${total} activities across ${yearCount} years` },
    },
    model: {
      title,
      firsts: opts.firsts ?? [],
      years,
      hiddenActivities,
      total,
      yearCount,
      url,
    },
  };
}
