import {
  buildFirstsCard,
  firstsKindOf,
  firstsInstances,
  formatFirstDate,
  groupFirsts,
} from './discord-firsts-card';
import { OtdDefLookup, OtdRow } from './discord-otd-card';

const lookup: OtdDefLookup = (game, hash) => {
  const defs: Record<string, any> = {
    'D2:1': { name: 'Last Wish: Standard', icon: '/i/lw.png', modes: [4, 7], typeName: 'Raid' },
    'D2:2': { name: 'Last Wish: Master', icon: '/i/lwm.png', modes: [4, 7], typeName: 'Raid' },
    'D2:3': { name: 'Vault of Glass: Standard', icon: '/i/vog.png', modes: [4, 7], typeName: 'Raid' },
    'D2:4': { name: 'Pit of Heresy', icon: '/i/pit.png', modes: [82, 7], typeName: 'Dungeon' },
    'D2:5': { name: 'Lost Sector: Perdition', icon: '/i/ls.png', modes: [87, 7], typeName: 'Lost Sector' },
    'D2:6': { name: 'Duality: Master', modes: [82, 7], typeName: 'Dungeon' },
    'D2:7': { name: 'Leviathan, Spire of Stars: Normal', modes: [4, 7], typeName: 'Raid' },
    'D2:8': { name: 'Leviathan: Prestige', modes: [4, 7], typeName: 'Raid' },
    'D2:9': { name: "Crota's End: Normal", modes: [82, 7], typeName: 'Raid' },
    'D2:12': { name: 'Scourge of the Past', modes: [4, 7], typeName: 'Raid' },
    'D2:13': { name: 'The Pantheon: Atraks Sovereign', modes: [4, 7], typeName: 'Raid' },
    'D2:14': { name: 'The Desert Perpetual (Epic): Standard', modes: [4, 7], typeName: 'Raid' },
    'D2:15': { name: 'Ghosts of the Deep: Eternity', modes: [82, 7], typeName: 'Dungeon' },
    'D2:16': { name: 'Pantheon: Morgeth Surpassing: Customize', modes: [] },
    'D2:17': { name: 'Featured Encore: Consecrated Mind: The Pantheon', modes: [] },
    'D1:10': { name: 'Vault of Glass', icon: '/d1/vog.png', typeName: 'Raid' },
    'D1:11': { name: 'Skyshock', typeName: 'Rumble' },
  };
  return defs[`${game}:${hash}`];
};

const row = (o: Partial<OtdRow> & { instanceId: string; period: string }): OtdRow => ({
  activityHash: 1,
  completed: true,
  game: 'D2',
  ...o,
});

const player = { name: 'Splashbear#1078', membershipType: 2, membershipId: '4611686018465122437', game: 'D2' as const };
const TZ = 'America/New_York';

