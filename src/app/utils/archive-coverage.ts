export type ArchiveCoverageLevel = 'full' | 'partial' | 'absent';

export interface ArchiveCoverageState {
  level: ArchiveCoverageLevel;
  through: string;
  instanceId: string;
}

const RANK: Record<ArchiveCoverageLevel, number> = {
  absent: 0,
  partial: 1,
  full: 2,
};

/** Merge incoming coverage level into existing state (CODE_CLEANUP_SPEC). */
export function mergeArchiveCoverage(
  cur: ArchiveCoverageState | null,
  incomingLevel: string
): ArchiveCoverageState | null {
  const level: ArchiveCoverageLevel =
    incomingLevel === 'full' ||
    incomingLevel === 'partial' ||
    incomingLevel === 'absent'
      ? incomingLevel
      : 'absent';
  const nextLevel =
    cur && RANK[cur.level] <= RANK[level] ? cur.level : level;
  if (!cur || nextLevel !== cur.level) {
    return {
      level: nextLevel,
      through: cur?.through ?? '',
      instanceId: cur?.instanceId ?? '',
    };
  }
  return null;
}
