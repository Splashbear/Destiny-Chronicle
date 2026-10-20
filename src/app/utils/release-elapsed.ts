/** Calendar elapsed from an activity's release day to the first clear. */

export function parseReleaseDay(releaseDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(releaseDate || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

function completionDayUtc(completionIso: string): Date | null {
  const t = Date.parse(completionIso);
  if (!Number.isFinite(t)) return null;
  const c = new Date(t);
  return new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()));
}

function unit(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Spreadsheet-style elapsed: "Day One", "4 days", "1 month, 13 days",
 * "7 years, 10 months, 3 days". Uses UTC calendar days so time of day does not shift the count.
 */
export function formatReleaseElapsed(releaseDate: string, completionIso: string): string | null {
  const start = parseReleaseDay(releaseDate);
  const end = completionDayUtc(completionIso);
  if (!start || !end || end.getTime() < start.getTime()) return null;

  let years = end.getUTCFullYear() - start.getUTCFullYear();
  let months = end.getUTCMonth() - start.getUTCMonth();
  let days = end.getUTCDate() - start.getUTCDate();
  if (days < 0) {
    months -= 1;
    const prev = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0));
    days += prev.getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years === 0 && months === 0 && days === 0) return 'Day One';

  const parts: string[] = [];
  if (years > 0) parts.push(unit(years, 'year', 'years'));
  if (months > 0) parts.push(unit(months, 'month', 'months'));
  if (days > 0 || parts.length === 0) parts.push(unit(days, 'day', 'days'));
  return parts.join(', ');
}
