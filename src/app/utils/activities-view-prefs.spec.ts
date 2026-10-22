import {
  loadActivitiesViewPreferences,
  loadCollapsedActivityGames,
  persistActivitiesViewPreferences,
  persistActivityCollapseState,
} from './activities-view-prefs';

describe('activities-view-prefs', () => {
  it('round-trips collapse and view prefs', () => {
    const store: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    } as Storage;

    persistActivityCollapseState(storage, new Set(['D1']), new Set(['D2|2020']));
    expect([...loadCollapsedActivityGames(storage)]).toEqual(['D1']);

    persistActivitiesViewPreferences(storage, 'chronological', 'oldest');
    expect(loadActivitiesViewPreferences(storage)).toEqual({
      mode: 'chronological',
      sort: 'oldest',
    });
  });
});
