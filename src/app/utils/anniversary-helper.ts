import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { ActivityHistory } from '../models/activity-history.model';

export interface FirstsOnDateMatch {
  first: ActivityFirstCompletion | ActivityHistory;
  type: 'guardian-first' | 'first-ever' | 'solo' | 'solo-flawless';
  matchReason: 'exact-date' | 'anniversary';
}

/**
 * Finds Guardian Firsts that fall on a specific calendar date (month+day) in local timezone.
 * Returns matches for both exact date and anniversaries (same month+day, different year).
 * 
 * Only includes completion-based milestones (completed === 1 or true).
 * Excludes non-completion milestones like "first run", "first start", or "first attempt".
 * 
 * @param firsts Array of Guardian First completions
 * @param targetDateStr Target date in YYYY-MM-DD format
 * @param includeFirstEver Optional first-ever activity to include
 * @returns Array of matching firsts with metadata
 */
export function getFirstsOnCalendarDate(
  firsts: ActivityFirstCompletion[],
  targetDateStr: string,
  includeFirstEver?: ActivityHistory
): FirstsOnDateMatch[] {
  if (!targetDateStr || !firsts) {
    return [];
  }

  const matches: FirstsOnDateMatch[] = [];
  
  // Parse target date (YYYY-MM-DD format, local timezone)
  const [targetYear, targetMonth, targetDay] = targetDateStr.split('-').map(Number);
  
  // Check each Guardian First
  for (const first of firsts) {
    if (!first.completionDate) continue;
    
    // Filter for completion-only records (same logic as Firsts tab)
    // Excludes non-completion milestones like "first run", "first start", etc.
    const completed: unknown = first.completed;
    if (!(completed === 1 || completed === true || Number(completed) === 1)) {
      continue;
    }
    
    // Parse completion date in local timezone
    const completionDate = new Date(first.completionDate);
    const completionMonth = completionDate.getMonth() + 1; // 0-based to 1-based
    const completionDay = completionDate.getDate();
    const completionYear = completionDate.getFullYear();
    
    // Check if month+day match
    if (completionMonth === targetMonth && completionDay === targetDay) {
      const matchReason = completionYear === targetYear ? 'exact-date' : 'anniversary';
      
      // Emit exactly ONE match per first record, preferring most specific completion kind:
      // solo-flawless > solo > guardian-first (regular completion)
      let matchType: 'guardian-first' | 'solo' | 'solo-flawless' = 'guardian-first';
      
      if (first.type === 'dungeon') {
        if (first.isSoloFlawless) {
          matchType = 'solo-flawless';
        } else if (first.isSolo) {
          matchType = 'solo';
        }
      }
      
      matches.push({
        first,
        type: matchType,
        matchReason
      });
    }
  }
  
  // Check First Ever activity if provided
  if (includeFirstEver?.period) {
    const firstEverDate = new Date(includeFirstEver.period);
    const firstEverMonth = firstEverDate.getMonth() + 1;
    const firstEverDay = firstEverDate.getDate();
    const firstEverYear = firstEverDate.getFullYear();
    
    if (firstEverMonth === targetMonth && firstEverDay === targetDay) {
      const matchReason = firstEverYear === targetYear ? 'exact-date' : 'anniversary';
      matches.push({
        first: includeFirstEver,
        type: 'first-ever',
        matchReason
      });
    }
  }
  
  return matches;
}

export interface FirstEverCandidate {
  activity: ActivityHistory;
  name: string;
  game: 'D1' | 'D2';
}

function instanceIdOf(entry: ActivityFirstCompletion | ActivityHistory): string {
  const first = entry as ActivityFirstCompletion & ActivityHistory;
  return String(first.instanceId || first.activityDetails?.instanceId || '');
}

function displayNameOf(entry: ActivityFirstCompletion | ActivityHistory, fallbackName?: string): string {
  const first = entry as ActivityFirstCompletion;
  return (first.name || fallbackName || '').trim().toLowerCase();
}

function gameOf(entry: ActivityFirstCompletion | ActivityHistory, fallbackGame?: 'D1' | 'D2'): string {
  return String((entry as ActivityFirstCompletion).game || fallbackGame || '');
}

function monthDayKey(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

/** Same milestone on Firsts tab: story release, instance, or name+game+calendar day. */
export function firstsTabMilestoneKey(
  entry: ActivityFirstCompletion | ActivityHistory,
  fallbackName?: string,
  fallbackGame?: 'D1' | 'D2'
): string {
  const first = entry as ActivityFirstCompletion;
  if (first.type === 'story' && first.storyReleaseId) {
    return `${first.game}|story|${first.storyReleaseId}`;
  }
  const instanceId = instanceIdOf(entry);
  if (instanceId) {
    return `instance|${instanceId}`;
  }
  const name = displayNameOf(entry, fallbackName);
  const game = gameOf(entry, fallbackGame);
  const day = monthDayKey(first.completionDate || (entry as ActivityHistory).period);
  return `${game}|${name}|${day}`;
}

function firstEverCoveredByFirsts(
  firsts: ActivityFirstCompletion[],
  candidate: FirstEverCandidate
): boolean {
  return firsts.some(existing => {
    const idA = instanceIdOf(existing);
    const idB = instanceIdOf(candidate.activity);
    if (idA && idB && idA === idB) return true;

    const refA = String(existing.referenceId || '');
    const refB = String(candidate.activity.activityDetails?.referenceId || '');
    if (refA && refB && refA === refB) return true;

    const nameA = displayNameOf(existing);
    const nameB = (candidate.name || '').trim().toLowerCase();
    const gameOk = !existing.game || !candidate.game || existing.game === candidate.game;
    if (nameA && nameB && nameA === nameB && gameOk) return true;

    return false;
  });
}

/**
 * Celebration rows come from Firsts-tab milestones for the calendar date.
 * First Ever is included only when it is not already a Firsts-tab activity
 * (e.g. Homecoming as first activity on 9/6 vs story first on 9/20 → no extra 9/6 row).
 */
export function collectFirstsTabMilestonesOnDate(
  firsts: ActivityFirstCompletion[],
  targetDateStr: string,
  firstEvers: FirstEverCandidate[] = []
): FirstsOnDateMatch[] {
  const fromFirsts = getFirstsOnCalendarDate(firsts, targetDateStr);
  const extra: FirstsOnDateMatch[] = [];

  for (const candidate of firstEvers) {
    if (firstEverCoveredByFirsts(firsts, candidate)) continue;
    const matches = getFirstsOnCalendarDate([], targetDateStr, candidate.activity);
    extra.push(...matches);
  }

  return [...fromFirsts, ...extra];
}
