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
      
      // Add regular first clear (completion-based only)
      matches.push({
        first,
        type: 'guardian-first',
        matchReason
      });
      
      // Check for solo/solo flawless variants (these are always completion-based)
      if (first.isSolo && first.type === 'dungeon') {
        matches.push({
          first,
          type: 'solo',
          matchReason
        });
      }
      
      if (first.isSoloFlawless && first.type === 'dungeon') {
        matches.push({
          first,
          type: 'solo-flawless',
          matchReason
        });
      }
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
