// Renders an /otd card as a phone-width PNG that approximates how Discord shows the embed.
//   node discord-bot/render-card.mjs card.json out.png [--width 390]
// Icons are fetched from bungie.net. Set CHROME=/path/to/chrome if Playwright has no browser installed.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [, , inFile, outFile, ...rest] = process.argv;
const width = Number(rest[rest.indexOf('--width') + 1]) || 390;
const { card } = JSON.parse(readFileSync(inFile, 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

const modelLines = card.model.years.flatMap((y) => y.lines);
let li = 0;
const rows = card.embed.description.split('\n').map((raw) => {
  if (!raw.trim()) return '<div class="gap"></div>';
  if (/^\*\*\d{4}( · D1)?\*\*$/.test(raw)) return `<div class="year">${inline(raw)}</div>`;
  if (raw.startsWith('🏆')) return `<div class="first">${inline(raw)}</div>`;
  if (/^\[(Open in|\+\d+ more)/.test(raw)) return `<div class="more">${inline(raw)}</div>`;
  const icon = modelLines[li++]?.icon;
  const img = icon ? `<img src="https://www.bungie.net${icon}">` : '<span class="noimg"></span>';
  return `<div class="line">${img}<span>${inline(raw)}</span></div>`;
});

const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box} body{margin:0;background:#313338;color:#dbdee1;font:15px/1.3 "Helvetica Neue",Arial,sans-serif;width:${width}px;padding:14px 12px}
.who{font-size:12px;color:#949ba4;margin-bottom:2px}.who b{color:#c9cdfb}
.app{font-weight:600;color:#fff;margin-bottom:6px;font-size:16px}.app i{font-style:normal;background:#5865f2;color:#fff;font-size:10px;padding:1px 4px;border-radius:3px;margin-left:4px;vertical-align:2px}
.embed{background:#2b2d31;border-left:4px solid #${card.embed.color.toString(16)};border-radius:4px;padding:10px 12px 10px 12px;max-width:100%}
.title{font-weight:700;color:#fff;margin-bottom:8px;font-size:15.5px}
.year{font-weight:700;color:#fff;margin:6px 0 3px}.line{display:flex;align-items:flex-start;gap:7px;margin:3px 0;font-size:14px}
.line img,.noimg{width:20px;height:20px;border-radius:3px;flex:none;background:#4a4636;margin-top:1px}
a{color:#00a8fc;text-decoration:none}.gap{height:2px}
.first{background:#4a3f1d;border-radius:4px;padding:6px 8px;margin-bottom:6px;font-size:14px;color:#ffe9a8}
.more{margin-top:8px;font-size:13px}.foot{margin-top:8px;font-size:12px;color:#b5bac1}
</style>
<div class="who">Splashbear used <b>/otd</b></div><div class="app">Destiny Chronicle<i>APP</i></div>
<div class="embed"><div class="title">${esc(card.embed.title)}</div>${rows.join('')}<div class="foot">${esc(card.embed.footer.text)}</div></div>`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForFunction(() => [...document.images].every((i) => i.complete));
const loaded = await page.evaluate(() => [...document.images].filter((i) => i.naturalWidth > 0).length + '/' + document.images.length);
await page.screenshot({ path: outFile, fullPage: true });
await browser.close();
console.log(`wrote ${outFile} (${width}px wide, icons loaded ${loaded})`);
