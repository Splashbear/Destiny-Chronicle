// /otd data pipeline for the Discord card. No Discord SDK, no Discord token.
//   node discord-bot/otd.mjs 2-4611686018465122437-d2 [--tz America/New_York] [--date 11-03] [--json out.json]
// Needs BUNGIE_API_KEY in the environment (sent only as the X-API-Key header, never printed).
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DC_API = process.env.DC_API_ROOT || 'https://api.destinychronicle.com';
const BUNGIE = 'https://www.bungie.net';
const ACCOUNT = /^([1-6])-(\d{1,20})-(d1|d2)$/;

/** Bundle the pure TypeScript card builder once, so the bot and the site share one implementation. */
export async function loadCardBuilder(entry = 'discord-otd-card.ts') {
  const dir = mkdtempSync(join(tmpdir(), 'dc-card-'));
  const outfile = join(dir, 'card.mjs');
  await build({
    entryPoints: [resolve(here, '../src/app/utils', entry)],
    bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error',
  });
  return import(pathToFileURL(outfile).href);
}

export function bungieHeaders() {
  const key = process.env.BUNGIE_API_KEY;
  if (!key) throw new Error('BUNGIE_API_KEY is not set');
  return { 'X-API-Key': key };
}

export async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} for ${url.split('?')[0]}`);
  return res.json();
}

/** Rows from the Destiny Chronicle API (history up to its own latest period). */
export async function fetchArchiveRows(membershipId, game) {
  const body = await getJson(
    `${DC_API}/players/${membershipId}/activities?game=${game}&limit=50000`,
    { 'X-DC-Client': 'discord-bot' }
  );
  return {
    rows: (body.activities || []).map((a) => ({
      instanceId: String(a.instanceId), period: a.period, activityHash: a.activityHash,
      completed: !!a.completed, durationSeconds: Number(a.durationSeconds) || 0, game,
    })),
    maxPeriod: body.coverage?.maxPeriod ?? null,
  };
}

/** D2 only: pages of Bungie's own activity history newer than `since`, for every character. */
export async function fetchBungieSince(membershipType, membershipId, since) {
  const h = bungieHeaders();
  const prof = await getJson(
    `${BUNGIE}/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=200`, h);
  const chars = Object.keys(prof.Response?.characters?.data ?? {});
  const sinceMs = since ? Date.parse(since) : 0;
  const rows = [];
  for (const cid of chars) {
    for (let page = 0; page < 60; page++) {
      const r = await getJson(
        `${BUNGIE}/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${cid}/Stats/Activities/?mode=0&count=250&page=${page}`, h);
      const acts = r.Response?.activities ?? [];
      if (!acts.length) break;
      for (const a of acts) {
        rows.push({
          instanceId: String(a.activityDetails.instanceId), period: a.period,
          activityHash: a.activityDetails.directorActivityHash,
          completed: a.values?.completed?.basic?.value === 1,
          durationSeconds: Number(a.values?.activityDurationSeconds?.basic?.value) || 0,
          game: 'D2',
        });
      }
      if (Date.parse(acts[acts.length - 1].period) < sinceMs) break;
    }
  }
  return rows.filter((r) => Date.parse(r.period) >= sinceMs);
}

export async function fetchDisplayName(membershipType, membershipId) {
  const r = await getJson(
    `${BUNGIE}/Platform/Destiny2/-1/Profile/${membershipId}/LinkedProfiles/?getAllMemberships=true`, bungieHeaders());
  const p = (r.Response?.profiles ?? []).find(
    (x) => x.membershipType === membershipType && String(x.membershipId) === membershipId);
  const base = p?.bungieGlobalDisplayName || p?.displayName;
  if (!base) return null;
  return p?.bungieGlobalDisplayNameCode != null
    ? `${base}#${String(p.bungieGlobalDisplayNameCode).padStart(4, '0')}` : base;
}

