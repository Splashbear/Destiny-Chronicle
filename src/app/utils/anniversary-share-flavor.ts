/** Flavor line for the decrypted-memory share card. */
export function anniversaryShareFlavor(yearsAgo: number): string {
  if (yearsAgo <= 0) return 'Today.';
  if (yearsAgo === 1) return 'One year ago tonight.';
  return `${yearsAgo} years ago tonight.`;
}
