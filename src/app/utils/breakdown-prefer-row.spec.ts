import { preferBreakdownActivityRow } from './breakdown-prefer-row';

function row(completed: unknown, duration: number, characterId: string) {
  return {
    characterId,
    values: {
      completed: { basic: { value: completed } },
      timePlayedSeconds: { basic: { value: duration } },
    },
  };
}

describe('preferBreakdownActivityRow', () => {
  it('prefers a clear over a non-clear even when shorter', () => {
    const ghost = row(0, 3, 'char-ghost');
    const clear = row(1, 3408, 'char-real');
    expect(preferBreakdownActivityRow(ghost, clear)).toBe(clear);
    expect(preferBreakdownActivityRow(clear, ghost)).toBe(clear);
  });

  it('treats boolean true as a clear (archive light rows)', () => {
    const archiveClear = row(true, 6140, 'char-a');
    const ghost = row(0, 208, 'char-b');
    expect(preferBreakdownActivityRow(ghost, archiveClear)).toBe(archiveClear);
  });

  it('when neither/both clear, keeps the longer duration', () => {
    const short = row(0, 313, 'a');
    const long = row(0, 3408, 'b');
    expect(preferBreakdownActivityRow(short, long)).toBe(long);
  });
});
