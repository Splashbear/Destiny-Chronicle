/** Shared On-This-Day / decrypted-memory copy for the banner and share PNG. */

const YEAR_WORDS = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
];

export type AnniversaryFlavorInput = {
  activityName?: string | null;
  yearsAgo: number;
  type?: string | null;
};

export function anniversaryWhenPhrase(yearsAgo: number): string {
  if (yearsAgo <= 0) return 'Today';
  if (yearsAgo === 1) return 'One year ago tonight';
  const word = YEAR_WORDS[yearsAgo];
  return word ? `${word} years ago tonight` : `${yearsAgo} years ago tonight`;
}

/** "A", "A and B", or "A, B, and C". */
export function formatActivityNameList(names: readonly string[]): string {
  const cleaned = names.map(n => (n || '').trim()).filter(Boolean);
  if (cleaned.length === 0) return 'that activity';
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}`;
}

/** Short flavor for older share call sites that only pass yearsAgo. */
export function anniversaryShareFlavor(yearsAgo: number): string {
  if (yearsAgo <= 0) return 'Today.';
  if (yearsAgo === 1) return 'One year ago tonight.';
  return `${yearsAgo} years ago tonight.`;
}

function singleAnniversaryFlavor(a: AnniversaryFlavorInput): string {
  const name = (a.activityName || '').trim() || 'that activity';
  const when = anniversaryWhenPhrase(a.yearsAgo);
  switch (a.type) {
    case 'solo-flawless':
      return `${when}, you solo flawless'd ${name}.`;
    case 'solo':
      return `${when}, you cleared ${name} alone.`;
    case 'first-ever':
      return `${when}, your journey began in ${name}.`;
    default:
      return `${when}, you stood in ${name}.`;
  }
}

/**
 * Banner + share headline. One first keeps type-aware wording; several firsts
 * become one sentence listing every activity (no expand/collapse).
 */
export function anniversaryCardFlavor(
  anniversaries: readonly AnniversaryFlavorInput[] | null | undefined
): string {
  const list = (anniversaries || []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return singleAnniversaryFlavor(list[0]);

  const names = list.map(a => (a.activityName || '').trim() || 'that activity');
  const joined = formatActivityNameList(names);
  const yearSet = new Set(list.map(a => a.yearsAgo));
  const when =
    yearSet.size === 1
      ? anniversaryWhenPhrase(list[0].yearsAgo)
      : 'On this day';
  return `${when}, you first cleared ${joined}.`;
}
