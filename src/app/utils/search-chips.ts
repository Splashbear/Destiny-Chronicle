/** Multi-username search chip list helpers (CODE_CLEANUP_SPEC). */

export function addSearchChip(
  chips: string[],
  rawValue: string
): { chips: string[]; value: string } | null {
  const value = (rawValue || '').trim();
  if (!value) return null;
  const exists = chips.some((c) => c.toLowerCase() === value.toLowerCase());
  if (exists) {
    return { chips, value: '' };
  }
  return { chips: [...chips, value], value: '' };
}

export function removeSearchChip(chips: string[], index: number): string[] {
  if (index < 0 || index >= chips.length) return chips;
  const next = [...chips];
  next.splice(index, 1);
  return next;
}
