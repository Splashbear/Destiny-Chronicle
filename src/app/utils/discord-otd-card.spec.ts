import {
  allocateLines,
  buildOtdCard,
  formatCardDuration,
  groupOtdRows,
  OtdDefLookup,
  OtdRow,
  reportUrl,
} from './discord-otd-card';

const lookup: OtdDefLookup = (game, hash) => {
  const defs: Record<string, any> = {
    'D2:1': { name: 'Vow of the Disciple', icon: '/common/destiny2_content/icons/vow.png' },
    'D2:2': { name: 'Trials of Osiris', icon: '/common/destiny2_content/icons/t.png', isPvP: true, modes: [84, 5], typeName: 'Crucible' },
    'D2:20': { name: 'Altar of Flame', icon: '/x/a.png', isPvP: true, modes: [48, 5], typeName: 'Rumble' },
    'D2:21': { name: 'Nightfall: Advanced', icon: '/x/n.png', modes: [46, 18, 7], typeName: 'Nightfall' },
    'D2:22': { name: 'The Insight Terminus', icon: '/x/s.png', modes: [3, 18, 7], typeName: 'Vanguard Op' },
    'D2:23': { name: 'Heist Battleground: Mars', icon: '/x/b.png', modes: [3, 18, 7], typeName: 'Strike' },
    'D2:24': { name: 'Bay of Drowned Wishes', icon: '/x/ls.png', modes: [87, 7], typeName: 'Lost Sector' },
    'D2:25': { name: 'Lost Sector: Perdition', icon: '/x/ls2.png', modes: [87, 7], typeName: 'Lost Sector' },
    'D2:26': { name: 'Emerald Coast', icon: '/x/g.png', modes: [63, 64], typeName: 'Gambit' },
    'D2:27': { name: 'Europa', icon: '/x/p.png', modes: [6, 7], typeName: 'Explore' },
    'D2:28': { name: 'Last Wish: Standard', icon: '/x/r.png', modes: [4, 7], typeName: 'Raid' },
    'D2:29': { name: 'Pit of Heresy', icon: '/x/d.png', modes: [82, 7], typeName: 'Dungeon' },
    'D2:30': { name: '', modes: [2, 7], typeName: 'Story' },
    'D1:40': { name: 'Skyshock', typeName: 'Rumble' },
    'D1:41': { name: 'Patrol the Dreadnaught', typeName: 'Patrol' },
    'D1:42': { name: 'The Will of Crota', typeName: 'Strike' },
    'D1:3': { name: "King's Fall (Hard)", icon: '/common/destiny_content/icons/kf.png' },
  };
  return defs[`${game}:${hash}`];
};

const row = (o: Partial<OtdRow> & { instanceId: string; period: string }): OtdRow => ({
  activityHash: 1,
  completed: true,
  durationSeconds: 600,
  game: 'D2',
  ...o,
});

const player = { name: 'Splashbear#1078', membershipType: 2, membershipId: '4611686018465122437', game: 'D2' as const };
const base = { player, month: 11, day: 3, timeZone: 'America/New_York', lookup };

