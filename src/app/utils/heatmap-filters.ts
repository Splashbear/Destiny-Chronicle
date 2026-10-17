export interface HeatmapActivity {
  period?: string;
  membershipId?: string;
  membershipType?: number;
  characterId?: string;
  characterClass?: string;
  game?: 'D1' | 'D2';
  values?: { timePlayedSeconds?: { basic?: { value?: number } } };
}

export interface HeatmapCharacterOption {
  key: string;
  label: string;
  membershipId: string;
  characterId: string;
  game: 'D1' | 'D2';
  membershipType: number;
  disabled?: boolean;
}

export interface HeatmapCharacterLookup {
  className?: string;
  membershipType?: number;
  displayName?: string;
}

export interface HeatmapPlatformOption {
  type: number;
  name: string;
  disabled?: boolean;
}

export interface HeatmapYearOption {
  year: number;
  disabled?: boolean;
}

export interface HeatmapSeasonOption {
  name: string;
  disabled?: boolean;
}

export function platformName(membershipType?: number): string {
  switch (membershipType) {
    case 1: return 'Xbox';
    case 2: return 'PlayStation';
    case 3: return 'Steam';
    case 4: return 'Blizzard';
    case 5: return 'Stadia';
    case 6: return 'Epic';
    default: return 'Unknown';
  }
}

export function platformShortName(membershipType?: number): string {
  return membershipType === 2 ? 'PSN' : platformName(membershipType);
}

export function classNameFromType(classType?: number): string | undefined {
  switch (classType) {
    case 0: return 'Titan';
    case 1: return 'Hunter';
    case 2: return 'Warlock';
    default: return undefined;
  }
}

export function normalizeClassName(name?: string | null): string | undefined {
  if (!name) {
    return undefined;
  }
  const lower = name.toLowerCase();
  if (lower.includes('titan')) {
    return 'Titan';
  }
  if (lower.includes('hunter')) {
    return 'Hunter';
  }
  if (lower.includes('warlock')) {
    return 'Warlock';
  }
  return undefined;
}

const CLASS_HASH_NAMES: Record<number, string> = {
  3655393761: 'Titan',
  671679327: 'Hunter',
  2271682572: 'Warlock'
};

export function classFromProfileCharacter(char: unknown): string | undefined {
  const profile = char as {
    classType?: number;
    classHash?: number;
    className?: string;
    characterBase?: { classType?: number; classHash?: number };
  } | null;
  if (!profile) {
    return undefined;
  }
  const type = profile.classType ?? profile.characterBase?.classType;
  const hash = profile.classHash ?? profile.characterBase?.classHash;
  return classNameFromType(typeof type === 'number' ? type : undefined)
    || (typeof hash === 'number' ? CLASS_HASH_NAMES[hash] : undefined)
    || normalizeClassName(profile.className);
}

export function characterDisplayLabel(
  game: string,
  displayName: string | undefined,
  platform: string,
  className: string
): string {
  const name = displayName?.trim();
  return name
    ? `${game} ${name} ${platform} ${className}`
    : `${game} ${platform} ${className}`;
}

export function characterKey(activity: HeatmapActivity): string {
  return `${activity.game || 'D2'}|${activity.membershipId || ''}|${activity.characterId || ''}`;
}

export function activitySeconds(activity: HeatmapActivity): number {
  return activity.values?.timePlayedSeconds?.basic?.value || 0;
}

export function filterHeatmapActivities(
  activities: HeatmapActivity[],
  opts: {
    membershipIds?: string[] | null;
    membershipType?: number | null;
    characterKey?: string | null;
    year?: number | null;
  }
): HeatmapActivity[] {
  const membershipSet = opts.membershipIds?.length ? new Set(opts.membershipIds) : null;
  return activities.filter(activity => {
    if (!activity.period) {
      return false;
    }
    if (membershipSet && activity.membershipId && !membershipSet.has(activity.membershipId)) {
      return false;
    }
    if (opts.membershipType != null && activity.membershipType !== opts.membershipType) {
      return false;
    }
    if (opts.characterKey && characterKey(activity) !== opts.characterKey) {
      return false;
    }
    if (opts.year != null && new Date(activity.period).getFullYear() !== opts.year) {
      return false;
    }
    return true;
  });
}

export function uniquePlatforms(activities: HeatmapActivity[]): HeatmapPlatformOption[] {
  const seen = new Map<number, string>();
  for (const activity of activities) {
    if (activity.membershipType == null) {
      continue;
    }
    if (!seen.has(activity.membershipType)) {
      seen.set(activity.membershipType, platformShortName(activity.membershipType));
    }
  }
  return [...seen.entries()]
    .map(([type, name]) => ({ type, name }))
    .sort((a, b) => a.type - b.type);
}

function lookupCharacterMeta(
  lookup: Record<string, HeatmapCharacterLookup | string> | undefined,
  activity: HeatmapActivity
): HeatmapCharacterLookup {
  const raw = lookup?.[characterKey(activity)] || lookup?.[activity.characterId || ''];
  if (!raw) {
    return {};
  }
  if (typeof raw === 'string') {
    return { className: raw };
  }
  return raw;
}

