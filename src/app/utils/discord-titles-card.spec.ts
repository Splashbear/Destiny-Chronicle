import {
  buildTitleItems,
  buildTitlesCard,
  TitleNodeInput,
  TitleRecordInput,
  TITLES_CARD_GROUP_ORDER,
} from './discord-titles-card';

const node = (o: Partial<TitleNodeInput> & { hash: number; completionRecordHash: number }): TitleNodeInput => ({
  name: 'Seal',
  icon: `/i/${o.completionRecordHash}.png`,
  parentNodeHashes: [616318467],
  ...o,
});

const nodes: TitleNodeInput[] = [
  node({ hash: 1, completionRecordHash: 101, name: 'Last Wish', recordTitle: 'Rivensbane' }),
  node({ hash: 2, completionRecordHash: 102, name: 'Vault of Glass', recordTitle: 'Fatebreaker' }),
  node({ hash: 3, completionRecordHash: 103, name: 'Duality', recordTitle: 'Discerptor' }),
  node({ hash: 4, completionRecordHash: 104, name: 'Haunted', recordTitle: 'Reaper', parentNodeHashes: [1881970629] }),
  node({ hash: 5, completionRecordHash: 105, name: 'Gambit', recordTitle: 'Dredgen', gildingHash: 905, iconFrames: ['/i/a.png', '/i/dredgen-gilded.png'] }),
  node({ hash: 6, completionRecordHash: 106, name: 'Crucible', recordTitle: 'Glorious', gildingHash: 906 }),
  node({ hash: 7, completionRecordHash: 107, name: 'Reveler', recordTitle: 'Reveler' }),
  // Same name as the current one: the site's SPECIAL_TITLES override tells them apart by node hash.
  node({ hash: 3212358005, completionRecordHash: 108, name: 'Conqueror', recordTitle: 'Conqueror', parentNodeHashes: [1881970629] }),
];

const records: Record<string, TitleRecordInput> = {
  101: { state: 1 },
  102: { state: 4 }, // not redeemed
  103: { state: 65 }, // redeemed bit set
  104: { state: 1 },
  105: { state: 1 },
  905: { state: 0, completedCount: 3 },
  106: { state: 1 },
  906: { state: 0, completedCount: 0 },
};

const player = { name: 'Splashbear#1078', membershipType: 2, membershipId: '4611686018465122437' };

