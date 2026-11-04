// /firsts data pipeline for the Discord card. No Discord SDK, no Discord token.
//   node discord-bot/firsts.mjs 2-4611686018465122437-d2 raids|dungeons [--json out.json]
// Needs BUNGIE_API_KEY in the environment (sent only as the X-API-Key header, never printed).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCardBuilder, bungieHeaders, getJson, fetchDisplayName, fetchDefinitions, loadAccountRows } from './otd.mjs';

const ACCOUNT = /^([1-6])-(\d{1,20})-(d1|d2)$/;

/** The report's own period for one clear, straight from Bungie. Null when Bungie cannot confirm it. */
export async function fetchReportPeriod(instanceId, game) {
  try {
    const h = bungieHeaders();
    if (game === 'D2') {
      const r = (await getJson(`https://stats.bungie.net/Platform/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`, h)).Response;
      return r && String(r.activityDetails?.instanceId) === String(instanceId) ? r.period ?? null : null;
    }
    const r = (await getJson(`https://www.bungie.net/d1/Platform/Destiny/Stats/PostGameCarnageReport/${instanceId}/`, h)).Response?.data;
    return r && String(r.activityDetails?.instanceId) === String(instanceId) ? r.period ?? null : null;
  } catch { return null; }
}

/** Check the earliest clears of every family until one is confirmed. */
export async function verifyFirsts(groups, game, concurrency = 6) {
  const verified = {};
  let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < groups.length) {
      const g = groups[i++];
      for (const c of g.candidates) {
        const period = await fetchReportPeriod(c.instanceId, game);
        if (period) { verified[c.instanceId] = period; break; }
      }
    }
  }));
  return verified;
}

export async function buildFirstsForAccount(accountLink, kind, { timeZone = 'America/New_York' } = {}) {
  const m = ACCOUNT.exec(accountLink);
  if (!m) throw new Error('Expected <membershipType>-<membershipId>-d1|d2');
  if (kind !== 'raids' && kind !== 'dungeons') throw new Error('Expected raids or dungeons');
  const [, type, membershipId, g] = m;
  const membershipType = Number(type);
  const game = g.toUpperCase();
  if (game === 'D1' && kind === 'dungeons') throw new Error('Destiny 1 has no dungeons');
  const card = await loadCardBuilder('discord-firsts-card.ts');
  const t0 = Date.now();

  const [{ rows, archive, recentRows }, name] = await Promise.all([
    loadAccountRows(membershipType, membershipId, game),
    fetchDisplayName(membershipType, membershipId).then((n) => n || `Player ${membershipId}`),
  ]);
  const t1 = Date.now();
  // Definitions are needed only for activities that were completed.
  const hashes = { D1: new Set(), D2: new Set() };
  for (const r of rows) if (r.completed) hashes[r.game].add(String(r.activityHash));
  const defs = await fetchDefinitions(hashes);
  const lookup = (gm, hash) => {
    const d = defs[`${gm}:${hash}`];
    return d ? { ...d, typeName: defs[`T:${gm}:${d.typeHash}`] ?? null } : undefined;
  };
  const t2 = Date.now();
  const groups = card.groupFirsts(rows, kind, game, lookup);
  const verified = await verifyFirsts(groups, game);
  const t3 = Date.now();
  const out = card.buildFirstsCard({
    player: { name, membershipType, membershipId, game }, kind, groups, verified, timeZone,
    modeIconFor: (gm, mode) => defs[`M:${gm}:${mode}`]?.icon ?? null,
  });
  return {
    card: out, archiveMaxPeriod: archive.maxPeriod, archiveRows: archive.rows.length, recentRows,
    verifiedCount: Object.keys(verified).length, groupCount: groups.length,
    timings: { rowsMs: t1 - t0, definitionsMs: t2 - t1, verifyMs: t3 - t2, totalMs: Date.now() - t0 },
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const res = await buildFirstsForAccount(args[0], args[1] || 'raids', { timeZone: opt('--tz') });
  const j = opt('--json');
  if (j) writeFileSync(j, JSON.stringify(res, null, 2));
  console.log(res.card.embed.title + '\n' + res.card.embed.description + '\n— ' + res.card.embed.footer.text);
  console.log(`\n[${res.groupCount} families, ${res.verifiedCount} verified, ${JSON.stringify(res.timings)}]`);
}
