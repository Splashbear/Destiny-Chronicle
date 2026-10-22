/** Human-friendly elapsed label via Intl.RelativeTimeFormat (CODE_CLEANUP_SPEC). */
export function formatRelativeElapsedSince(
  iso: string | undefined,
  locale: string,
  nowMs: number = Date.now()
): string {
  if (!iso) return '—';
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    const diffMs = nowMs - date.getTime();
    if (diffMs < 0) return '—';
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return rtf.format(0, 'minute');
    if (minutes < 60) return rtf.format(-minutes, 'minute');
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return rtf.format(-hours, 'hour');
    const days = Math.floor(hours / 24);
    if (days < 14) return rtf.format(-days, 'day');
    const weeks = Math.floor(days / 7);
    if (weeks < 8) return rtf.format(-weeks, 'week');
    const months = Math.floor(days / 30);
    if (months < 24) return rtf.format(-months, 'month');
    const years = Math.floor(days / 365);
    return rtf.format(-Math.max(1, years), 'year');
  } catch {
    return '—';
  }
}
