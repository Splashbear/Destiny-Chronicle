import { partitionAgainstStored, shouldReplaceStub, storedActivitySeconds } from './archive-stub-merge';

const row = (iid: string, secs: number, id?: number) => ({
  id,
  activityDetails: { instanceId: iid },
  values: { timePlayedSeconds: { basic: { value: secs } } }
});

describe('archive-stub-merge', () => {
  it('reads seconds defensively', () => {
    expect(storedActivitySeconds(undefined)).toBe(0);
    expect(storedActivitySeconds({})).toBe(0);
    expect(storedActivitySeconds(row('1', 42))).toBe(42);
  });

  it('replaces only zero-time stubs with timed rows', () => {
    expect(shouldReplaceStub(row('1', 0), row('1', 600))).toBeTrue();
    expect(shouldReplaceStub(row('1', 300), row('1', 600))).toBeFalse();
    expect(shouldReplaceStub(row('1', 0), row('1', 0))).toBeFalse();
  });

  it('splits Bungie rows into fresh and stub replacements keeping the stored id', () => {
    const stored = [row('100', 0, 7), row('200', 900, 8)];
    const incoming = [row('100', 1200), row('200', 900), row('300', 60)];
    const { fresh, replacements } = partitionAgainstStored(incoming, stored);
    expect(fresh.map(r => r.activityDetails.instanceId)).toEqual(['300']);
    expect(replacements.length).toBe(1);
    expect(replacements[0].id).toBe(7);
    expect(storedActivitySeconds(replacements[0])).toBe(1200);
  });

  it('matches numeric and string instance ids', () => {
    const stored = [{ id: 1, activityDetails: { instanceId: 6904117268 as any }, values: {} }];
    const { fresh, replacements } = partitionAgainstStored([row('6904117268', 30)], stored);
    expect(fresh.length).toBe(0);
    expect(replacements[0].id).toBe(1);
  });
});