/** Bungie definitions for the hashes in play, cached on disk. Names, types, modes and icons are Bungie's own. */
export async function fetchDefinitions(hashesByGame, cacheFile = join(tmpdir(), 'dc-otd-defs-v2.json')) {
  const h = bungieHeaders();
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const pool = async (items, fn) => {
    let i = 0;
    await Promise.all(Array.from({ length: 6 }, async () => { while (i < items.length) await fn(items[i++]); }));
  };
  const todo = [];
  for (const [game, set] of Object.entries(hashesByGame))
    for (const hash of set) if (!(`${game}:${hash}` in cache)) todo.push([game, hash]);
  await pool(todo, async ([game, hash]) => {
    try {
      if (game === 'D2') {
        const d = (await getJson(`${BUNGIE}/Platform/Destiny2/Manifest/DestinyActivityDefinition/${hash}/`, h)).Response;
        cache[`${game}:${hash}`] = {
          name: d?.displayProperties?.name || null,
          icon: d?.displayProperties?.hasIcon ? d.displayProperties.icon : null,
          isPvP: !!d?.isPvP, typeHash: d?.activityTypeHash || 0,
          modes: d?.activityModeTypes ?? [], modeHashes: d?.activityModeHashes ?? [],
        };
      } else {
        const d = (await getJson(`${BUNGIE}/d1/Platform/Destiny/Manifest/Activity/${hash}/`, h)).Response?.data?.activity;
        cache[`${game}:${hash}`] = { name: d?.activityName || null, icon: d?.icon || null,
          isPvP: !!d?.isPvP, typeHash: d?.activityTypeHash || 0, modes: [], modeHashes: [] };
      }
    } catch { /* leave undefined: the card shows "Unknown activity" */ }
  });
  // Activity type names (Bungie's own: "Raid", "Lost Sector", "Rumble", ...).
  const typeTodo = [];
  for (const [k, d] of Object.entries(cache)) {
    if (k.includes(':') && !k.startsWith('T:') && !k.startsWith('M:') && d?.typeHash) {
      const tk = `T:${k.split(':')[0]}:${d.typeHash}`;
      if (!(tk in cache) && !typeTodo.some((x) => x[0] === tk)) typeTodo.push([tk, k.split(':')[0], d.typeHash]);
    }
  }
  await pool(typeTodo, async ([tk, game, th]) => {
    try {
      cache[tk] = game === 'D2'
        ? (await getJson(`${BUNGIE}/Platform/Destiny2/Manifest/DestinyActivityTypeDefinition/${th}/`, h)).Response?.displayProperties?.name || null
        : (await getJson(`${BUNGIE}/d1/Platform/Destiny/Manifest/ActivityType/${th}/`, h)).Response?.data?.activityType?.activityTypeName || null;
    } catch { cache[tk] = null; }
  });
  // Mode-level icons (D2): the mode definition for each mode the card consolidates.
  const MODES = [4, 5, 6, 18, 63, 75, 82, 87];
  const modeTodo = [];
  for (const [k, d] of Object.entries(cache)) {
    if (!k.startsWith('D2:') || !d?.modes) continue;
    d.modes.forEach((m, i) => {
      const mk = `M:D2:${m}`;
      if (MODES.includes(m) && d.modeHashes[i] && !(mk in cache) && !modeTodo.some((x) => x[0] === mk)) modeTodo.push([mk, d.modeHashes[i]]);
    });
  }
  await pool(modeTodo, async ([mk, mh]) => {
    try {
      const dp = (await getJson(`${BUNGIE}/Platform/Destiny2/Manifest/DestinyActivityModeDefinition/${mh}/`, h)).Response?.displayProperties;
      cache[mk] = { icon: dp?.hasIcon ? dp.icon : null };
    } catch { cache[mk] = { icon: null }; }
  });
  // Some definitions point at icon files Bungie no longer serves. Show no icon rather than a broken one.
  const unchecked = Object.values(cache).filter((d) => d && typeof d === 'object' && d.icon && !d.iconChecked);
  await pool(unchecked, async (d) => {
    const url = d.icon.startsWith('http') ? d.icon : `${BUNGIE}${d.icon}`;
    try { if (!(await fetch(url, { method: 'HEAD' })).ok) d.icon = null; } catch { d.icon = null; }
    d.iconChecked = true;
  });
  writeFileSync(cacheFile, JSON.stringify(cache));
  return cache;
}

/** Archive rows plus (D2) Bungie's own newer history: the same rows every card works from. */
export async function loadAccountRows(membershipType, membershipId, game) {
  const archive = await fetchArchiveRows(membershipId, game);
  let rows = archive.rows;
  let recentRows = 0;
  if (game === 'D2') {
    const recent = await fetchBungieSince(membershipType, membershipId, archive.maxPeriod);
    recentRows = recent.length;
    rows = rows.concat(recent);
  }
  return { rows, archive, recentRows };
}

/** Everything the card needs for one pinned account link, e.g. "2-4611686018465122437-d2". */
export async function buildOtdForAccount(accountLink, { timeZone = 'America/New_York', date } = {}) {
  const m = ACCOUNT.exec(accountLink);
  if (!m) throw new Error('Expected <membershipType>-<membershipId>-d1|d2');
  const [, type, membershipId, g] = m;
  const membershipType = Number(type);
  const game = g.toUpperCase();
  const card = await loadCardBuilder();

  const now = card.zonedParts(new Date().toISOString(), timeZone);
  const [month, day] = date ? date.split('-').map(Number) : [now.month, now.day];

  const { rows, archive, recentRows } = await loadAccountRows(membershipType, membershipId, game);
  const hashes = { D1: new Set(), D2: new Set() };
  for (const r of rows) {
    const p = card.zonedParts(r.period, timeZone);
    if (p && p.month === month && p.day === day) hashes[r.game].add(String(r.activityHash));
  }
  const defs = await fetchDefinitions(hashes);
  const name = (await fetchDisplayName(membershipType, membershipId)) || `Player ${membershipId}`;
  const out = card.buildOtdCard({
    player: { name, membershipType, membershipId, game }, month, day, rows, timeZone,
    lookup: (gm, hash) => {
      const d = defs[`${gm}:${hash}`];
      return d ? { ...d, typeName: defs[`T:${gm}:${d.typeHash}`] ?? null } : undefined;
    },
    modeIconFor: (gm, mode) => defs[`M:${gm}:${mode}`]?.icon ?? null,
  });
  return { card: out, archiveMaxPeriod: archive.maxPeriod, archiveRows: archive.rows.length, recentRows };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const t0 = Date.now();
  const res = await buildOtdForAccount(args[0], { timeZone: opt('--tz'), date: opt('--date') });
  const j = opt('--json');
  if (j) writeFileSync(j, JSON.stringify(res, null, 2));
  console.log(res.card.embed.title + '\n' + res.card.embed.description + '\n— ' + res.card.embed.footer.text);
  console.log(`\n[archive rows ${res.archiveRows}, Bungie rows after ${res.archiveMaxPeriod}: ${res.recentRows}, ${Date.now() - t0} ms]`);
}
