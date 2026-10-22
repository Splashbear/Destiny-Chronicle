/** Replace-mode warning when searching with profiles already selected (CODE_CLEANUP_SPEC). */

export const REPLACE_PROFILES_WARNING =
  'Warning: This search will replace your current profiles. Enable "Add mode" to keep existing profiles.';

export function searchModeErrorMessage(input: {
  addMode: boolean;
  selectedPlayersLength: number;
  searchUsername: string;
}): string {
  if (input.selectedPlayersLength > 0 && input.searchUsername.trim()) {
    return input.addMode ? '' : REPLACE_PROFILES_WARNING;
  }
  return '';
}
