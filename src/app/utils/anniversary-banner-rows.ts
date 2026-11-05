import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { ActivityHistory } from '../models/activity-history.model';
import { guardianFirstsDedupKey } from './guardian-firsts-dedupe';
import {
  collectFirstsTabMilestonesOnDate,
  raidDungeonFirstsShownOnCards,
} from './anniversary-helper';
import { AnniversaryFirst } from '../components/anniversary-celebration-banner/anniversary-celebration-banner.component';
import { isPlaceholderBungieIcon } from './bungie-icon-path';

export interface AnniversaryFirstEverInput {
  activity: ActivityHistory;
  name: string;
  game: 'D1' | 'D2';
  platform?: string;
  membershipId?: string;
}

export interface AnniversaryBannerResolvers {
  getActivityName(activity: ActivityHistory | ActivityFirstCompletion, isD1: boolean): string;
  formatDate(dateString: string): string;
  resolveIconUrl(referenceId: string | number, isD1: boolean): string | null;
  resolveFirstCompletionImage(first: ActivityFirstCompletion): string | null;
  resolvePgcrImageUrl(referenceId: string | number, isD1: boolean): string | null;
  getFirstClearFireteam(first: ActivityFirstCompletion): string | null;
  resolvePlatform(args: {
    first: ActivityFirstCompletion | ActivityHistory;
    game: 'D1' | 'D2';
    firstEvers: AnniversaryFirstEverInput[];
  }): string | undefined;
}

/**
 * Build anniversary banner rows for the selected calendar date (CODE_CLEANUP_SPEC).
 * Pure aside from resolvers for names/images/platform.
 */
export function buildAnniversaryBannerRows(input: {
  selectedDate: string;
  selectedPlayersLength: number;
  rawFirstsByPlayer: ActivityFirstCompletion[][];
  displayedRaidDungeonFirsts: ActivityFirstCompletion[];
  firstEvers: AnniversaryFirstEverInput[];
  resolvers: AnniversaryBannerResolvers;
}): AnniversaryFirst[] {
  const { selectedDate, resolvers } = input;
  if (!selectedDate || !input.selectedPlayersLength) return [];

  const [targetYear] = selectedDate.split('-').map(Number);

  const rawFirsts: ActivityFirstCompletion[] = [];
  for (const list of input.rawFirstsByPlayer) {
    for (const first of list) {
      const key = guardianFirstsDedupKey(first);
      const existing = rawFirsts.find(f => guardianFirstsDedupKey(f) === key);
      if (!existing) {
        rawFirsts.push(first);
      } else if (new Date(first.completionDate) < new Date(existing.completionDate)) {
        rawFirsts[rawFirsts.indexOf(existing)] = first;
      }
    }
  }
  const firsts = raidDungeonFirstsShownOnCards(rawFirsts, input.displayedRaidDungeonFirsts);

  const matches = collectFirstsTabMilestonesOnDate(
    firsts,
    selectedDate,
    input.firstEvers.map(({ activity, name, game }) => ({ activity, name, game }))
  );

  const anniversaries: AnniversaryFirst[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const first = match.first as ActivityFirstCompletion & ActivityHistory;
    const isHistory = !('type' in first) || match.type === 'first-ever';
    const activityName =
      isHistory && !first.name
        ? resolvers.getActivityName(
            first as ActivityHistory,
            ((first as any).game || 'D2') === 'D1'
          )
        : first.name ||
          resolvers.getActivityName(first as ActivityHistory, first.game === 'D1');
    const completionDate = first.completionDate || first.period;
    const instanceId = first.instanceId || first.activityDetails?.instanceId;
    const game = (first.game ||
      input.firstEvers.find(fe => fe.activity === match.first)?.game ||
      'D2') as 'D1' | 'D2';
    const completionYear = new Date(completionDate).getFullYear();
    const yearsAgo = targetYear - completionYear;
    const platform = resolvers.resolvePlatform({
      first,
      game,
      firstEvers: input.firstEvers,
    });

    const key = `${match.type}|${game}|${activityName}|${completionDate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const isD1 = game === 'D1';
    const referenceId =
      (first as ActivityFirstCompletion).referenceId ||
      (first as ActivityHistory).activityDetails?.referenceId;
    let iconUrl: string | null = null;
    let pgcrImageUrl: string | null = null;
    if (referenceId != null) {
      iconUrl = resolvers.resolveIconUrl(referenceId, isD1);
      if (iconUrl && isPlaceholderBungieIcon(iconUrl)) {
        iconUrl = null;
      }
      if (match.type !== 'first-ever') {
        pgcrImageUrl = resolvers.resolveFirstCompletionImage(first as ActivityFirstCompletion);
      } else {
        pgcrImageUrl = resolvers.resolvePgcrImageUrl(referenceId, isD1);
      }
      // Many dungeon/raid variants ship missing_icon_d2; use PGCR art for thumbs/share.
      if (!iconUrl && pgcrImageUrl) {
        iconUrl = pgcrImageUrl;
      }
    }

    const ft = first as ActivityFirstCompletion;
    const fireteam = anniversaryFireteamFacts(ft, match.type, resolvers.getFirstClearFireteam);

    anniversaries.push({
      first: match.first,
      type: match.type,
      activityName,
      year: completionYear,
      yearsAgo,
      game,
      platform,
      completionDate,
      dateLabel: resolvers.formatDate(completionDate),
      instanceId,
      iconUrl,
      pgcrImageUrl,
      fireteamLabel: fireteam.label,
      fireteamNames: fireteam.names,
    });
  }

  return anniversaries;
}

/**
 * Names from the first-clear PGCR. Solo clears stay "alone" (no roster).
 * When names are missing, fall back to a size label — never invent guardians.
 */
export function anniversaryFireteamFacts(
  first: ActivityFirstCompletion,
  type: AnniversaryFirst['type'],
  getFirstClearFireteam: (first: ActivityFirstCompletion) => string | null
): { label: string | null; names: string[] } {
  if (type === 'solo' || type === 'solo-flawless' || first.isSolo || first.isSoloFlawless) {
    return { label: 'alone', names: [] };
  }
  const direct = (first.fireteamNames || []).map((n) => String(n).trim()).filter(Boolean);
  const fromLabel = direct.length
    ? direct
    : (getFirstClearFireteam(first) || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  if (fromLabel.length) {
    return { label: null, names: fromLabel };
  }
  if (typeof first.fireteamSize === 'number' && first.fireteamSize > 0) {
    return { label: `Fireteam of ${first.fireteamSize}`, names: [] };
  }
  return { label: null, names: [] };
}
