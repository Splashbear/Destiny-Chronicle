/** Whether the Breakdown game dropdown should stay visible (CODE_CLEANUP_SPEC). */
export function showBreakdownGameDropdown(selectedGames: ('D1' | 'D2')[]): boolean {
  if (selectedGames.length === 0 || selectedGames.length > 1) return true;
  return false;
}