describe('discord-otd-card', () => {
  it('formats durations', () => {
    expect(formatCardDuration(45)).toBe('45s');
    expect(formatCardDuration(2280)).toBe('38m');
    expect(formatCardDuration(3845)).toBe('1h04m');
    expect(formatCardDuration(9060)).toBe('2h31m');
  });

  it('links reports: D2 to Bungie, D1 to the D1 report page', () => {
    expect(reportUrl('15', 'D2')).toBe('https://www.bungie.net/en/PGCR/15');
    expect(reportUrl('15', 'D1')).toBe('https://pgcr.eververse.trade/destiny1/15');
  });

  it('reads the calendar day in the given zone (late evening UTC is still the day before in New York)', () => {
    // 2024-11-04T03:30Z is Nov 3 22:30 in New York.
    const rows = [row({ instanceId: '1', period: '2024-11-04T03:30:00Z' })];
    expect(groupOtdRows(rows, 11, 3, 'America/New_York', lookup).total).toBe(1);
    expect(groupOtdRows(rows, 11, 3, 'UTC', lookup).total).toBe(0);
    expect(groupOtdRows(rows, 11, 4, 'UTC', lookup).total).toBe(1);
  });

  it('keys games by game + instanceId: the same id in D1 and D2 are two activities, duplicates collapse', () => {
    const rows = [
      row({ instanceId: '7', period: '2024-11-03T15:00:00Z' }),
      row({ instanceId: '7', period: '2024-11-03T15:00:00Z' }),
      row({ instanceId: '7', period: '2015-11-03T15:00:00Z', game: 'D1', activityHash: 3 }),
    ];
    expect(groupOtdRows(rows, 11, 3, 'UTC', lookup).total).toBe(2);
  });

  it('groups repeated games and calls PvP "matches", sums time, links the longest report', () => {
    const rows = [1, 2, 3].map((i) =>
      row({ instanceId: String(100 + i), period: `2025-11-03T1${i}:00:00Z`, activityHash: 2, durationSeconds: i * 600 })
    );
    const card = buildOtdCard({ ...base, rows });
    const line = card.model.years[0].lines[0];
    expect(line.count).toBe(3);
    expect(line.totalSeconds).toBe(3600);
    expect(line.reportInstanceId).toBe('103');
    expect(card.embed.description).toContain('PvP · 3 matches · 1h00m [Longest](https://www.bungie.net/en/PGCR/103)');
  });

  it('lists years newest first and labels D1 years', () => {
    const rows = [
      row({ instanceId: '1', period: '2023-11-03T15:00:00Z' }),
      row({ instanceId: '2', period: '2015-11-03T15:00:00Z', game: 'D1', activityHash: 3 }),
      row({ instanceId: '3', period: '2025-11-03T15:00:00Z', activityHash: 2 }),
    ];
    const card = buildOtdCard({ ...base, rows });
    expect(card.model.years.map((y) => y.label)).toEqual(['2025', '2023', '2015 · D1']);
    expect(card.embed.footer.text).toBe('3 activities across 3 years');
    expect(card.embed.description).toContain('[Report](https://pgcr.eververse.trade/destiny1/2)');
  });

  it('labels a D1 line inside a mixed year', () => {
    const rows = [
      row({ instanceId: '1', period: '2015-11-03T15:00:00Z' }),
      row({ instanceId: '2', period: '2015-11-03T16:00:00Z', game: 'D1', activityHash: 3 }),
    ];
    const card = buildOtdCard({ ...base, rows });
    expect(card.model.years[0].label).toBe('2015');
    expect(card.embed.description).toContain("King's Fall (Hard) · D1");
  });

  it('shows Unknown activity for a hash Bungie has no definition for, never a guess', () => {
    const rows = [row({ instanceId: '1', period: '2025-11-03T15:00:00Z', activityHash: 999 })];
    expect(buildOtdCard({ ...base, rows }).embed.description).toContain('Unknown activity');
  });

  it('shows a Firsts banner only for firsts it was given', () => {
    const rows = [row({ instanceId: '1', period: '2023-11-03T15:00:00Z' })];
    expect(buildOtdCard({ ...base, rows }).embed.description).not.toContain('First');
    const withFirst = buildOtdCard({ ...base, rows, firsts: [{ name: 'Vow of the Disciple', game: 'D2', year: 2023 }] });
    expect(withFirst.embed.description.startsWith('🏆 **First Vow of the Disciple clear** · 2023')).toBeTrue();
  });

  it('stays within the line budget, keeps every year visible and ends with +N more', () => {
    const rows: OtdRow[] = [];
    for (let y = 2015; y <= 2025; y++) {
      for (let i = 0; i < 6; i++) {
        rows.push(row({ instanceId: `${y}${i}`, period: `${y}-11-03T1${i}:00:00Z`, activityHash: 1 + (i % 2) * 0, durationSeconds: 100 + i }));
      }
    }
    // distinct names per row so nothing groups
    const names = new Map<string, string>();
    const lk: OtdDefLookup = (g, h) => ({ name: `Act ${h}` });
    const r2 = rows.map((r, i) => ({ ...r, activityHash: i }));
    const card = buildOtdCard({ ...base, rows: r2, lookup: lk, maxLines: 22 });
    const lineCount = card.model.years.reduce((n, y) => n + 1 + y.lines.length, 0);
    expect(lineCount).toBeLessThanOrEqual(22);
    expect(card.model.years.length).toBe(11);
    expect(card.model.hiddenActivities).toBe(66 - card.model.years.reduce((n, y) => n + y.lines.length, 0));
    expect(card.embed.description).toMatch(/\[\+\d+ more\]\(https:\/\/destinychronicle\.com\/\?a=2-4611686018465122437-d2&tab=otd&d=\d{4}-11-03\)/);
    expect(card.embed.description.length).toBeLessThan(4096);
    expect(names.size).toBe(0);
  });

  it('ends with the deep link, pinned to the game, and has no coverage or archive wording', () => {
    const rows = [row({ instanceId: '1', period: '2025-11-03T15:00:00Z' })];
    const d = buildOtdCard({ ...base, rows }).embed.description;
    expect(d).toContain('[Open in Destiny Chronicle](https://destinychronicle.com/?a=2-4611686018465122437-d2&tab=otd&d=');
    expect(d.toLowerCase()).not.toMatch(/coverage|archive/);
  });

  it('says so when the day is empty', () => {
    const card = buildOtdCard({ ...base, rows: [] });
    expect(card.embed.description).toContain('No activities on Nov 3.');
    expect(card.embed.footer.text).toBe('0 activities across 0 years');
  });

  it('uses emoji markup when given, otherwise no icon text', () => {
    const rows = [row({ instanceId: '1', period: '2025-11-03T15:00:00Z' })];
    const card = buildOtdCard({ ...base, rows, emojiFor: () => '<:vow:1>' });
    expect(card.embed.description).toContain('<:vow:1> Vow of the Disciple');
  });

  const day = (n: number, hash: number, secs = 600, extra: Partial<OtdRow> = {}) =>
    row({ instanceId: `9${n}${hash}${secs}`, period: '2024-11-03T15:00:00Z', activityHash: hash, durationSeconds: secs, ...extra });

  it('rolls every PvP mode and map of a year into one PvP line with matches and total time', () => {
    const rows = [day(1, 2, 3000), day(2, 20, 2400), day(3, 2, 2400)];
    const card = buildOtdCard({ ...base, rows });
    const lines = card.model.years[0].lines;
    expect(lines.length).toBe(1);
    expect(lines[0].kind).toBe('pvp');
    expect(card.embed.description).toContain('PvP · 3 matches · 2h10m ');
    expect(card.embed.description).not.toContain('Altar of Flame');
  });

  it('shows a single PvP match without a count', () => {
    const card = buildOtdCard({ ...base, rows: [day(1, 2, 780)] });
    expect(card.embed.description).toContain('PvP · 13m [Report]');
  });

  it('rolls strikes and Nightfalls into "Strikes ×N" but keeps Gambit separate', () => {
    const rows = [day(1, 21), day(2, 22), day(3, 22, 700), day(4, 26), day(5, 26, 700)];
    const card = buildOtdCard({ ...base, rows });
    const text = card.embed.description;
    expect(text).toContain('Strikes ×3 · 31m');
    expect(text).toContain('Gambit ×2 · 21m');
  });

  it('puts Battlegrounds in their own line, not Strikes', () => {
    const rows = [day(1, 23), day(2, 23, 700), day(3, 22)];
    const text = buildOtdCard({ ...base, rows }).embed.description;
    expect(text).toContain('Battlegrounds ×2 · 21m');
    expect(text).toContain('Strikes · 10m');
  });

  it('lists Lost Sectors per sector name', () => {
    const rows = [day(1, 24), day(2, 24, 700), day(3, 24, 800), day(4, 25)];
    const text = buildOtdCard({ ...base, rows }).embed.description;
    expect(text).toContain('Lost Sector – Bay of Drowned Wishes ×3 · 35m');
    expect(text).toContain('Lost Sector – Perdition · 10m');
  });

  it('keeps raids, dungeons and story missions as their own named lines, and Patrol together', () => {
    const rows = [day(1, 28, 3000), day(2, 28, 3000), day(3, 29, 4000), day(4, 27), day(5, 27, 300)];
    const text = buildOtdCard({ ...base, rows }).embed.description;
    expect(text).toContain('Last Wish: Standard ×2 · 1h40m');
    expect(text).toContain('Pit of Heresy · 1h06m');
    expect(text).toContain('Patrol ×2 · 15m');
  });

  it('falls back to the Bungie type name for an unnamed definition, never an invented name', () => {
    const text = buildOtdCard({ ...base, rows: [day(1, 30)] }).embed.description;
    expect(text).toContain('Story · 10m');
  });

  it('consolidates D1 from Bungie type names and leaves out durations it does not have', () => {
    const rows = [
      row({ instanceId: '1', period: '2015-11-03T15:00:00Z', game: 'D1', activityHash: 40, durationSeconds: 0 }),
      row({ instanceId: '2', period: '2015-11-03T16:00:00Z', game: 'D1', activityHash: 40, durationSeconds: 0 }),
      row({ instanceId: '3', period: '2015-11-03T17:00:00Z', game: 'D1', activityHash: 41, durationSeconds: 0 }),
      row({ instanceId: '4', period: '2015-11-03T18:00:00Z', game: 'D1', activityHash: 42, durationSeconds: 0 }),
    ];
    const card = buildOtdCard({ ...base, rows });
    expect(card.model.years[0].label).toBe('2015 · D1');
    const text = card.embed.description;
    expect(text).toContain('PvP · 2 matches [Longest]');
    expect(text).toContain('Patrol [Report]');
    expect(text).toContain('Strikes [Report]');
    expect(text).not.toContain('0s');
  });

  it('uses the mode icon for mode-level lines, else a shared activity icon, else none', () => {
    const rows = [day(1, 2), day(2, 20), day(3, 23), day(4, 22)];
    const card = buildOtdCard({ ...base, rows, modeIconFor: (_g, m) => (m === 5 ? '/m/pvp.png' : null) });
    const byKind = Object.fromEntries(card.model.years[0].lines.map((l) => [l.kind, l.icon]));
    expect(byKind['pvp']).toBe('/m/pvp.png');
    expect(byKind['battlegrounds']).toBe('/x/b.png');
    expect(byKind['strikes']).toBe('/x/s.png');
    const noMode = buildOtdCard({ ...base, rows: [day(1, 2), day(2, 20)] });
    expect(noMode.model.years[0].lines[0].icon).toBeNull();
  });

  it('allocates one line to each year before filling', () => {
    const mk = (n: number) => Array.from({ length: n }, () => ({}) as any);
    expect(allocateLines([{ year: 2, lines: mk(9) }, { year: 1, lines: mk(9) }], 7)).toEqual([3, 2]);
  });
});
