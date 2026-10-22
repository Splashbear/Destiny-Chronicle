/**
 * Host deps for PgcrCharacterClassEnrichService (CODE_CLEANUP_SPEC).
 */
export function buildPgcrEnrichHost(c: any) {
  return {
    getSelectedPlayers: () => c.selectedPlayers,
    getPlayerKey: (p: any) => c.getPlayerKey(p),
    getSelectedCharacterId: (key: string) => c.selectedCharacterIds[key] || '',
    getPlatformName: (mt: number) => c.getPlatformName(mt),
    getPgcrBatchSize: () => c.PGCR_BATCH_SIZE,
    updateLoadingProgress: (
      phase: any,
      current: number,
      total: number,
      message: string
    ) => c.updateLoadingProgress(phase, current, total, message),
    validatePgcrBatch: (acts: any, character: any, startIdx: number) =>
      c.validatePGCRBatch(acts, character, startIdx),
    getFilteredActivitiesForDate: () => c.filteredActivitiesForDate,
  };
}
