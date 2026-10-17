import {
  excludeExistingInstances,
  firstOfEachStored,
  instanceIdOf,
  StoredDedupeRow,
} from './activity-dedupe';

function row(instanceId: string, extra: Partial<StoredDedupeRow> = {}): StoredDedupeRow {
  return {
    game: 'D2',
    membershipId: '4611686018465122437',
    characterId: '2305843009264000000',
    activityDetails: { instanceId },
    ...extra,
  };
}

/** The archive-load check this replaces: any existing row with the same instance id. */
function legacyExclude(existing: StoredDedupeRow[], incoming: StoredDedupeRow[]): StoredDedupeRow[] {
  return incoming.filter(activity =>
    !existing.some(known => instanceIdOf(known) === instanceIdOf(activity))
  );
}

/** The database check this replaces: first row with the same membership, character, and instance. */
function legacyFirst(rows: StoredDedupeRow[]): StoredDedupeRow[] {
  return rows.filter((activity, index, self) =>
    index === self.findIndex(known =>
      known.membershipId === activity.membershipId &&
      known.characterId === activity.characterId &&
      instanceIdOf(known) === instanceIdOf(activity)
    )
  );
}

describe('activity dedupe', () => {
  it('drops the same archive rows as the old scan', () => {
    const existing: StoredDedupeRow[] = [];
    const incoming: StoredDedupeRow[] = [];
    for (let i = 0; i < 400; i++) {
      existing.push(row(String(1000 + i)));
      incoming.push(row(String(1000 + (i % 250))));
      incoming.push(row(String(5000 + i), { game: 'D1', characterId: 'd1-character' }));
    }
    const oldRows = legacyExclude(existing, incoming);
    const newRows = excludeExistingInstances(existing, incoming);
    expect(newRows.map(instanceIdOf)).toEqual(oldRows.map(instanceIdOf));
    expect(newRows.length).toBe(oldRows.length);
  });

  it('keeps the same database rows as the old findIndex check within one game', () => {
    const rows: StoredDedupeRow[] = [];
    for (let i = 0; i < 300; i++) {
      rows.push(row(String(i)));
      rows.push(row(String(i), { characterId: 'other-character' }));
      rows.push(row(String(i)));
    }
    const oldRows = legacyFirst(rows);
    const newRows = firstOfEachStored(rows);
    expect(newRows.map(stored => `${stored.characterId}|${instanceIdOf(stored)}`)).toEqual(
      oldRows.map(stored => `${stored.characterId}|${instanceIdOf(stored)}`)
    );
  });

  it('keeps a D1 row and a D2 row that share an instance id', () => {
    const rows = [
      row('42', { game: 'D1' }),
      row('42', { game: 'D2' }),
    ];
    expect(legacyFirst(rows).length).toBe(1);
    expect(firstOfEachStored(rows).map(stored => stored.game)).toEqual(['D1', 'D2']);
  });
});