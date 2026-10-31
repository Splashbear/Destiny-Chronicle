export interface ArchiveCoverageState {
  level: 'full' | 'partial' | 'absent';
  through: string;
  instanceId: string;
}

/**
 * Apply watermark fields onto archive coverage when they change (CODE_CLEANUP_SPEC).
 */
export function applyArchiveWatermark(
  coverage: ArchiveCoverageState,
  mark: { as_of?: string; max_instance_id?: string }
): ArchiveCoverageState | null {
  const through = (mark.as_of || '').slice(0, 10);
  const instanceId = mark.max_instance_id ?? '';
  if (coverage.through === through && coverage.instanceId === instanceId) {
    return null;
  }
  return {
    ...coverage,
    through,
    instanceId,
  };
}