describe('discord-titles-card', () => {
  it('earned uses the site rule: redeemed bit of the record state', () => {
    const items = buildTitleItems(nodes, records);
    const done = (h: number) => items.find((i) => i.hash === h)!.completed;
    expect(done(101)).toBe(true);
    expect(done(102)).toBe(false);
    expect(done(103)).toBe(true);
    expect(done(107)).toBe(false); // no record at all counts as missing
  });

  it('falls back to character records when the profile has none', () => {
    const items = buildTitleItems(nodes, {}, [{ 107: { state: 1 } }]);
    expect(items.find((i) => i.hash === 107)!.completed).toBe(true);
  });

  it('counts gilding only for earned titles, from the tracking record, and uses the Bungie gilded frame', () => {
    const items = buildTitleItems(nodes, records);
    const dredgen = items.find((i) => i.hash === 105)!;
    expect(dredgen.isGilded).toBe(true);
    expect(dredgen.timesGilded).toBe(3);
    expect(dredgen.icon).toBe('/i/dredgen-gilded.png');
    const glorious = items.find((i) => i.hash === 106)!;
    expect(glorious.isGilded).toBe(false);
    expect(glorious.icon).toBe('/i/106.png');
  });

  it('names come from the site overrides, then the record title, then the node', () => {
    const items = buildTitleItems(nodes, records);
    expect(items.find((i) => i.hash === 101)!.name).toBe('Rivensbane');
    expect(items.find((i) => i.hash === 108)!.name).toBe('Conqueror (Season of Arrivals)');
    expect(items.find((i) => i.hash === 108)!.legacy).toBe(true);
  });

  it('puts Raid and Dungeon groups first, then the site order', () => {
    expect(TITLES_CARD_GROUP_ORDER.slice(0, 2)).toEqual(['Raid', 'Dungeon']);
    const card = buildTitlesCard({ player, items: buildTitleItems(nodes, records) });
    expect(card.model.groups.map((g) => g.category)).toEqual([
      'Raid',
      'Dungeon',
      'Seasonal/Episodal',
      'Special Events',
      'Competitive',
    ]);
    expect(card.model.groups[0].category).toBe('Raid');
    expect(card.model.groups[1].category).toBe('Dungeon');
  });

  it('header, footer and totals use the same earned/total numbers', () => {
    const card = buildTitlesCard({ player, items: buildTitleItems(nodes, records) });
    // earned: 101, 103, 104, 105, 106 = 5 of 8
    expect(card.embed.title).toBe('Titles: Splashbear#1078 (5/8)');
    expect(card.model.earned).toBe(5);
    expect(card.model.total).toBe(8);
    expect(card.model.missing).toBe(2); // the unearned legacy Conqueror can no longer be earned
    expect(card.model.gilded).toBe(1);
    expect(card.embed.footer.text).toBe('5 of 8 titles · 1 gilded');
  });

  it('shows gilded counts, a Missing list, no dates, and the seals deep link', () => {
    const card = buildTitlesCard({ player, items: buildTitleItems(nodes, records) });
    const d = card.embed.description;
    expect(d).toContain('**Competitive** 2/3 · 1 gilded');
    expect(d).toContain('**Dredgen** ×3');
    expect(d).toContain('**Missing (2)**');
    expect(d).not.toContain('Conqueror (Season of Arrivals)');
    expect(d).toContain('Raid: Fatebreaker');
    expect(d).not.toMatch(/\b(19|20)\d{2}\b/);
    expect(d).toContain(
      '[Open in Destiny Chronicle](https://destinychronicle.com/?a=2-4611686018465122437-d2&tab=seals)'
    );
  });

  it('never uses coverage or archive wording', () => {
    const card = buildTitlesCard({ player, items: buildTitleItems(nodes, records) });
    const text = JSON.stringify(card.embed).toLowerCase();
    expect(text).not.toContain('coverage');
    expect(text).not.toContain('archive');
  });

  it('uses the group seal icon of the newest earned title and keeps lines in sync', () => {
    const card = buildTitlesCard({ player, items: buildTitleItems(nodes, records) });
    const raid = card.model.groups.find((g) => g.category === 'Raid')!;
    expect(raid.icon).toBe('/i/101.png');
    const described = card.embed.description.split('\n').filter((l) => l && !l.startsWith('[Open'));
    expect(described.length).toBe(card.model.lines.length);
  });

  it('adds emoji only when the caller supplies it', () => {
    const items = buildTitleItems(nodes, records);
    const plain = buildTitlesCard({ player, items });
    expect(plain.embed.description).not.toContain('<:');
    const withEmoji = buildTitlesCard({ player, items, emojiFor: (p) => `<:s${p.length}:1>` });
    expect(withEmoji.embed.description).toContain('<:s');
  });

  it('stays inside the embed limit by trimming names with a "+N more", never silently', () => {
    const many: TitleNodeInput[] = Array.from({ length: 200 }, (_, i) =>
      node({ hash: 1000 + i, completionRecordHash: 2000 + i, recordTitle: `Longer Title Number ${i}` })
    );
    const card = buildTitlesCard({ player, items: buildTitleItems(many, {}), maxChars: 900 });
    expect(card.embed.description.length).toBeLessThanOrEqual(900);
    expect(card.embed.description).toMatch(/\+\d+ more/);
    expect(card.model.total).toBe(200);
  });

  it('handles a player with no titles', () => {
    const card = buildTitlesCard({ player, items: buildTitleItems(nodes, {}) });
    expect(card.model.earned).toBe(0);
    expect(card.embed.title).toBe('Titles: Splashbear#1078 (0/8)');
    expect(card.embed.description).toContain('**Missing (6)**'); // 8 titles, 2 of them legacy
  });
});
