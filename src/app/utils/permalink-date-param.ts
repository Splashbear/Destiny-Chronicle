export type ParsedPermalinkDate = {
  year: number;
  month: number;
  day: number;
  date: string;
};

/**
 * Validate YYYY-MM-DD permalink date (Destiny window 2014–2030).
 */
export function parsePermalinkDateParam(
  dateParam: string | null | undefined
): ParsedPermalinkDate | null {
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return null;
  }
  const [year, month, day] = dateParam.split('-').map(Number);
  if (year < 2014 || year > 2030 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { year, month, day, date: dateParam };
}
