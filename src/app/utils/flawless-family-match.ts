/** Match a Firsts card label to a scanned flawless family base name. */
export function flawlessFamilyMatches(cardLabel: string, flawlessBaseName: string): boolean {
  const a = String(cardLabel || '').trim().toLowerCase();
  const b = String(flawlessBaseName || '').trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  // "The Pantheon" ↔ "Pantheon", or versioned family vs card base.
  if (a.includes(b) || b.includes(a)) return true;
  const stripThe = (s: string) => (s.startsWith('the ') ? s.slice(4) : s);
  return stripThe(a) === stripThe(b);
}

export function anyFlawlessFamilyMatches(cardLabel: string, flawlessBaseNames: string[]): boolean {
  return flawlessBaseNames.some(name => flawlessFamilyMatches(cardLabel, name));
}