function resolvedCharacterClass(
  activity: HeatmapActivity,
  classByKey?: Record<string, HeatmapCharacterLookup | string>
): string {
  const meta = lookupCharacterMeta(classByKey, activity);
  return normalizeClassName(meta.className)
    || normalizeClassName(activity.characterClass)
    || 'Guardian';
}

function disambiguateCharacterLabels(options: HeatmapCharacterOption[]): void {
  const byLabel = new Map<string, HeatmapCharacterOption[]>();
  for (const option of options) {
    const list = byLabel.get(option.label) || [];
    list.push(option);
    byLabel.set(option.label, list);
  }
  for (const duplicates of byLabel.values()) {
    if (duplicates.length < 2) {
      continue;
    }
    const games = new Set(duplicates.map(option => option.game));
    if (games.size > 1) {
      for (const option of duplicates) {
        option.label = `${option.game} ${option.label}`;
      }
      continue;
    }
    for (const option of duplicates) {
      option.label = `${option.label} · ${option.characterId.slice(-4)}`;
    }
  }
}

export function uniqueCharacters(
  activities: HeatmapActivity[],
  classByKey?: Record<string, HeatmapCharacterLookup | string>
): HeatmapCharacterOption[] {
  const seen = new Map<string, HeatmapCharacterOption>();
  for (const activity of activities) {
    if (!activity.membershipId || !activity.characterId) {
      continue;
    }
    const key = characterKey(activity);
    const existing = seen.get(key);
    const meta = lookupCharacterMeta(classByKey, activity);
    const cls = resolvedCharacterClass(activity, classByKey);
    const membershipType = activity.membershipType || meta.membershipType || 0;
    const platform = platformShortName(membershipType);
    const game = activity.game || 'D2';
    const displayName = meta.displayName?.trim() || '';
    const label = characterDisplayLabel(game, displayName, platform, cls);
    if (!existing) {
      seen.set(key, {
        key,
        label,
        membershipId: activity.membershipId,
        characterId: activity.characterId,
        game,
        membershipType
      });
    } else {
      if (membershipType && !existing.membershipType) {
        existing.membershipType = membershipType;
      }
      const bestClass = cls !== 'Guardian' || existing.label.endsWith('Guardian')
        ? cls
        : existing.label.split(' ').slice(-1)[0];
      existing.label = characterDisplayLabel(
        existing.game,
        displayName,
        platformShortName(existing.membershipType),
        bestClass
      );
    }
  }
  const options = [...seen.values()];
  disambiguateCharacterLabels(options);
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function uniqueYears(activities: HeatmapActivity[]): number[] {
  const years = new Set<number>();
  for (const activity of activities) {
    if (!activity.period) {
      continue;
    }
    years.add(new Date(activity.period).getFullYear());
  }
  return [...years].sort((a, b) => a - b);
}

/** D1 launched Sept 2014; D2 Sept 2017. */
export const D1_FIRST_YEAR = 2014;
export const D2_FIRST_YEAR = 2017;

/**
 * Continuous year list for selectors: from 2014 when any D1 row is present
 * (2017 otherwise, or earlier data if any) through the current year.
 * Years without data stay listed; callers disable them.
 */
export function heatmapYearRange(activities: HeatmapActivity[], now: Date = new Date()): number[] {
  const dataYears = uniqueYears(activities);
  if (dataYears.length === 0) {
    return [];
  }
  const hasD1 = activities.some(a => a.game === 'D1');
  const start = Math.min(hasD1 ? D1_FIRST_YEAR : D2_FIRST_YEAR, dataYears[0]);
  const end = Math.max(now.getFullYear(), dataYears[dataYears.length - 1]);
  const out: number[] = [];
  for (let y = start; y <= end; y++) out.push(y);
  return out;
}

/** Stored games are unique per game + instance id (D1 and D2 ids overlap). */
export function gameInstanceKey(
  activity: { game?: string; activityDetails?: { instanceId?: string | number } } | null | undefined,
  fallbackGame?: 'D1' | 'D2'
): string {
  const iid = activity?.activityDetails?.instanceId;
  if (iid == null || iid === '') return '';
  return `${activity?.game || fallbackGame || 'D2'}|${iid}`;
}

export function seasonOverlapsYear(start: Date, end: Date, year: number): boolean {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);
  return start <= yearEnd && end >= yearStart;
}

export function clipRangeToYear(
  start: Date,
  end: Date,
  year: number | null
): { start: Date; end: Date } | null {
  if (year == null) {
    return { start, end };
  }
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);
  const clippedStart = start < yearStart ? yearStart : start;
  const clippedEnd = end > yearEnd ? yearEnd : end;
  if (clippedStart > clippedEnd) {
    return null;
  }
  return { start: clippedStart, end: clippedEnd };
}

