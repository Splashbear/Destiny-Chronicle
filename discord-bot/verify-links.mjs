// Spot-check card report links against Bungie's PGCR endpoint: node discord-bot/verify-links.mjs card.json [n]
import { readFileSync } from 'node:fs';
const { card } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const n = Number(process.argv[3] || 5);
const key = process.env.BUNGIE_API_KEY;
const lines = card.model.years.flatMap((y) => y.lines.map((l) => ({ ...l, year: y.year })));
const pick = lines.filter((_, i) => i % Math.max(1, Math.floor(lines.length / n)) === 0).slice(0, n);
for (const l of pick) {
  const r = await (await fetch(`https://stats.bungie.net/Platform/Destiny2/Stats/PostGameCarnageReport/${l.reportInstanceId}/`, { headers: { 'X-API-Key': key } })).json();
  const pg = r.Response;
  const page = await fetch(l.reportUrl, { redirect: 'manual' });
  const dur = pg?.entries?.[0]?.values?.activityDurationSeconds?.basic?.value;
  console.log(JSON.stringify({ line: `${l.year} ${l.name}`, id: l.reportInstanceId, bungieErr: r.ErrorCode, period: pg?.period, yearMatch: pg?.period?.startsWith(String(l.year)) || null, pageStatus: page.status, entries: pg?.entries?.length }));
}
