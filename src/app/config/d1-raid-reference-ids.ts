/**
 * Destiny 1 raid activity referenceIds (all variants).
 * CODE_CLEANUP_SPEC — single source for filter + account-stats raid detection.
 */
export const D1_RAID_HASHES: readonly string[] = [
  // Vault of Glass
  '3801607287', '708693006', '2659248071', '2659248068', '2659248069',
  '856898338', '4038697181',
  // Crota's End
  '898834093', '112157962', '3879860662', '1836893116', '1836893119',
  '2324706853', '4000873610',
  // King's Fall
  '1733556769', '3534581229', '1016659723', '3978884648',
  // Wrath of the Machine
  '2578867903', '4007500989', '1099433614', '1342567280', '260765522',
  '1387993552', '430160982', '3356249023',
];

export function isD1RaidReferenceId(referenceId: string | number | null | undefined): boolean {
  if (referenceId == null || referenceId === '') return false;
  return D1_RAID_HASHES.includes(String(referenceId));
}
