/**
 * /titles Discord card: pure builder (no network, no Discord SDK).
 *
 * Titles are built exactly like the site's TitleService.getPlayerTitles: Bungie's title
 * presentation nodes (current + legacy), the player's own records, the site's name overrides
 * (SPECIAL_TITLES), and the site's title groups. Differences from the site tab, on purpose:
 * Raid and Dungeon groups come first, and icons are Bungie's only (the site's local gilded
 * seal art is never used).
 *
 * No earn dates: Bungie does not provide them for titles, so none are shown.
 */
import { buildDeepLinkUrl } from './deep-link';
import {
  getTitleCategory,
  normalizeTitleKey,
  TitleCategory,
} from '../config/title-categories';
import {
  normalizeTitleName,
  SPECIAL_TITLES,
  titleReleaseRank,
} from '../config/title-release-order';

export const TITLE_PARENT_NODES = [616318467, 1881970629] as const;
const LEGACY_PARENT = 1881970629;

/** One title presentation node, reduced to what the card needs (Bungie definitions). */
export interface TitleNodeInput {
  /** Presentation node hash. */
  hash: number;
  completionRecordHash: number;
  /** Node displayProperties.name. */
  name?: string | null;
  icon?: string | null;
  /** iconSequences[0].frames: the last frame is the gilded look. */
  iconFrames?: string[] | null;
  parentNodeHashes?: number[];
  /** Record definition titleInfo.titlesByGender.Male. */
  recordTitle?: string | null;
  /** Record definition titleInfo.gildingTrackingRecordHash. */
  gildingHash?: number | null;
}

export interface TitleRecordInput {
  state: number;
  completedCount?: number;
}

export interface TitleItem {
  hash: number;
  name: string;
  normalized: string;
  completed: boolean;
  isGilded: boolean;
  timesGilded: number;
  legacy: boolean;
  releaseRank: number;
  category: TitleCategory;
  /** Bungie icon path (gilded frame when gilded). */
  icon: string | null;
}