describe('discord-firsts-card', () => {
  it('reads raid and dungeon from Bungie modes and type names', () => {
    expect(firstsKindOf(lookup('D2', '1'), 'D2')).toBe('raids');
    expect(firstsKindOf(lookup('D2', '4'), 'D2')).toBe('dungeons');
    expect(firstsKindOf(lookup('D2', '5'), 'D2')).toBeNull();
    expect(firstsKindOf({ name: 'x', modes: [4] }, 'D2')).toBe('raids');
    expect(firstsKindOf({ name: 'x', modes: [82] }, 'D2')).toBe('dungeons');
    expect(firstsKindOf(lookup('D1', '10'), 'D1')).toBe('raids');
    expect(firstsKindOf(lookup('D1', '11'), 'D1')).toBeNull();
    expect(firstsKindOf(undefined, 'D2')).toBeNull();
  });

  it("follows the site's families: Leviathan raids stay separate, Pantheon and unlisted raids are left out", () => {
    const rows = [
      row({ instanceId: '1', period: '2018-01-01T20:00:00Z', activityHash: 7 }),
      row({ instanceId: '2', period: '2017-09-22T20:00:00Z', activityHash: 8 }),
      row({ instanceId: '3', period: '2019-03-10T20:00:00Z', activityHash: 12 }),
      row({ instanceId: '4', period: '2024-04-30T20:00:00Z', activityHash: 13 }),
      row({ instanceId: '5', period: '2025-08-23T20:00:00Z', activityHash: 14 }),
    ];
    expect(groupFirsts(rows, 'raids', 'D2', lookup).map((g) => g.baseName).sort()).toEqual([
      'Leviathan', 'Leviathan, Spire of Stars', 'The Desert Perpetual',
    ]);
  });

  it('counts a Raid-type activity filed under the dungeon mode as a raid', () => {
    const rows = [row({ instanceId: '9', period: '2023-09-08T20:00:00Z', activityHash: 9 })];
    expect(groupFirsts(rows, 'raids', 'D2', lookup).map((g) => g.baseName)).toEqual(["Crota's End"]);
    expect(groupFirsts(rows, 'dungeons', 'D2', lookup)).toEqual([]);
  });

  it('leaves Rite of the Nine runs out of the dungeon list', () => {
    const rows = [row({ instanceId: '15', period: '2025-05-06T20:00:00Z', activityHash: 15 })];
    expect(groupFirsts(rows, 'dungeons', 'D2', lookup)).toEqual([]);
  });

  it('merges difficulties into one family and counts only completed clears once per instance', () => {
    const rows = [
      row({ instanceId: '30', period: '2022-05-01T20:00:00Z', activityHash: 2 }),
      row({ instanceId: '10', period: '2020-03-01T20:00:00Z', activityHash: 1 }),
      row({ instanceId: '10', period: '2020-03-01T20:00:00Z', activityHash: 1 }), // same instance twice
      row({ instanceId: '20', period: '2020-04-01T20:00:00Z', activityHash: 1, completed: false }),
      row({ instanceId: '40', period: '2021-01-01T20:00:00Z', activityHash: 3 }),
      row({ instanceId: '50', period: '2021-02-01T20:00:00Z', activityHash: 5 }), // lost sector, not a raid
    ];
    const groups = groupFirsts(rows, 'raids', 'D2', lookup);
    expect(groups.map((g) => g.baseName).sort()).toEqual(['Last Wish', 'Vault of Glass']);
    const lw = groups.find((g) => g.baseName === 'Last Wish')!;
    expect(lw.clears).toBe(2);
    expect(lw.candidates.map((c) => c.instanceId)).toEqual(['10', '30']);
    expect(lw.icon).toBe('/i/lw.png');
  });

  it('counts an instance as cleared when any of the account characters completed it, whatever the row order', () => {
    const a = row({ instanceId: '10', period: '2020-03-01T20:00:00Z', activityHash: 1, completed: false });
    const b = row({ instanceId: '10', period: '2020-03-01T20:00:00Z', activityHash: 1, completed: true });
    for (const rows of [[a, b], [b, a]]) {
      const groups = groupFirsts(rows, 'raids', 'D2', lookup);
      expect(groups.length).toBe(1);
      expect(groups[0].clears).toBe(1);
    }
  });

  it('keeps D1 and D2 rows that share an instance id apart', () => {
    const rows = [
      row({ instanceId: '10', period: '2015-10-01T20:00:00Z', activityHash: 10, game: 'D1' }),
      row({ instanceId: '10', period: '2021-10-01T20:00:00Z', activityHash: 3, game: 'D2' }),
    ];
    expect(groupFirsts(rows, 'raids', 'D1', lookup).map((g) => g.clears)).toEqual([1]);
    expect(groupFirsts(rows, 'raids', 'D2', lookup).map((g) => g.clears)).toEqual([1]);
  });

  it('separates dungeons from raids', () => {
    const rows = [
      row({ instanceId: '1', period: '2022-01-01T20:00:00Z', activityHash: 4 }),
      row({ instanceId: '2', period: '2022-02-01T20:00:00Z', activityHash: 6 }),
      row({ instanceId: '3', period: '2022-03-01T20:00:00Z', activityHash: 1 }),
    ];
    expect(groupFirsts(rows, 'dungeons', 'D2', lookup).map((g) => g.baseName).sort()).toEqual(['Duality', 'Pit of Heresy']);
  });

  it('shows the verified first-clear date, newest first clear on top, with clears and a report link', () => {
    const rows = [
      row({ instanceId: '10', period: '2020-03-01T20:00:00Z', activityHash: 1 }),
      row({ instanceId: '30', period: '2022-05-01T20:00:00Z', activityHash: 2 }),
      row({ instanceId: '40', period: '2021-01-01T20:00:00Z', activityHash: 3 }),
    ];
    const card = buildFirstsCard({
      player,
      kind: 'raids',
      groups: groupFirsts(rows, 'raids', 'D2', lookup),
      verified: { '10': '2020-03-01T20:00:00Z', '40': '2021-01-01T20:00:00Z' },
      timeZone: TZ,
    });
    expect(card.embed.title).toBe('First clears: Splashbear#1078 · Raids');
    const lines = card.embed.description.split('\n');
    expect(lines[0]).toBe('Vault of Glass · Jan 1, 2021 · 1 clear [Report](https://www.bungie.net/en/PGCR/40)');
    expect(lines[1]).toBe('Last Wish · Mar 1, 2020 · 2 clears [Report](https://www.bungie.net/en/PGCR/10)');
    expect(card.embed.footer.text).toBe('2 raids · 3 clears');
  });

  it('omits the date when no clear could be verified, and puts that line last', () => {
    const rows = [
      row({ instanceId: '10', period: '2020-03-01T20:00:00Z', activityHash: 1 }),
      row({ instanceId: '40', period: '2021-01-01T20:00:00Z', activityHash: 3 }),
    ];
    const card = buildFirstsCard({
      player,
      kind: 'raids',
      groups: groupFirsts(rows, 'raids', 'D2', lookup),
      verified: { '40': '2021-01-01T20:00:00Z' },
      timeZone: TZ,
    });
    const lines = card.embed.description.split('\n');
    expect(lines[1]).toBe('Last Wish · 1 clear [Report](https://www.bungie.net/en/PGCR/10)');
    expect(card.model.firsts[1].period).toBeNull();
    expect(card.embed.description).not.toContain('2020');
  });

  it('uses the earliest clear Bungie confirmed, never an unconfirmed earlier one', () => {
    const rows = [
      row({ instanceId: '10', period: '2020-03-01T20:00:00Z', activityHash: 1 }),
      row({ instanceId: '11', period: '2020-03-08T20:00:00Z', activityHash: 1 }),
    ];
    const card = buildFirstsCard({
      player,
      kind: 'raids',
      groups: groupFirsts(rows, 'raids', 'D2', lookup),
      verified: { '11': '2020-03-08T20:00:00Z' },
      timeZone: TZ,
    });
    expect(card.embed.description).toContain('Mar 8, 2020');
    expect(card.embed.description).toContain('/PGCR/11');
  });

  it('labels D1 and links its reports to the D1 report page', () => {
    const rows = [row({ instanceId: '7', period: '2015-11-01T20:00:00Z', activityHash: 10, game: 'D1' })];
    const card = buildFirstsCard({
      player: { ...player, game: 'D1' },
      kind: 'raids',
      groups: groupFirsts(rows, 'raids', 'D1', lookup),
      verified: { '7': '2015-11-01T20:00:00Z' },
      timeZone: TZ,
    });
    expect(card.embed.description).toContain('Vault of Glass · D1 · Nov 1, 2015 · 1 clear [Report](https://pgcr.eververse.trade/destiny1/7)');
    expect(card.model.url).toContain('a=2-4611686018465122437-d1');
  });

  it('reads the date in the given zone', () => {
    // 2020-03-02T03:30Z is Mar 1, 22:30 in New York.
    expect(formatFirstDate('2020-03-02T03:30:00Z', TZ)).toBe('Mar 1, 2020');
    expect(formatFirstDate('2020-03-02T03:30:00Z', 'UTC')).toBe('Mar 2, 2020');
    expect(formatFirstDate('nope', TZ)).toBeNull();
  });

  it('caps lines with a "+N more" link and links the firsts tab', () => {
    const names = ['The Shattered Throne', 'Pit of Heresy', 'Prophecy', 'Grasp of Avarice', 'Duality', 'Spire of the Watcher', "Warlord's Ruin"];
    const lk: OtdDefLookup = (_g, h) => ({ name: `${names[Number(h)]}: Master`, modes: [82], typeName: 'Dungeon', icon: `/i/${h}.png` });
    const rows = names.map((_n, i) => row({ instanceId: String(i + 1), period: `2022-01-${String(i + 1).padStart(2, '0')}T20:00:00Z`, activityHash: i }));
    const card = buildFirstsCard({
      player,
      kind: 'dungeons',
      groups: groupFirsts(rows, 'dungeons', 'D2', lk),
      verified: {},
      timeZone: TZ,
      maxLines: 5,
    });
    expect(card.model.firsts.length).toBe(5);
    expect(card.model.hidden).toBe(2);
    expect(card.embed.description).toContain('[+2 more](https://destinychronicle.com/?a=2-4611686018465122437-d2&tab=firsts)');
    expect(card.embed.description.endsWith('[Open in Destiny Chronicle](https://destinychronicle.com/?a=2-4611686018465122437-d2&tab=firsts)')).toBe(true);
  });

  it('falls back to the Bungie mode icon, and never uses coverage or archive wording', () => {
    const rows = [row({ instanceId: '60', period: '2023-01-01T20:00:00Z', activityHash: 6 })];
    const card = buildFirstsCard({
      player,
      kind: 'dungeons',
      groups: groupFirsts(rows, 'dungeons', 'D2', lookup),
      verified: { '60': '2023-01-01T20:00:00Z' },
      timeZone: TZ,
      modeIconFor: (_g, m) => (m === 82 ? '/i/dungeon-mode.png' : null),
    });
    expect(card.model.firsts[0].icon).toBe('/i/dungeon-mode.png');
    const text = JSON.stringify(card.embed).toLowerCase();
    expect(text).not.toContain('coverage');
    expect(text).not.toContain('archive');
  });

  it('says so plainly when there are no clears', () => {
    const card = buildFirstsCard({ player, kind: 'dungeons', groups: [], verified: {}, timeZone: TZ });
    expect(card.embed.description).toContain('No dungeon clears on this account.');
    expect(card.embed.footer.text).toBe('0 dungeons · 0 clears');
  });

  it("pantheon kind shows the site's Pantheon Events sections in the site's order", () => {
    const rows = [
      row({ instanceId: '1', period: '2024-05-21T20:00:00Z', activityHash: 13 }),
      row({ instanceId: '2', period: '2026-06-15T20:00:00Z', activityHash: 16 }),
      row({ instanceId: '3', period: '2025-06-01T20:00:00Z', activityHash: 15 }),
      row({ instanceId: '4', period: '2026-06-20T20:00:00Z', activityHash: 17 }),
      row({ instanceId: '5', period: '2020-01-01T20:00:00Z', activityHash: 1 }),
    ];
    const groups = groupFirsts(rows, 'pantheon', 'D2', lookup);
    expect(groups.map((g) => g.baseName).sort()).toEqual([
      'Atraks Sovereign',
      'Ghosts of the Deep: Eternity',
      'Morgeth Surpassing: Customize',
    ]);
    const verified = { '1': rows[0].period, '2': rows[1].period, '3': rows[2].period };
    const card = buildFirstsCard({ player, kind: 'pantheon', groups, verified, timeZone: TZ });
    const d = card.embed.description.split('\n');
    expect(d.slice(0, 6).map((l) => l.replace(/ · .*/, ''))).toEqual([
      '**The Pantheon**',
      'Atraks Sovereign',
      '**Monument of Triumph Pantheon**',
      'Morgeth Surpassing: Customize',
      '**Rite of the Nine**',
      'Ghosts of the Deep: Eternity',
    ]);
    expect(card.embed.title).toBe('First clears: Splashbear#1078 · Pantheon Events');
    expect(card.model.lines.map((l) => l.kind)).toEqual(['header', 'first', 'header', 'first', 'header', 'first']);
    expect(card.embed.footer.text).toBe('3 activities · 3 clears');
    // Raids and dungeons cards never list Pantheon Events.
    expect(groupFirsts(rows, 'raids', 'D2', lookup).map((g) => g.baseName)).toEqual(['Last Wish']);
    expect(groupFirsts(rows, 'dungeons', 'D2', lookup)).toEqual([]);
  });

  it("counts clears from Bungie's report verdicts when given, dated by the report", () => {
    const rows = [
      row({ instanceId: '1', period: '2018-11-10T20:00:00Z', completed: true }),
      row({ instanceId: '2', period: '2018-11-12T20:00:00Z', completed: false }),
      row({ instanceId: '2', period: '2018-11-12T20:00:00Z', completed: false }),
      row({ instanceId: '3', period: '2018-11-20T20:00:00Z', completed: true }),
      row({ instanceId: '4', period: '2018-11-25T20:00:00Z', completed: true }),
    ];
    expect(firstsInstances(rows, 'raids', 'D2', lookup).sort()).toEqual(['1', '2', '3', '4']);
    const reports = {
      '1': { cleared: false, period: '2018-11-10T20:00:00Z' }, // e.g. completed = 1 but completionReason "Failed"
      '2': { cleared: true, period: '2018-11-12T20:05:00Z' }, // an alt character finished it
      '3': { cleared: true, period: '2018-11-20T20:00:00Z' },
      // '4' unreadable: falls back to the history flag
    };
    const [g] = groupFirsts(rows, 'raids', 'D2', lookup, reports);
    expect(g.clears).toBe(3);
    expect(g.candidates[0]).toEqual({ instanceId: '2', period: '2018-11-12T20:05:00Z', activityHash: '1' });
  });
});
