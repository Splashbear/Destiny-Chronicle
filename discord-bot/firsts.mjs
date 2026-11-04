// /firsts data pipeline for the Discord card. No Discord SDK, no Discord token.
//   node discord-bot/firsts.mjs 2-4611686018465122437-d2 raids|dungeons|pantheon [--json out.json]
// Needs BUNGIE_API_KEY in the environment (sent only as the X-API-Key header, never printed).
import { writeFileSync, readFileSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
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

const REPORT_CACHE = join(tmpdir(), 'dc-pgcr-clears-v1.json');
function readReportCache() { try { return JSON.parse(readFileSync(REPORT_CACHE, 'utf8')); } catch { return {}; } }
function writeReportCache(c) {
  try { const t = `${REPORT_CACHE}.${process.pid}`; writeFileSync(t, JSON.stringify(c)); renameSync(t, REPORT_CACHE); } catch { /* cache is optional */ }
}

/**
 * Bungie's report verdict for the account in one instance: cleared when any of the account's own
 * entries (any character) has completed = 1 and completionReason 0 (objective completed; D1 reports
 * carry no completionReason, so completed alone). Null when the report could not be read.
 * Reports never change once written, so verdicts are cached on disk by game + instance id.
 */
export async function fetchClearReport(instanceId, game, membershipId) {
  try {
    const h = bungieHeaders();
    const r = game === 'D2'
      ? (await getJson(`https://stats.bungie.net/Platform/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`, h)).Response
      : (await getJson(`https://www.bungie.net/d1/Platform/Destiny/Stats/PostGameCarnageReport/${instanceId}/`, h)).Response?.data;
    if (!r || String(r.activityDetails?.instanceId) !== String(instanceId) || !r.period) return null;
    const mine = (r.entries || []).filter((e) => String(e.player?.destinyUserInfo?.membershipId) === String(membershipId));
    const cleared = mine.some((e) => {
      const done = Number(e.values?.completed?.basic?.value) === 1;
      const reason = e.values?.completionReason?.basic?.value;
      return done && (reason === undefined || Number(reason) === 0);
    });
    // Kept for reporting: Bungie also marks some runs completed = 1 with completionReason 2 ("Failed").
    const completedAny = mine.some((e) => Number(e.values?.completed?.basic?.value) === 1);
    return { cleared, completedAny, period: r.period, entries: mine.length };
  } catch { return null; }
}

export async function fetchClearReports(instanceIds, game, membershipId, concurrency = 10) {
  const cache = readReportCache();
  const out = {};
  const todo = [];
  for (const id of instanceIds) {
    const hit = cache[`${game}:${id}:${membershipId}`];
    if (hit) out[id] = hit; else todo.push(id);
  }
  let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < todo.length) {
      const id = todo[i++];
      const rep = await fetchClearReport(id, game, membershipId);
      if (rep) { out[id] = rep; cache[`${game}:${id}:${membershipId}`] = rep; }
    }
  }));
  if (todo.length) writeReportCache(cache);
  return { reports: out, fetched: todo.length, missing: instanceIds.filter((id) => !out[id]).length };
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
  if (!['raids', 'dungeons', 'pantheon'].includes(kind)) throw new Error('Expected raids, dungeons or pantheon');
  const [, type, membershipId, g] = m;
  const membershipType = Number(type);
  const game = g.toUpperCase();
  if (game === 'D1' && kind !== 'raids') throw new Error('Destiny 1 has raids only');
  const card = await loadCardBuilder('discord-firsts-card.ts');
  const t0 = Date.now();

  const [{ rows, archive, recentRows }, name] = await Promise.all([
    loadAccountRows(membershipType, membershipId, game),
    fetchDisplayName(membershipType, membershipId).then((n) => n || `Player ${membershipId}`),
  ]);
  const t1 = Date.now();
  // Bungie's reports decide clears, so instances that history marks unfinished are checked too.
  const hashes = { D1: new Set(), D2: new Set() };
  for (const r of rows) hashes[r.game].add(String(r.activityHash));
  const defs = await fetchDefinitions(hashes);
  const lookup = (gm, hash) => {
    const d = defs[`${gm}:${hash}`];
    return d ? { ...d, typeName: defs[`T:${gm}:${d.typeHash}`] ?? null } : undefined;
  };
  const t2 = Date.now();
  const instances = card.firstsInstances(rows, kind, game, lookup);
  const { reports, fetched, missing } = await fetchClearReports(instances, game, membershipId);
  const groups = card.groupFirsts(rows, kind, game, lookup, reports);
  // Dates come from the reports; any first clear whose report could not be read gets checked once more.
  const verified = {};
  for (const [id, rep] of Object.entries(reports)) if (rep.cleared) verified[id] = rep.period;
  const unverified = groups.filter((g) => !g.candidates.some((c) => verified[c.instanceId]));
  Object.assign(verified, await verifyFirsts(unverified, game));
  const t3 = Date.now();
  const out = card.buildFirstsCard({
    player: { name, membershipType, membershipId, game }, kind, groups, verified, timeZone,
    modeIconFor: (gm, mode) => defs[`M:${gm}:${mode}`]?.icon ?? null,
  });
  return {
    card: out, archiveMaxPeriod: archive.maxPeriod, archiveRows: archive.rows.length, recentRows,
    verifiedCount: Object.keys(verified).length, groupCount: groups.length,
    reportsChecked: instances.length, reportsFetched: fetched, reportsMissing: missing,
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
  console.log(`\n[${res.groupCount} families, ${res.reportsChecked} reports (${res.reportsFetched} fetched, ${res.reportsMissing} unreadable), ${JSON.stringify(res.timings)}]`);
}
