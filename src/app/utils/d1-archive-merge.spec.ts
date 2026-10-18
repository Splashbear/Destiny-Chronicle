import { d1BungiePageCaughtUp, d1RowsToIngest, mergeD1ArchiveAndLive, partitionD1AgainstStored } from './d1-archive-merge';

function row(game: string, instanceId: string, period: string, seconds = 0, id?: number, membershipType?: number, kills = 0) {
  return {
    id,
    game,
    membershipId: '4611686018452484164',
    characterId: 'char-1',
    period,
    membershipType,
    activityDetails: { instanceId },
    values: {
      timePlayedSeconds: { basic: { value: seconds } },
      kills: { basic: { value: kills } }
    }
  };
}

describe('D1 archive merge', () => {
  it('keeps a D1 row and a D2 row that share an instance id', () => {
    const merged = mergeD1ArchiveAndLive(
      [row('D1', '42', '2014-09-10T00:00:00Z', 600)],
      [row('D2', '42', '2017-09-12T00:00:00Z', 900)]
    );
    expect(merged.map(r => r.game).sort()).toEqual(['D1', 'D2']);
    expect(merged).toHaveSize(2);
  });

  it('replaces an empty-period archive row with the live row and keeps one key', () => {
    const merged = mergeD1ArchiveAndLive(
      [row('D1', '100', '', 0, 7, 0)],
      [row('D1', '100', '2014-12-01T00:00:00Z', 3600, undefined, 2)]
    );
    expect(merged).toHaveSize(1);
    expect(merged[0].period).toBe('2014-12-01T00:00:00Z');
    expect(merged[0].id).toBe(7);
    expect(merged[0].membershipType).toBe(2);
  });

  it('keeps a membershipType 0 archive row that live has not covered', () => {
    const merged = mergeD1ArchiveAndLive(
      [row('D1', '5', '', 0, undefined, 0)],
      [row('D1', '9', '2014-11-01T00:00:00Z', 120, undefined, 2)]
    );
    const placeholder = merged.find(r => r.activityDetails?.instanceId === '5');
    expect(placeholder?.membershipType).toBe(0);
    expect(placeholder?.period).toBe('');
    expect(merged).toHaveSize(2);
  });

  it('does not replace a stored D2 row when the incoming row is D1', () => {
    const stored = [row('D2', '42', '2017-09-12T00:00:00Z', 900, 3)];
    const incoming = [row('D1', '42', '2014-09-10T00:00:00Z', 600)];
    const { fresh, replacements } = partitionD1AgainstStored(incoming, stored);
    expect(fresh).toHaveSize(1);
    expect(fresh[0].game).toBe('D1');
    expect(replacements).toHaveSize(0);
  });

  it('replaces a stored empty-period D1 row and leaves a real D1 row alone', () => {
    const stored = [
      row('D1', '1', '', 0, 11, 0),
      row('D1', '2', '2014-10-01T00:00:00Z', 100, 12, 2)
    ];
    const incoming = [
      row('D1', '1', '2014-10-02T00:00:00Z', 50, undefined, 2),
      row('D1', '2', '2014-10-03T00:00:00Z', 999, undefined, 2)
    ];
    const { fresh, replacements } = partitionD1AgainstStored(incoming, stored);
    expect(fresh).toHaveSize(0);
    expect(replacements).toHaveSize(1);
    expect(replacements[0].id).toBe(11);
    expect(replacements[0].period).toBe('2014-10-02T00:00:00Z');
  });

  it('replaces a dated archive stub with live kills and duration', () => {
    const stub = row('D1', '77', '2016-03-01T00:00:00Z', 0, 9);
    const live = row('D1', '77', '2016-03-01T00:00:00Z', 480, undefined, undefined, 15);
    const { fresh, replacements } = partitionD1AgainstStored([live], [stub]);
    expect(fresh).toHaveSize(0);
    expect(replacements).toHaveSize(1);
    expect(replacements[0].id).toBe(9);
    expect(replacements[0].values?.kills?.basic?.value).toBe(15);
    expect(replacements[0].values?.timePlayedSeconds?.basic?.value).toBe(480);
  });

  it('keeps paging when a Bungie page is only archive stubs, and stops when the page already has stats', () => {
    const stub = row('D1', '1', '2016-01-01T00:00:00Z', 0, 1);
    const rich = row('D1', '2', '2020-01-01T00:00:00Z', 600, 2);
    const liveStub = row('D1', '1', '2016-01-01T00:00:00Z', 300);
    const liveHole = row('D1', '3', '2015-12-01T00:00:00Z', 100);
    expect(d1BungiePageCaughtUp([liveStub], [stub])).toBe(false);
    expect(d1RowsToIngest([liveStub, liveHole], [stub]).map(r => r.activityDetails?.instanceId)).toEqual(['1', '3']);
    expect(d1BungiePageCaughtUp([rich], [rich])).toBe(true);
    expect(d1RowsToIngest([rich], [rich])).toEqual([]);
  });
});