export function sameMembershipIds(
  previous: readonly string[] | null | undefined,
  next: readonly string[] | null | undefined
): boolean {
  if (previous === next) {
    return true;
  }
  if (!previous || !next || previous.length !== next.length) {
    return false;
  }
  for (let i = 0; i < previous.length; i++) {
    if (previous[i] !== next[i]) {
      return false;
    }
  }
  return true;
}

/** One pass. Matches heatmapHasActivity for each platform, character, and year option. */
export function heatmapOptionPresence(
  activities: HeatmapActivity[],
  opts: {
    membershipType?: number | null;
    characterKey?: string | null;
    year?: number | null;
  }
): { platforms: Set<number>; characters: Set<string>; years: Set<number> } {
  const platforms = new Set<number>();
  const characters = new Set<string>();
  const years = new Set<number>();
  for (const activity of activities) {
    if (!activity.period) {
      continue;
    }
    const year = new Date(activity.period).getFullYear();
    const key = characterKey(activity);
    const type = activity.membershipType;
    const yearOk = opts.year == null || year === opts.year;
    const characterOk = !opts.characterKey || key === opts.characterKey;
    const platformOk = opts.membershipType == null || type === opts.membershipType;
    if (characterOk && yearOk && type != null) {
      platforms.add(type);
    }
    if (platformOk && yearOk) {
      characters.add(key);
    }
    if (platformOk && characterOk && Number.isFinite(year)) {
      years.add(year);
    }
  }
  return { platforms, characters, years };
}

/**
 * Fill class and platform from the profile lookup.
 * Returns the same row when those fields are already set, and otherwise a
 * small row with only the heatmap fields (not a copy of the stored record).
 */
export function projectHeatmapRow(
  activity: HeatmapActivity,
  meta: Record<string, HeatmapCharacterLookup>,
  typeByMembership: Map<string, number>
): HeatmapActivity {
  const info = meta[characterKey(activity)] || (activity.characterId ? meta[activity.characterId] : undefined);
  const membershipType = activity.membershipType
    || info?.membershipType
    || (activity.membershipId ? typeByMembership.get(activity.membershipId) : undefined);
  const hasClass = !!activity.characterClass && activity.characterClass !== 'Unknown';
  if (!info && membershipType == null) {
    return activity;
  }
  const characterClass = hasClass ? activity.characterClass : (info?.className || activity.characterClass);
  if (activity.membershipType === membershipType && activity.characterClass === characterClass) {
    return activity;
  }
  return {
    period: activity.period,
    membershipId: activity.membershipId,
    membershipType,
    characterId: activity.characterId,
    characterClass,
    game: activity.game,
    values: activity.values,
  };
}

export function heatmapHasActivity(
  activities: HeatmapActivity[],
  opts: {
    membershipIds?: string[] | null;
    membershipType?: number | null;
    characterKey?: string | null;
    year?: number | null;
  }
): boolean {
  const membershipSet = opts.membershipIds?.length ? new Set(opts.membershipIds) : null;
  return activities.some(activity => {
    if (!activity.period) {
      return false;
    }
    if (membershipSet && activity.membershipId && !membershipSet.has(activity.membershipId)) {
      return false;
    }
    if (opts.membershipType != null && activity.membershipType !== opts.membershipType) {
      return false;
    }
    if (opts.characterKey && characterKey(activity) !== opts.characterKey) {
      return false;
    }
    if (opts.year != null && new Date(activity.period).getFullYear() !== opts.year) {
      return false;
    }
    return true;
  });
}

export function formatDaysHours(totalSeconds: number, daysPlayed: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const dayLabel = daysPlayed === 1 ? '1 day' : `${daysPlayed} days`;
  const hourLabel = hours === 1 ? '1 hour' : `${hours} hours`;
  return `${dayLabel}, ${hourLabel}`;
}

export const MONTH_ABBREVS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function monthAbbrev(date: Date): string {
  return MONTH_ABBREVS[date.getMonth()];
}

export interface HeatmapWeekDay {
  day: number;
  date: Date;
}

export function weekMonthLabel(
  week: HeatmapWeekDay[],
  options?: { isFirstVisibleWeek?: boolean }
): string | null {
  const realDays = week.filter(cell => cell.day > 0);
  if (!realDays.length) {
    return null;
  }
  const monthStart = realDays.find(cell => cell.day === 1);
  if (monthStart) {
    return monthAbbrev(monthStart.date);
  }
  if (options?.isFirstVisibleWeek) {
    return monthAbbrev(realDays[0].date);
  }
  return null;
}

export function weekMonthLabels(weeks: HeatmapWeekDay[][]): (string | null)[] {
  let seenVisible = false;
  return weeks.map(week => {
    const hasRealDays = week.some(cell => cell.day > 0);
    const isFirstVisibleWeek = !seenVisible && hasRealDays;
    if (hasRealDays) {
      seenVisible = true;
    }
    return weekMonthLabel(week, { isFirstVisibleWeek });
  });
}
