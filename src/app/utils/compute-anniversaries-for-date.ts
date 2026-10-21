import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { ActivityHistory } from '../models/activity-history.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { AnniversaryFirst } from '../components/anniversary-celebration-banner/anniversary-celebration-banner.component';
import {
  buildAnniversaryBannerRows,
  AnniversaryBannerResolvers,
  AnniversaryFirstEverInput,
} from './anniversary-banner-rows';

export interface ComputeAnniversariesDeps {
  selectedDate: string;
  selectedPlayers: PlayerSearchDisplay[];
  getFirstEverForPlayer(player: PlayerSearchDisplay): ActivityHistory | null | undefined;
  isD1Player(player: PlayerSearchDisplay): boolean;
  getPlayerKey(player: PlayerSearchDisplay): string;
  guardianFirstsMap: Record<string, ActivityFirstCompletion[]>;
  displayedRaidDungeonFirsts: ActivityFirstCompletion[];
  getActivityName(activity: ActivityHistory, isD1: boolean): string;
  formatDate(dateString: string): string;
  resolveIconUrl(referenceId: string | number, isD1: boolean): string | null;
  resolveFirstCompletionImage(first: ActivityFirstCompletion): string | null;
  resolvePgcrImageUrl(referenceId: string | number, isD1: boolean): string | null;
  getFirstClearFireteam(first: ActivityFirstCompletion): string | null;
}

/**
 * Anniversary banner rows for the selected calendar date (CODE_CLEANUP_SPEC).
 */
export function computeAnniversariesForSelectedDate(
  deps: ComputeAnniversariesDeps
): AnniversaryFirst[] {
  const { selectedDate, selectedPlayers } = deps;
  if (!selectedDate || !selectedPlayers.length) return [];

  const firstEvers: AnniversaryFirstEverInput[] = selectedPlayers
    .map((player) => {
      const activity = deps.getFirstEverForPlayer(player);
      if (!activity) return null;
      const isD1 = deps.isD1Player(player);
      return {
        activity,
        name: deps.getActivityName(activity, isD1),
        game: (player.game || (isD1 ? 'D1' : 'D2')) as 'D1' | 'D2',
        platform: player.platform,
        membershipId: player.membershipId,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const resolvers: AnniversaryBannerResolvers = {
    getActivityName: (activity, isD1) =>
      deps.getActivityName(activity as ActivityHistory, isD1),
    formatDate: (d) => deps.formatDate(d),
    resolveIconUrl: (referenceId, isD1) => deps.resolveIconUrl(referenceId, isD1),
    resolveFirstCompletionImage: (first) => deps.resolveFirstCompletionImage(first),
    resolvePgcrImageUrl: (referenceId, isD1) =>
      deps.resolvePgcrImageUrl(referenceId, isD1),
    getFirstClearFireteam: (ft) => deps.getFirstClearFireteam(ft),
    resolvePlatform: ({ first, game, firstEvers: fe }) =>
      (first as any).platform ||
      selectedPlayers.find(
        (p) =>
          p.membershipId === (first as any).membershipId &&
          (p.game === game ||
            (!p.game && (deps.isD1Player(p) ? 'D1' : 'D2') === game))
      )?.platform ||
      fe.find((x) => x.activity === first)?.platform,
  };

  return buildAnniversaryBannerRows({
    selectedDate,
    selectedPlayersLength: selectedPlayers.length,
    rawFirstsByPlayer: selectedPlayers.map(
      (p) => deps.guardianFirstsMap[deps.getPlayerKey(p)] || []
    ),
    displayedRaidDungeonFirsts: deps.displayedRaidDungeonFirsts,
    firstEvers,
    resolvers,
  });
}
