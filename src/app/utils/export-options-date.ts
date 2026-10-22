/**
 * Normalize export dialog `from` date strings to ISO (CODE_CLEANUP_SPEC).
 * Accepts legacy MM-DD and YYYY-MM-DD.
 */
export function normalizeExportFromDate(from: unknown): string | unknown {
  if (typeof from !== 'string') {
    return from;
  }
  const dateParts = from.split('-').map(Number);
  if (dateParts.length === 2) {
    const [month, day] = dateParts;
    const year = new Date().getFullYear();
    return new Date(Date.UTC(year, month - 1, day)).toISOString();
  }
  if (dateParts.length === 3) {
    const [year, month, day] = dateParts;
    return new Date(Date.UTC(year, month - 1, day)).toISOString();
  }
  return from;
}
