/** Date keys in loadingActivities look like YYYY-MM-DD; character keys do not. */
const DATE_LOADING_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isCharacterActivityLoadingKey(key: string): boolean {
  return !DATE_LOADING_KEY.test(key);
}

/** True while any per-character history load is still in flight. */
export function anyCharacterActivityLoading(
  loadingActivities: Record<string, boolean> | null | undefined
): boolean {
  if (!loadingActivities) return false;
  return Object.entries(loadingActivities).some(
    ([key, loading]) => !!loading && isCharacterActivityLoadingKey(key)
  );
}
