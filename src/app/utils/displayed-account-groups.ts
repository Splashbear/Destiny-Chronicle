export type ActivityFilterPreset =
  | 'all'
  | 'raids-dungeons'
  | 'clears'
  | 'fails'
  | string;

/**
 * Filter account year/type groups for the Activities tab display.
 */
export function buildDisplayedAccountGroups(
  base: any[],
  opts: {
    preset: ActivityFilterPreset;
    accountFilter: boolean;
    isAccountSelected: (activity: any) => boolean;
    isCompleted: (activity: any) => boolean;
  }
): any[] {
  const { preset, accountFilter, isAccountSelected, isCompleted } = opts;
  return base
    .map((g: any) => ({
      ...g,
      yearGroups: g.yearGroups
        .map((yg: any) => ({
          ...yg,
          typeGroups: yg.typeGroups
            .filter((tg: any) => {
              if (preset === 'raids-dungeons') {
                const t = (tg.type || '').toLowerCase();
                return t === 'raid' || t === 'dungeon';
              }
              return true;
            })
            .map((tg: any) => {
              let activities = tg.activities;
              if (accountFilter) {
                activities = activities.filter((a: any) => isAccountSelected(a));
              }
              if (preset === 'clears') {
                activities = activities.filter((a: any) => isCompleted(a));
              }
              if (preset === 'fails') {
                activities = activities.filter((a: any) => !isCompleted(a));
              }
              return activities.length ? { ...tg, activities } : null;
            })
            .filter(Boolean),
        }))
        .filter((yg: any) => yg.typeGroups.length > 0),
    }))
    .filter((g: any) => g.yearGroups.length > 0);
}
