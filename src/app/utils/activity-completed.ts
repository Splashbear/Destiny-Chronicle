/** True when PGCR completed flag is 1/true (CODE_CLEANUP_SPEC). */
export function isActivityCompleted(activity: any): boolean {
  const v = activity?.values?.completed?.basic?.value;
  return v === 1 || v === true;
}
