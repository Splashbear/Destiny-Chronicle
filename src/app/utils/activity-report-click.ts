/**
 * Parse a click on an activity PGCR link button (CODE_CLEANUP_SPEC).
 */
export function parseActivityReportClick(
  event: MouseEvent
): { instanceId: string; isD1: boolean } | null {
  const target = event.target as HTMLElement | null;
  if (!target?.closest('button.activity-pgcr-link')) {
    return null;
  }
  const el = target.closest('[data-instance-id]') as HTMLElement | null;
  const instanceId = el?.getAttribute('data-instance-id');
  if (!instanceId) {
    return null;
  }
  const isD1 = el?.getAttribute('data-d1') === '1';
  return { instanceId, isD1 };
}
