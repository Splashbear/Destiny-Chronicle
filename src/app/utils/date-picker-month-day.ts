/**
 * Clamp month/day from the date picker (CODE_CLEANUP_SPEC).
 * Returns null when inputs are invalid.
 */
export function clampDatePickerMonthDay(
  month: number,
  day: number
): { month: number; day: number } | null {
  const newMonth = Number(month);
  let newDay = Number(day);
  if (!newMonth || !newDay) {
    return null;
  }
  const daysInMonth = new Date(2000, newMonth, 0).getDate();
  newDay = Math.min(newDay, daysInMonth);
  return { month: newMonth, day: newDay };
}
