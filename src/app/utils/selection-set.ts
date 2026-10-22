/** Toggle membership in a Set; returns a new Set for change detection. */
export function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

/** All players when keys empty; otherwise only those whose account key is selected. */
export function filterBySelectedAccountKeys<T>(
  players: T[],
  selectedKeys: Set<string>,
  getAccountKey: (player: T) => string
): T[] {
  if (!players?.length) return [];
  if (selectedKeys.size === 0) return players;
  return players.filter((p) => selectedKeys.has(getAccountKey(p)));
}
