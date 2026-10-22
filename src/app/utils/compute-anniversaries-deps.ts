import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { ActivityHistory } from '../models/activity-history.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { ComputeAnniversariesDeps } from './compute-anniversaries-for-date';

/**
 * Bind component methods into ComputeAnniversariesDeps (CODE_CLEANUP_SPEC).
 */
export function buildComputeAnniversariesDeps(host: {
  selectedDate: string;
  selectedPlayers: PlayerSearchDisplay[];
  getFirstEverForPlayer(p: PlayerSearchDisplay): ActivityHistory | null | undefined;
  isD1Player(p: PlayerSearchDisplay): boolean;
  getPlayerKey(p: PlayerSearchDisplay): string;
  guardianFirstsMap: Record<string, ActivityFirstCompletion[]>;
  displayedRaidDungeonFirsts(): ActivityFirstCompletion[];
  getActivityName(activity: ActivityHistory, isD1: boolean): string;
  formatDate(dateString: string): string;
  getFirstCompletionImage(first: ActivityFirstCompletion): string | unknown;
  getFirstClearFireteam(first: ActivityFirstCompletion): string | null;
  manifest: {
    getActivityIcon(referenceId: string | number, isD1: boolean): string | null;
    getActivityPgcrImage(referenceId: string | number, isD1: boolean): string | null;
  };
  assetUrl: { resolve(path: string): string };
}): ComputeAnniversariesDeps {
  return {
    selectedDate: host.selectedDate,
    selectedPlayers: host.selectedPlayers,
    getFirstEverForPlayer: (p) => host.getFirstEverForPlayer(p),
    isD1Player: (p) => host.isD1Player(p),
    getPlayerKey: (p) => host.getPlayerKey(p),
    guardianFirstsMap: host.guardianFirstsMap,
    displayedRaidDungeonFirsts: host.displayedRaidDungeonFirsts(),
    getActivityName: (activity, isD1) => host.getActivityName(activity, isD1),
    formatDate: (d) => host.formatDate(d),
    resolveIconUrl: (referenceId, isD1) => {
      const iconPath = host.manifest.getActivityIcon(referenceId, isD1);
      return iconPath ? host.assetUrl.resolve(iconPath) : null;
    },
    resolveFirstCompletionImage: (first) => {
      const img = host.getFirstCompletionImage(first);
      return typeof img === 'string' ? img : null;
    },
    resolvePgcrImageUrl: (referenceId, isD1) => {
      const pgcr = host.manifest.getActivityPgcrImage(referenceId, isD1);
      return pgcr ? host.assetUrl.resolve(pgcr) : null;
    },
    getFirstClearFireteam: (ft) => host.getFirstClearFireteam(ft),
  };
}