/** Same rules as TitleService.getPlayerTitles. `records` is profile records, then every character's. */
export function buildTitleItems(
  nodes: TitleNodeInput[],
  records: Record<string, TitleRecordInput>,
  characterRecords: Array<Record<string, TitleRecordInput>> = []
): TitleItem[] {
  const find = (hash: number): TitleRecordInput | undefined => {
    const own = records[hash];
    if (own) return own;
    for (const chars of characterRecords) {
      if (chars?.[hash]) return chars[hash];
    }
    return undefined;
  };
  const byKey = new Map<string, TitleItem>();
  for (const node of nodes) {
    if (!node?.completionRecordHash) continue;
    const record = find(node.completionRecordHash);
    const special = SPECIAL_TITLES[node.completionRecordHash] || SPECIAL_TITLES[node.hash];
    const name = special ? special.name : node.recordTitle || node.name || 'Unknown';
    const normalized = normalizeTitleName(name);
    const completed = record ? (record.state & 1) !== 0 : false;

    let timesGilded = 0;
    const gildHash = special?.gildingTrackingRecordHash || node.gildingHash;
    if (gildHash && completed) {
      const gilding = find(gildHash);
      if (gilding) timesGilded = gilding.completedCount || 0;
    }
    const isGilded = timesGilded > 0;
    const frames = node.iconFrames ?? [];
    const gildedIcon = frames.length ? frames[frames.length - 1] : null;
    const key = `${name}#${node.completionRecordHash}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      hash: node.completionRecordHash,
      name,
      normalized,
      completed,
      isGilded,
      timesGilded: completed ? timesGilded : 0,
      legacy: (node.parentNodeHashes ?? []).includes(LEGACY_PARENT),
      releaseRank: titleReleaseRank(node.completionRecordHash, normalized),
      category: getTitleCategory(normalizeTitleKey(name)).category,
      icon: (isGilded && gildedIcon ? gildedIcon : node.icon) || null,
    });
  }
  return [...byKey.values()];
}

/** The site's own group names, Raid and Dungeon first. */
export const TITLES_CARD_GROUP_ORDER: TitleCategory[] = [
  'Raid',
  'Dungeon',
  'Seasonal/Episodal',
  'Moments of Triumph',
  'Expansion',
  'Special Events',
  'Competitive',
  'Other',
];

export interface TitlesPlayer {
  /** Display name with code, e.g. Splashbear#1078 */
  name: string;
  membershipType: number;
  membershipId: string;
}

export interface TitlesCardOptions {
  player: TitlesPlayer;
  items: TitleItem[];
  siteBase?: string;
  /** Optional emoji markup per Bungie icon path. Without it, lines have no icon. */
  emojiFor?: (iconPath: string) => string | undefined;
  /** Discord caps an embed description at 4096 characters. */
  maxChars?: number;
}

export interface TitlesGroup {
  category: TitleCategory;
  earned: number;
  total: number;
  gilded: number;
  /** Bungie seal of the group's newest earned title (its gilded look when gilded). */
  icon: string | null;
  owned: Array<{ name: string; timesGilded: number }>;
  missing: string[];
  hiddenOwned: number;
  hiddenMissing: number;
}

export interface TitlesLine {
  kind: 'group' | 'missingHeader' | 'missing';
  icon: string | null;
}

export interface TitlesCard {
  embed: {
    title: string;
    description: string;
    color: number;
    footer: { text: string };
  };
  model: {
    title: string;
    earned: number;
    total: number;
    gilded: number;
    missing: number;
    groups: TitlesGroup[];
    /** One entry per description line that is not a link, in order (used by the PNG renderer). */
    lines: TitlesLine[];
    url: string;
  };
}

export const TITLES_EMBED_COLOR = 0xc9a227;

function compareNewestFirst(a: TitleItem, b: TitleItem): number {
  const r = b.releaseRank - a.releaseRank;
  return r !== 0 ? r : a.name.localeCompare(b.name);
}

export function buildTitlesCard(opts: TitlesCardOptions): TitlesCard {
  const maxChars = opts.maxChars ?? 3800;
  const byCategory = new Map<TitleCategory, TitleItem[]>();
  for (const item of opts.items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  const groups: TitlesGroup[] = [];
  for (const category of TITLES_CARD_GROUP_ORDER) {
    const list = (byCategory.get(category) ?? []).sort(compareNewestFirst);
    if (!list.length) continue;
    const owned = list.filter((t) => t.completed);
    groups.push({
      category,
      earned: owned.length,
      total: list.length,
      gilded: owned.filter((t) => t.isGilded).length,
      icon: owned[0]?.icon ?? null,
      owned: owned.map((t) => ({ name: t.name, timesGilded: t.timesGilded })),
      missing: list.filter((t) => !t.completed).map((t) => t.name),
      hiddenOwned: 0,
      hiddenMissing: 0,
    });
  }
  const earned = groups.reduce((n, g) => n + g.earned, 0);
  const total = groups.reduce((n, g) => n + g.total, 0);
  const gilded = groups.reduce((n, g) => n + g.gilded, 0);
  const missing = total - earned;

  const base = opts.siteBase ?? 'https://destinychronicle.com';
  const url = buildDeepLinkUrl(base, {
    accounts: [
      { membershipType: opts.player.membershipType, membershipId: opts.player.membershipId, game: 'D2' },
    ],
    tab: 'seals',
  });

  const ownedText = (g: TitlesGroup): string =>
    g.owned.map((o) => (o.timesGilded > 0 ? `**${o.name}** ×${o.timesGilded}` : o.name)).join(', ');
  const render = (): { text: string; lines: TitlesLine[] } => {
    const out: string[] = [];
    const lines: TitlesLine[] = [];
    for (const g of groups) {
      const e = g.icon ? opts.emojiFor?.(g.icon) : undefined;
      const gild = g.gilded > 0 ? ` · ${g.gilded} gilded` : '';
      const names = g.owned.length ? ` · ${ownedText(g)}${g.hiddenOwned ? `, +${g.hiddenOwned} more` : ''}` : '';
      out.push(`${e ? `${e} ` : ''}**${g.category}** ${g.earned}/${g.total}${gild}${names}`);
      lines.push({ kind: 'group', icon: g.icon });
    }
    if (missing > 0) {
      out.push('');
      out.push(`**Missing (${missing})**`);
      lines.push({ kind: 'missingHeader', icon: null });
      for (const g of groups) {
        if (!g.missing.length) continue;
        out.push(`${g.category}: ${g.missing.join(', ')}${g.hiddenMissing ? `, +${g.hiddenMissing} more` : ''}`);
        lines.push({ kind: 'missing', icon: null });
      }
    }
    out.push('');
    out.push(`[Open in Destiny Chronicle](${url})`);
    return { text: out.join('\n'), lines };
  };

  // Keep inside Discord's embed limit: trim names from the end of the longest list, never silently.
  let rendered = render();
  while (rendered.text.length > maxChars) {
    let target: { g: TitlesGroup; list: 'owned' | 'missing' } | null = null;
    let longest = 0;
    for (const g of groups) {
      for (const list of ['owned', 'missing'] as const) {
        const len = list === 'owned' ? ownedText(g).length : g.missing.join(', ').length;
        if (len > longest && g[list].length > 0) {
          longest = len;
          target = { g, list };
        }
      }
    }
    if (!target) break;
    if (target.list === 'owned') {
      target.g.owned.pop();
      target.g.hiddenOwned++;
    } else {
      target.g.missing.pop();
      target.g.hiddenMissing++;
    }
    rendered = render();
  }

  const title = `Titles: ${opts.player.name} (${earned}/${total})`;
  return {
    embed: {
      title,
      description: rendered.text,
      color: TITLES_EMBED_COLOR,
      footer: { text: `${earned} of ${total} titles · ${gilded} gilded` },
    },
    model: { title, earned, total, gilded, missing, groups, lines: rendered.lines, url },
  };
}
