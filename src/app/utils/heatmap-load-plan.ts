export type HeatmapLoadAction = 'none' | 'cached' | 'join' | 'read';

/** One table read per membership-id list. A repeat joins the read in flight or uses the cache. */
export function heatmapLoadAction(state: {
  destroyed: boolean;
  membershipKey: string;
  cachedKey: string;
  tableReady: boolean;
  inflightKey: string;
}): HeatmapLoadAction {
  if (state.destroyed || !state.membershipKey) {
    return 'none';
  }
  if (state.tableReady && state.cachedKey === state.membershipKey) {
    return 'cached';
  }
  if (state.inflightKey && state.inflightKey === state.membershipKey) {
    return 'join';
  }
  return 'read';
}
