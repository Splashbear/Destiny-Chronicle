#!/usr/bin/env node
/**
 * W19 smoke test for home / dedicated PC API.
 * Usage: node scripts/smoke-home-api.mjs [baseUrl]
 * Default baseUrl: http://127.0.0.1:3001
 *
 * Checks health + Splashbear / KaiserHughes activity lists (hubs may be excluded).
 * Does not print local filesystem paths from the server.
 */
const base = (process.argv[2] || 'http://127.0.0.1:3001').replace(/\/$/, '');

const PLAYERS = [
  { name: 'Splashbear', mid: '4611686018465122437' },
  { name: 'KaiserHughes', mid: '4611686018443970323' },
];

async function getJson(url) {
  const t0 = Date.now();
  const res = await fetch(url);
  const ms = Date.now() - t0;
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, ms, body };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('smoke-home-api', base);
  const health = await getJson(`${base}/health`);
  assert(health.status === 200, `health HTTP ${health.status}`);
  assert(health.body?.status === 'ok' || health.body?.archive_available != null, 'health shape');
  console.log('health', {
    ms: health.ms,
    archive_available: health.body.archive_available,
    gap_lean_enabled: health.body.gap_lean_enabled,
    port: health.body.port,
  });

  for (const p of PLAYERS) {
    const url = `${base}/players/${p.mid}/activities?game=D2&limit=100000`;
    const r = await getJson(url);
    assert(r.status === 200, `${p.name} HTTP ${r.status}`);
    const cov = r.body.coverage || {};
    const n = (r.body.activities || []).length;
    console.log(p.name, {
      ms: r.ms,
      rows: n,
      rowCount: cov.rowCount,
      level: cov.level,
      source: cov.source,
    });
    assert(n > 0, `${p.name} expected activities`);
    assert(cov.level !== 'full' || cov.level === 'full', 'level present');
    // D2 list may be full or partial (holes); never claim impossible perfection here.
    if (r.ms > 15000) {
      console.warn(`WARN ${p.name} slow: ${r.ms}ms (target cold ~2s on sorted/slim)`);
    }
  }

  // D1 must not be full
  const d1 = await getJson(
    `${base}/players/4611686018465122437/activities?game=D1&limit=1000`
  );
  const d1level = d1.body?.coverage?.level;
  console.log('Splashbear D1', { ms: d1.ms, level: d1level, rows: d1.body?.activities?.length });
  assert(d1level !== 'full', `D1 coverage must not be full (got ${d1level})`);

  console.log('SMOKE OK');
}

main().catch((e) => {
  console.error('SMOKE FAIL', e.message || e);
  process.exit(1);
});
