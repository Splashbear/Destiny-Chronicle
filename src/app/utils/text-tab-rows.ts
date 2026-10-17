import { windowRows } from './text-view-rows';

/** Text view must not walk activity rows while a date load or multi-account sync is still running. */
export function textViewShouldBuild(loadingDate: boolean, profileLoad: boolean): boolean {
  return !loadingDate && !profileLoad;
}

export interface TextSection<T> {
  title: string;
  rows: T[];
}

/** Keep section titles, but only materialize the open page of rows. */
export function pageSections<T>(
  sections: TextSection<T>[],
  pageSize: number,
  pages: number
): { sections: TextSection<T>[]; total: number; shown: number } {
  const flat: Array<{ title: string; row: T }> = [];
  for (const section of sections) {
    for (const row of section.rows) {
      flat.push({ title: section.title, row });
    }
  }
  const visible = windowRows(flat, pageSize, pages);
  const out: TextSection<T>[] = [];
  for (const item of visible) {
    const last = out[out.length - 1];
    if (!last || last.title !== item.title) {
      out.push({ title: item.title, rows: [item.row] });
    } else {
      last.rows.push(item.row);
    }
  }
  return { sections: out, total: flat.length, shown: visible.length };
}

export function yearsAgoLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) {
    return '';
  }
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) {
    return '';
  }
  let years = now.getFullYear() - then.getFullYear();
  const monthDay = (now.getMonth() - then.getMonth()) || (now.getDate() - then.getDate());
  if (monthDay < 0) {
    years -= 1;
  }
  if (years <= 0) {
    return 'this year';
  }
  return years === 1 ? '1 yr' : `${years} yrs`;
}

export function firstTags(flags: {
  isSolo?: boolean;
  isFlawless?: boolean;
  isSoloFlawless?: boolean;
} | null | undefined): string {
  if (!flags) {
    return '-';
  }
  const tags: string[] = [];
  if (flags.isSolo || flags.isSoloFlawless) {
    tags.push('[solo]');
  }
  if (flags.isFlawless || flags.isSoloFlawless) {
    tags.push('[flawless]');
  }
  return tags.length ? tags.join(' ') : '-';
}

export interface ClearVariant {
  version: string;
  hasClear: boolean;
  when?: string;
  tags?: string;
}

/** Completed clears only. Empty "no clears" placeholders are omitted. */
export function completedClearRows(
  items: Array<{ baseName: string; variants: ClearVariant[] }>
): Array<{ name: string; when: string; tags: string }> {
  const rows: Array<{ name: string; when: string; tags: string }> = [];
  for (const item of items) {
    for (const variant of item.variants) {
      if (!variant.hasClear || !variant.when) {
        continue;
      }
      const version = variant.version && variant.version !== 'Normal' ? `: ${variant.version}` : '';
      rows.push({
        name: `${item.baseName}${version}`,
        when: variant.when.slice(0, 10),
        tags: variant.tags || '-',
      });
    }
  }
  return rows;
}

export function splitTitles<T extends { completed: boolean }>(titles: T[]): { owned: T[]; missing: T[] } {
  return {
    owned: titles.filter(title => title.completed),
    missing: titles.filter(title => !title.completed),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function heatGlyph(ratio: number): string {
  if (!(ratio > 0)) {
    return '░';
  }
  if (ratio < 0.34) {
    return '▒';
  }
  if (ratio < 0.67) {
    return '▓';
  }
  return '█';
}

export interface TextHeatDay {
  year: number;
  month: number;
  day: number;
  glyph: string;
}

export interface TextHeatMonth {
  label: string;
  days: TextHeatDay[];
}

/** One character per calendar day, using the same seconds the color heatmap stored. */
export function textYearCalendar(
  year: number,
  secondsForDay: (year: number, month: number, day: number) => number
): TextHeatMonth[] {
  let max = 0;
  const counts: number[][] = [];
  for (let month = 0; month < 12; month++) {
    const dim = new Date(year, month + 1, 0).getDate();
    const days: number[] = [];
    for (let day = 1; day <= dim; day++) {
      const seconds = secondsForDay(year, month + 1, day);
      days.push(seconds);
      if (seconds > max) {
        max = seconds;
      }
    }
    counts.push(days);
  }
  return counts.map((days, month) => ({
    label: MONTHS[month],
    days: days.map((seconds, index) => ({
      year,
      month: month + 1,
      day: index + 1,
      glyph: heatGlyph(max > 0 ? seconds / max : 0),
    })),
  }));
}

/** Blank, "private", or missing names stay unlabeled. */
export function playedWithDisplayName(name: string | null | undefined): string {
  const trimmed = (name || '').trim();
  if (!trimmed || /private/i.test(trimmed)) {
    return 'Private Guardian';
  }
  return trimmed;
}
