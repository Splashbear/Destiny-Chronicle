/**
 * Host deps for ModalPlayerLoadService.loadSelectedPlayers (CODE_CLEANUP_SPEC).
 */
export function buildModalPlayerLoadHost(c: any) {
  return {
    collectAllModalPlayers: () => c.collectAllModalPlayers(),
    getModalSelectedPlayers: () => c.modalSelectedPlayers,
    getPlayerKey: (p: any) => c.getPlayerKey(p),
    setErrorMessage: (message: string) => {
      c.errorMessage = message;
    },
    selectPlayer: (player: any) => c.selectPlayer(player),
    appendPlayer: (player: any) => c.appendPlayer(player),
    setShowPlatformPicker: (show: boolean) => {
      c.showPlatformPicker = show;
    },
    getSelectedDate: () => c.selectedDate,
    loadAllFilteredActivities: () => c.loadAllFilteredActivities(),
    calculateAccountStats: () => c.calculateAccountStats(),
    clearModalSelectedPlayers: () => c.modalSelectedPlayers.clear(),
    setSearchPanelExpanded: (expanded: boolean) => {
      c.searchPanelExpanded = expanded;
    },
    detectChanges: () => c.cdr.detectChanges(),
  };
}
