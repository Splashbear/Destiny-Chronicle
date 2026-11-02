/**
 * Helpers for Chronicle.xlsx (ARCHIVE_SPREADSHEET_SPEC).
 * Local calendar formatting so the sheet matches On This Day / the site.
 */

/** PGCR URL keyed by game + instance id (D1 → Eververse; D2 → Bungie). */
export function chroniclePgcrUrl(
  instanceId: string | number | undefined | null,
  game: string
): string {
  if (instanceId == null || instanceId === '') return '';
  const id = String(instanceId);
  if (game === 'D1') return `https://pgcr.eververse.trade/destiny1/${id}`;
  return `https://www.bungie.net/en/PGCR/${id}`;
}

/** Local calendar date `yyyy-mm-dd` from an ISO/UTC period. */
export function localDateYmd(period: string | undefined | null): string {
  if (!period) return '';
  const d = new Date(period);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local time `h:mm AM/PM`. */
export function localTimeAmpm(period: string | undefined | null): string {
  if (!period) return '';
  const d = new Date(period);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Excel day-fraction for duration cells (`[h]:mm`). */
export function durationExcelSerial(seconds: number | undefined | null): number | '' {
  if (seconds == null || !Number.isFinite(Number(seconds)) || Number(seconds) < 0) return '';
  return Number(seconds) / 86400;
}

/** Force ID-like values to text so Excel never shows 1.56E+09. */
export function idAsText(value: string | number | undefined | null): string {
  if (value == null || value === '') return '';
  return String(value);
}

export function completedMark(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  return n === 1 ? '✓' : '–';
}
