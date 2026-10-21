const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Formats calendar fields as "April 23, 2024". */
export function formatSelectedDateLabel(
  year: number,
  month: number,
  day: number
): string {
  const date = new Date(year, month - 1, day);
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
