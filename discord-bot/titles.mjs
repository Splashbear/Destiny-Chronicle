// /titles data pipeline for the Discord card. No Discord SDK, no Discord token.
//   node discord-bot/titles.mjs 2-4611686018465122437-d2 [--json out.json]
// Needs BUNGIE_API_KEY in the environment (sent only as the X-API-Key header, never printed).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCardBuilder, bungieHeaders, getJson, fetchDisplayName } from './otd.mjs';

const BUNGIE = 'https://www.bungie.net';
const ACCOUNT = /^([1-6])-(\d{1,20})-(d1|d2)$/;
const PARENTS = [616318467, 1881970629];
const MANIFEST = `${BUNGIE}/Platform/Destiny2/Manifest`;

/** Title presentation nodes + their record definitions (Bungie's own), cached on disk. */
export async function fetchTitleNodes(cacheFile = join(tmpdir(), 'dc-title-nodes-v1.json')) {
  const h = bungieHeaders();
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const nodeHashes = [];
  for (const parent of PARENTS) {
    const p = (await getJson(`${MANIFEST}/DestinyPresentationNodeDefinition/${parent}/`, h)).Response;
    for (const c of p?.children?.presentationNodes ?? []) nodeHashes.push(c.presentationNodeHash);
  }
  const todo = nodeHashes.filter((n) => !(n in cache));
  let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < todo.length) {
      const hash = todo[i++];
      const d = (await getJson(`${MANIFEST}/DestinyPresentationNodeDefinition/${hash}/`, h)).Response;
      if (!d?.completionRecordHash) { cache[hash] = null; continue; }
      const r = (await getJson(`${MANIFEST}/DestinyRecordDefinition/${d.completionRecordHash}/`, h)).Response;
      const dp = d.displayProperties ?? {};
      cache[hash] = {
        hash: d.hash, completionRecordHash: d.completionRecordHash, name: dp.name ?? null,
        icon: dp.hasIcon === false ? null : dp.icon ?? null,
        iconFrames: (d.iconSequences ?? dp.iconSequences)?.[0]?.frames ?? null,
        parentNodeHashes: d.parentNodeHashes ?? [],
        recordTitle: r?.titleInfo?.titlesByGender?.Male ?? null,
        gildingHash: r?.titleInfo?.gildingTrackingRecordHash ?? null,
      };
    }
  }));
  writeFileSync(cacheFile, JSON.stringify(cache));
  return nodeHashes.map((n) => cache[n]).filter(Boolean);
}

/** Frames and icons that Bungie no longer serves show no icon instead of a broken one. */
async function checkIcons(items) {
  const ok = new Map();
  const paths = [...new Set(items.map((t) => t.icon).filter(Boolean))];
  let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < paths.length) {
      const p = paths[i++];
      try { ok.set(p, (await fetch(`${BUNGIE}${p}`, { method: 'HEAD' })).ok); } catch { ok.set(p, false); }
    }
  }));
  for (const t of items) if (t.icon && !ok.get(t.icon)) t.icon = null;
}

export async function buildTitlesForAccount(accountLink) {
  const m = ACCOUNT.exec(accountLink);
  if (!m) throw new Error('Expected <membershipType>-<membershipId>-d1|d2');
  const [, type, membershipId, g] = m;
  if (g.toLowerCase() === 'd1') throw new Error('Titles are Destiny 2 only');
  const membershipType = Number(type);
  const card = await loadCardBuilder('discord-titles-card.ts');
  const t0 = Date.now();
  const [nodes, profile, name] = await Promise.all([
    fetchTitleNodes(),
    getJson(`${BUNGIE}/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=900`, bungieHeaders()),
    fetchDisplayName(membershipType, membershipId),
  ]);
  const res = profile.Response ?? {};
  if (!res.profileRecords?.data) throw new Error('Records are private or unavailable for this account');
  const items = card.buildTitleItems(
    nodes, res.profileRecords.data.records ?? {},
    Object.values(res.characterRecords?.data ?? {}).map((c) => c.records ?? {}));
  await checkIcons(items);
  const out = card.buildTitlesCard({
    player: { name: name || `Player ${membershipId}`, membershipType, membershipId }, items,
  });
  return { card: out, titleNodes: nodes.length, ms: Date.now() - t0 };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const j = args.indexOf('--json') >= 0 ? args[args.indexOf('--json') + 1] : undefined;
  const t0 = Date.now();
  const res = await buildTitlesForAccount(args[0]);
  if (j) writeFileSync(j, JSON.stringify(res, null, 2));
  console.log(res.card.embed.title + '\n' + res.card.embed.description + '\n— ' + res.card.embed.footer.text);
  console.log(`\n[title nodes ${res.titleNodes}, ${Date.now() - t0} ms total, ${res.ms} ms after builder load]`);
}
