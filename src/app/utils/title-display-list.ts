import { compareTitlesByCategory } from '../config/title-categories';

export type TitleFilter = 'all' | 'legacy' | 'current' | string;
export type TitleSort = 'alpha' | 'gilded' | 'category' | 'release' | string;

function sortTitlesList(list: any[], titleSort: TitleSort): any[] {
  const sortAlpha = (a: any, b: any) => a.name.localeCompare(b.name);
  const sortRelease = (a: any, b: any) => (b.releaseRank ?? 0) - (a.releaseRank ?? 0);
  const sortGilded = (a: any, b: any) => {
    if (!!a.isGilded !== !!b.isGilded) {
      return a.isGilded ? -1 : 1;
    }
    return (b.releaseRank ?? 0) - (a.releaseRank ?? 0);
  };
  const sortFn =
    titleSort === 'alpha'
      ? sortAlpha
      : titleSort === 'gilded'
        ? sortGilded
        : titleSort === 'category'
          ? compareTitlesByCategory
          : sortRelease;
  return [...list].sort(sortFn);
}

function applyLegacyFilter(list: any[], titleFilter: TitleFilter): any[] {
  if (titleFilter === 'all') return list;
  const wantLegacy = titleFilter === 'legacy';
  return list.filter((t: any) => t.legacy === wantLegacy);
}

/**
 * Titles ready for display (CODE_CLEANUP_SPEC).
 * Legacy/current filter: single sorted list.
 * All-view: unlocked first, locked last.
 */
export function buildDisplayTitles(
  aggregatedTitles: any[],
  titleFilter: TitleFilter,
  titleSort: TitleSort
): any[] {
  let list = aggregatedTitles;
  if (titleFilter !== 'all') {
    list = applyLegacyFilter(list, titleFilter);
    return sortTitlesList(list, titleSort);
  }
  const unlocked = sortTitlesList(
    list.filter((t: any) => !t.locked),
    titleSort
  );
  const locked = sortTitlesList(
    list.filter((t: any) => t.locked),
    titleSort
  );
  return [...unlocked, ...locked];
}

/** Titles filtered by locked flag (Titles tab sections). */
export function buildTitlesByLock(
  aggregatedTitles: any[],
  locked: boolean,
  titleFilter: TitleFilter,
  titleSort: TitleSort
): any[] {
  let list = aggregatedTitles.filter((t: any) => t.locked === locked);
  list = applyLegacyFilter(list, titleFilter);
  return sortTitlesList(list, titleSort);
}
