/** Normalize archive/Bungie completed flags to 0 | 1 for storage. */
export function normalizeCompletedFlag(raw: unknown): 0 | 1 {
  if (raw === true || raw === 1 || raw === '1') return 1;
  return 0;
}

/** True when PGCR completed flag is 1/true (CODE_CLEANUP_SPEC). */
export function isActivityCompleted(activity: any): boolean {
  const c = activity?.values?.completed;
  if (c === true || c === 1 || c === '1') return true;
  if (c && typeof c === 'object') {
    const v = (c as { basic?: { value?: unknown }; value?: unknown }).basic?.value
      ?? (c as { value?: unknown }).value;
    return v === true || v === 1 || v === '1';
  }
  return false;
}
