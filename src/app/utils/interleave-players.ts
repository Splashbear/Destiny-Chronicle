/**
 * Interleave two player lists (D1 then D2 per index) so both games start
 * loading instead of one game waiting for the other to finish.
 */
export function interleavePlayersForConcurrency<T>(d1Players: T[], d2Players: T[]): T[] {
  const result: T[] = [];
  const maxLength = Math.max(d1Players.length, d2Players.length);

  for (let i = 0; i < maxLength; i++) {
    if (i < d1Players.length) {
      result.push(d1Players[i]);
    }
    if (i < d2Players.length) {
      result.push(d2Players[i]);
    }
  }

  return result;
}
