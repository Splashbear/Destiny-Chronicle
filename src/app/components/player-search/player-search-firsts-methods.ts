// @ts-nocheck
/** Firsts-tab display / grouping helpers extracted from PlayerSearchComponent (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { getFirstClearElapsedLabel, formatFirstClearFireteam } from '../../utils/first-clear-elapsed';
import { aggregateGuardianFirstsFromLists } from '../../utils/guardian-firsts-dedupe';
import { resolveActivityPgcrImage } from '../../utils/activity-pgcr-image';
import { buildGroupedPantheonEventCards, filterPantheonEventFirsts } from '../../utils/pantheon-firsts';
import { earliestFirstsByName } from '../../utils/earliest-firsts-by-name';
import { getStoryAnchorSortOrder } from '../../config/story-first-missions';
import { isAnyPantheonActivity } from '../../config/pantheon.config';
import {
  earliestFirstEverForPlatformPlayers,
  earliestFirstsForPlatformPlayers,
} from '../../utils/aggregate-firsts-by-platform';
import { findDungeonSoloFirstForLabel } from '../../utils/dungeon-solo-lookup';
import { platformShortName } from '../../utils/platform-display';
import { baseActivityNameFromVersioned } from '../../utils/date-activity-grouping';
import { filterBySelectedAccountKeys, toggleInSet } from '../../utils/selection-set';
import { pickFirstEverFromFirsts } from '../../utils/first-ever-from-firsts';
import {
  buildD2VariantGroups,
  D2_DUNGEON_VARIANT_DEFS,
  D2_RAID_VARIANT_DEFS,
  isRiteOfTheNineDungeonName,
  normalizeDesertPerpetualName,
} from '../../utils/d2-activity-variants';
import {
  buildRiteOfTheNineCard,
  filterRiteOfTheNineFirsts,
  groupActivitiesByBaseName as groupFirstsByBaseName,
  groupRaidsByBaseName as groupFirstsRaidsByBaseName,
  groupRiteOfTheNineDungeonGroups,
  sortDungeonsByReleaseOrder,
  sortRaidsByReleaseOrder,
} from '../../utils/firsts-variant-grouping';
import {
  buildD1RaidVariantGroups,
  d1RaidVariantName,
  D1_RAID_VARIANT_DEFS_AGGREGATE,
  D1_RAID_VARIANT_DEFS_PER_PLAYER,
} from '../../utils/d1-raid-variants';
import { sortGroupsByReleaseOrder } from '../../config/raid-dungeon-release-order';
import { getCharacterId } from '../../utils/character-profile';


export function build_getFirstClearElapsed(c: any, first: any, baseName?: string): string | null {
  return getFirstClearElapsedLabel(first, {
    baseName,
    resolveActivityName: (f, isD1) => c.getActivityName(f, isD1),
  });
}

export function build_getFirstClearFireteam(c: any, first: any): string | null {
  return formatFirstClearFireteam(first);
}

export function build_getGuardianFirstsForGame(c: any, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
  // Only show raids and dungeons
  return c.guardianFirsts.filter(f => f.game === game && (f.type === 'raid' || f.type === 'dungeon'));
}

export function build_getGuardianFirstRaidsForGame(c: any, membershipId: string, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
  const firsts = c.guardianFirstsMap[membershipId] || [];
  const raids = firsts.filter(
    (f: ActivityFirstCompletion) => f.type === 'raid' && f.game === game
  );
  return sortRaidsByReleaseOrder(raids, game);
}

export function build_getGuardianFirstDungeonsForGame(c: any, membershipId: string, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
  if (game === 'D1') return [];
  const firsts = c.guardianFirstsMap[membershipId] || [];
  const dungeons = firsts.filter(
    (f: ActivityFirstCompletion) => f.type === 'dungeon' && f.game === game
  );
  return sortDungeonsByReleaseOrder(dungeons);
}

export function build_hasGuardianFirstsForGame(c: any, game: 'D1' | 'D2'): boolean {
  return c.guardianFirsts.some(f => f.game === game);
}

export function build_getFirstCompletionImage(c: any, first: ActivityFirstCompletion): string | SafeHtml | null {
  if (!first) return null;
  return resolveActivityPgcrImage({
    referenceId: first.referenceId,
    isD1: first.game === 'D1',
    getPgcrImage: (ref, d1) => c.manifest.getActivityPgcrImage(ref, d1),
    resolveAssetUrl: (path) => c.assetUrl.resolve(path),
  });
}

export function build_isPerCharacterExpanded(c: any, player: PlayerSearchDisplay, kind: 'first-ever' | 'raid' | 'dungeon'): boolean {
  return !!c.perCharacterExpanded[c.getExpandKey(player, kind)];
}

export function build_togglePerCharacter(c: any, player: PlayerSearchDisplay, kind: 'first-ever' | 'raid' | 'dungeon'): void {
  const key = c.getExpandKey(player, kind);
  c.perCharacterExpanded[key] = !c.perCharacterExpanded[key];
  c.cdr.detectChanges();
}

export function build_rebuildAggregateGuardianFirstsFromMap(c: any): void {
  c.aggregateGuardianFirsts = aggregateGuardianFirstsFromLists(
    Object.values(c.guardianFirstsMap)
  );
  c.guardianFirsts = c.aggregateGuardianFirsts;
}

export function build_getFirstsForPlayer(c: any, player: PlayerSearchDisplay): ActivityFirstCompletion[] {
  return c.guardianFirstsMap[c.getPlayerKey(player)] || [];
}

export function build_getPlayerRaids(c: any, player: PlayerSearchDisplay, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
  const list = c.getFirstsForPlayer(player).filter(f => f.type === 'raid' && f.game === game);
  return c.sortRaids(list, game);
}

export function build_getPlayerDungeons(c: any, player: PlayerSearchDisplay, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
  const list = c.getFirstsForPlayer(player).filter(f => f.type === 'dungeon' && f.game === game);
  if (game === 'D1') return [];
  return c.sortDungeons(list);
}

export function build_getPlayerPantheonRaids(c: any, player: PlayerSearchDisplay): ActivityFirstCompletion[] {
  return filterPantheonEventFirsts(c.getFirstsForPlayer(player), 'legacy-pantheon');
}

export function build_getPlayerRegularRaids(c: any, player: PlayerSearchDisplay, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
  const list = c.getFirstsForPlayer(player).filter(f =>
    f.type === 'raid' && f.game === game &&
    (game !== 'D2' || !isAnyPantheonActivity(f.referenceId, f.name))
  );
  return c.sortRaids(list, game);
}

export function build_getGroupedLegacyPantheonRaids(c: any): Array<{ baseName: string; versions: ActivityFirstCompletion[]; cardTitle: string }> {
  return c.getGroupedPantheonEvent('legacy-pantheon');
}

export function build_getGroupedMotPantheonRaids(c: any): Array<{ baseName: string; versions: ActivityFirstCompletion[]; cardTitle: string }> {
  return c.getGroupedPantheonEvent('mot-pantheon');
}

export function build_getGroupedPantheonRaids(c: any): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
  return c.getGroupedLegacyPantheonRaids();
}

export function build_getAggregateRaids(c: any, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
  const raids = c.aggregateGuardianFirsts.filter(f => f.game === game && f.type === 'raid');
  const filteredRaids =
    game === 'D2'
      ? raids.filter((r) => !isAnyPantheonActivity(r.referenceId, r.name))
      : raids;
  return c.sortRaids(earliestFirstsByName(filteredRaids), game);
}

export function build_getAggregateDungeons(c: any, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
  const dungeonFirsts = c.aggregateGuardianFirsts.filter(f => f.game === game && f.type === 'dungeon');
  const filteredDungeons =
    game === 'D2'
      ? dungeonFirsts.filter((d) => !isRiteOfTheNineDungeonName(d.name))
      : dungeonFirsts;
  const earliest = earliestFirstsByName(filteredDungeons);
  return c.sortDungeons(earliest);
}

export function build_getAggregateStoryMilestones(c: any, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
  return c.aggregateGuardianFirsts
    .filter((f) => f.game === game && f.type === 'story')
    .sort((a, b) => getStoryAnchorSortOrder(a.storyReleaseId) - getStoryAnchorSortOrder(b.storyReleaseId));
}

export function build_getPlayerStoryMilestones(c: any, player: PlayerSearchDisplay, game?: 'D1' | 'D2'): ActivityFirstCompletion[] {
  const g: 'D1' | 'D2' =
    game === 'D1' || game === 'D2' ? game : c.isD1Player(player) ? 'D1' : 'D2';
  return c.getFirstsForPlayer(player)
    .filter((f) => f.game === g && f.type === 'story')
    .sort((a, b) => getStoryAnchorSortOrder(a.storyReleaseId) - getStoryAnchorSortOrder(b.storyReleaseId));
}

export function build_getGroupedRaids(c: any, game: 'D1' | 'D2'): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
  const raids = c.getAggregateRaids(game);
  return c.groupActivitiesByBaseName(raids);
}

export function build_getGroupedDungeons(c: any, game: 'D1' | 'D2'): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
  const dungeons = c.getAggregateDungeons(game);
  return c.groupActivitiesByBaseName(dungeons);
}

export function build_groupActivitiesByBaseName(
  c: any,
  activities: ActivityFirstCompletion[]
): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
  return groupFirstsByBaseName(activities, {
    getBaseName: (n) => baseActivityNameFromVersioned(n),
    getVersion: (n) => c.getActivityVersion(n),
  });
}

export function build_groupActivitiesByBaseNamePublic(c: any, activities: ActivityFirstCompletion[]): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
  return c.groupActivitiesByBaseName(activities);
}

export function build_groupRaidsByBaseName(
  c: any,
  activities: ActivityFirstCompletion[],
  game: 'D1' | 'D2'
) {
  return groupFirstsRaidsByBaseName(activities, game, (ref, isD1) =>
    c.manifest.getActivityName(ref, isD1)
  );
}

export function build_getGroupedRegularRaids(c: any): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
  const allRaids = c.getAggregateRaids('D2');
  return c.groupActivitiesByBaseName(allRaids);
}

export function build_getGroupedRegularRaidsMulti(c: any): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
  return c.getGroupedRegularRaids().filter(group => (group.versions?.length || 0) > 1);
}

export function build_getRegularRaidSingleCards(c: any): Array<{ baseName: string; first: ActivityFirstCompletion }> {
  return c.getGroupedRegularRaids()
    .filter(group => (group.versions?.length || 0) === 1)
    .map(group => ({ baseName: group.baseName, first: group.versions[0] }));
}

export function build_getGroupedD1RaidsMulti(c: any): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
  return c.getGroupedRaids('D1').filter(group => (group.versions?.length || 0) > 1);
}

export function build_getD1RaidSingleCards(c: any): Array<{ baseName: string; first: ActivityFirstCompletion }> {
  return c.getGroupedRaids('D1')
    .filter(group => (group.versions?.length || 0) === 1)
    .map(group => ({ baseName: group.baseName, first: group.versions[0] }));
}

export function build_getAllD2RaidVariants(c: any): FirstsVariantGroup[] {
  return buildD2VariantGroups(c.getAggregateRaids('D2'), D2_RAID_VARIANT_DEFS, 'raid', {
    getBaseName: (n) => baseActivityNameFromVersioned(n),
    getVersion: (n) => c.getActivityVersion(n),
    normalizeName: normalizeDesertPerpetualName,
  });
}

export function build_getAllD2RaidVariantsForPlayer(c: any, player: PlayerSearchDisplay): FirstsVariantGroup[] {
  const all = c.getFirstsForPlayer(player).filter(
    f => f.type === 'raid' && f.game === 'D2' && !isAnyPantheonActivity(f.referenceId, f.name)
  );
  return buildD2VariantGroups(all, D2_RAID_VARIANT_DEFS, 'raid', {
    getBaseName: (n) => baseActivityNameFromVersioned(n),
    getVersion: (n) => c.getActivityVersion(n),
    normalizeName: normalizeDesertPerpetualName,
  });
}

export function build_getAllD2DungeonVariants(c: any): FirstsVariantGroup[] {
  const allDungeons = c.getAggregateDungeons('D2').filter(
    d => !isRiteOfTheNineDungeonName(d.name)
  );
  return buildD2VariantGroups(allDungeons, D2_DUNGEON_VARIANT_DEFS, 'dungeon', {
    getBaseName: (n) => baseActivityNameFromVersioned(n),
    getVersion: (n) => c.getActivityVersion(n),
  });
}

export function build_getAllD2DungeonVariantsForPlayer(c: any, player: PlayerSearchDisplay): FirstsVariantGroup[] {
  const all = c.getFirstsForPlayer(player).filter(
    f => f.type === 'dungeon' && f.game === 'D2' && !isRiteOfTheNineDungeonName(f.name)
  );
  return buildD2VariantGroups(all, D2_DUNGEON_VARIANT_DEFS, 'dungeon', {
    getBaseName: (n) => baseActivityNameFromVersioned(n),
    getVersion: (n) => c.getActivityVersion(n),
  });
}

export function build_getAllD1RaidVariants(c: any): FirstsVariantGroup[] {
  return buildD1RaidVariantGroups(
    c.getAggregateRaids('D1'),
    D1_RAID_VARIANT_DEFS_AGGREGATE,
    {
      getBaseName: (n) => baseActivityNameFromVersioned(n),
      getVersion: (ref, name) => c.getD1RaidVariantName(ref, name),
      keepEarliest: true,
      sortByReleaseOrder: true,
    }
  );
}

export function build_getAllD1RaidVariantsForPlayer(c: any, player: PlayerSearchDisplay): FirstsVariantGroup[] {
  const all = c.getFirstsForPlayer(player).filter(f => f.type === 'raid' && f.game === 'D1');
  return buildD1RaidVariantGroups(all, D1_RAID_VARIANT_DEFS_PER_PLAYER, {
    getBaseName: (n) => baseActivityNameFromVersioned(n),
    getVersion: (ref, name) => c.getD1RaidVariantName(ref, name),
    keepEarliest: false,
    sortByReleaseOrder: false,
  });
}

export function build_sortRaids(c: any, list: ActivityFirstCompletion[], game: 'D1' | 'D2'): ActivityFirstCompletion[] {
  return sortRaidsByReleaseOrder(list, game);
}

export function build_sortDungeons(c: any, list: ActivityFirstCompletion[]): ActivityFirstCompletion[] {
  return sortDungeonsByReleaseOrder(list, {
    getBaseName: (n) => baseActivityNameFromVersioned(n),
    getVersion: (n) => {
      const i = n.indexOf(': ');
      return i === -1 ? 'Normal' : n.substring(i + 2);
    },
  });
}

export function build_onClickPerCharacterFirst(c: any, first: ActivityHistory | ActivityFirstCompletion, player: PlayerSearchDisplay): void {
  const anyFirst: any = first as any;
  if (anyFirst && anyFirst.instanceId && (anyFirst.completionDate || anyFirst.type)) {
    // Looks like ActivityFirstCompletion
    c.openExternalPGCRForFirst(anyFirst as ActivityFirstCompletion);
    return;
  }
  // Fallback as ActivityHistory
  c.openExternalPGCR(first as ActivityHistory, c.isD1Player(player));
}

export function build_getDungeonSoloFirstForPlayer(c: any, player: PlayerSearchDisplay, label: string): DungeonSoloFirst | undefined {
  return findDungeonSoloFirstForLabel(c.dungeonSoloFirsts[player.membershipId], label);
}

export function build_getPlatformIconForFirst(c: any, first: { membershipId?: string }): string {
  const pl = first && first.membershipId ? c.selectedPlayers.find(p => p.membershipId === first.membershipId) : undefined;
  return c.getPlatformIconUrl(pl?.membershipType ?? 0);
}

export function build_getPlatformNameForFirst(c: any, first: { membershipId?: string }): string {
  const pl = first && first.membershipId ? c.selectedPlayers.find(p => p.membershipId === first.membershipId) : undefined;
  return pl?.platform || '';
}

export function build_getPlatformShortName(c: any, platform: string): string {
  return platformShortName(platform);
}

export function build_getFirstEverForPlayer(c: any, player: PlayerSearchDisplay): ActivityHistory | undefined {
  const key = c.getPlayerKey(player);
  const cached = c.firstEverActivities[key];
  if (cached) return cached;
  const derived = c.deriveFirstEverFromLoadedFirsts(player);
  if (derived) {
    c.firstEverActivities[key] = derived;
    c.firstEverActivities = { ...c.firstEverActivities };
  }
  return derived;
}

export function build_firstCompletionToActivityHistory(c: any, f: ActivityFirstCompletion): ActivityHistory {
  return {
    period: f.completionDate || f.period,
    activityDetails: {
      referenceId: String(f.referenceId ?? ''),
      instanceId: String(f.instanceId ?? ''),
      mode: f.mode ?? 0
    },
    values: {
      completed: { basic: { value: f.completed ? 1 : 0 } }
    },
    game: f.game,
    membershipType: f.membershipType,
    characterClass: f.characterClass,
    membershipId: f.membershipId,
    name: f.name
  } as ActivityHistory;
}

export function build_deriveFirstEverFromLoadedFirsts(
  c: any,
  player: PlayerSearchDisplay,
  loadedFirsts?: ActivityFirstCompletion[]
): ActivityHistory | undefined {
  const game = c.isD1Player(player) ? 'D1' : 'D2';
  const list = loadedFirsts ?? c.guardianFirstsMap[c.getPlayerKey(player)] ?? [];
  const earliest = pickFirstEverFromFirsts(list, game);
  return earliest ? c.firstCompletionToActivityHistory(earliest) : undefined;
}

export async function build_computeFirstEverActivityForPlayer(
  c: any,
  player: PlayerSearchDisplay
): Promise<ActivityHistory | undefined> {
  const game = c.isD1Player(player) ? 'D1' : 'D2';
  const scopedCharIds = (c.characters[c.getPlayerKey(player)] || [])
    .map(getCharacterId)
    .filter((id): id is string => !!id)
    .map(String);
  let first = await c.firstActivityService.getFirstEverActivity(
    { membershipId: player.membershipId, game, characterIds: scopedCharIds },
    true
  );
  if (!first && scopedCharIds.length > 0) {
    first = await c.firstActivityService.getFirstEverActivity(
      { membershipId: player.membershipId, game },
      true
    );
  }
  return first;
}

export function build_getAggregateFirstEver(c: any, game: 'D1' | 'D2'): ActivityHistory | undefined {
  const firsts: ActivityHistory[] = [];
  for (const pl of c.selectedPlayers) {
    const isD1 = c.isD1Player(pl);
    if ((game === 'D1' && !isD1) || (game === 'D2' && isD1)) continue;
    const first = c.getFirstEverForPlayer(pl);
    if (first) firsts.push(first);
  }
  if (firsts.length === 0) return undefined;
  return firsts.sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime())[0];
}

export function build_get_firstsSectionFilterOptions(c: any): { value: string; label: string }[] {
  const base: { value: string; label: string }[] = [
    { value: 'all', label: 'All sections' },
    { value: 'first-ever', label: 'First ever only' },
    { value: 'story', label: 'Story milestones only' },
  ];
  if (c.activeFirstsGame === 'D2') {
    base.push({ value: 'pantheon-events', label: 'Pantheon Events only' });
    base.push({ value: 'raids', label: 'Raids only' });
    base.push({ value: 'dungeons', label: 'Dungeons only' });
  } else {
    base.push({ value: 'raids', label: 'Raids only' });
  }
  return base;
}

export function build_showFirstsSection(c: any, section: 'first-ever' | 'story' | 'pantheon-events' | 'raids' | 'dungeons'): boolean {
  return c.firstsSectionFilter === 'all' || c.firstsSectionFilter === section;
}

export function build_syncActiveFirstsGameWithPlayers(c: any): void {
  if (c.selectedPlayers.length === 0) return;
  const allD1 = c.selectedPlayers.every((p) => c.isD1Player(p));
  const allD2 = c.selectedPlayers.every((p) => !c.isD1Player(p));
  if (allD1) {
    c.activeFirstsGame = 'D1';
    if (c.firstsSectionFilter === 'dungeons') {
      c.firstsSectionFilter = 'all';
    }
  } else if (allD2) {
    c.activeFirstsGame = 'D2';
  }
}

export function build_setActiveFirstsGame(c: any, game: 'D1' | 'D2' | string): void {
  // Accept string from template and coerce to union
  if (game !== 'D1' && game !== 'D2') {
    return;
  }
  if (c.activeFirstsGame !== game) {
    c.activeFirstsGame = game;
    c.activeFirstsTab = 'all';
    if (game === 'D1' && c.firstsSectionFilter === 'dungeons') {
      c.firstsSectionFilter = 'all';
    }
    c.updatePlatformTabs();
    c.cdr.detectChanges();
  }
}

export function build_getAggregateRaidsByPlatform(c: any, game: 'D1' | 'D2', platform: string): ActivityFirstCompletion[] {
  const perPlatform = earliestFirstsForPlatformPlayers(
    c.selectedPlayers,
    platform,
    (player) => {
      const matches =
        (game === 'D1' && c.isD1Player(player as PlayerSearchDisplay)) ||
        (game === 'D2' && !c.isD1Player(player as PlayerSearchDisplay));
      return matches
        ? c.getPlayerRaids(player as PlayerSearchDisplay, game)
        : [];
    }
  );
  return c.sortRaids(perPlatform, game);
}

export function build_getAggregateDungeonsByPlatform(c: any, game: 'D1' | 'D2', platform: string): ActivityFirstCompletion[] {
  const perPlatform = earliestFirstsForPlatformPlayers(
    c.selectedPlayers,
    platform,
    (player) =>
      game === 'D2' && !c.isD1Player(player as PlayerSearchDisplay)
        ? c.getPlayerDungeons(player as PlayerSearchDisplay, game)
        : []
  );
  return c.sortDungeons(perPlatform);
}

export function build_getAggregateFirstEverByPlatform(c: any, game: 'D1' | 'D2', platform: string): ActivityHistory | undefined {
  return earliestFirstEverForPlatformPlayers(
    c.selectedPlayers,
    platform,
    (player) => {
      const isD1 = c.isD1Player(player);
      return (game === 'D1' && isD1) || (game === 'D2' && !isD1);
    },
    (player) => c.getFirstEverForPlayer(player)
  );
}

export function build_onFirstsAccountCardToggle(c: any, accountKey: string): void {
  c.selectedAccountKeysForFirsts = toggleInSet(
    c.selectedAccountKeysForFirsts,
    accountKey
  );
  c.cdr.markForCheck();
}

export function build_getFirstsFilteredPlayers(c: any): PlayerSearchDisplay[] {
  return filterBySelectedAccountKeys(
    c.selectedPlayers,
    c.selectedAccountKeysForFirsts,
    (p) => c.getAccountKeyForPlayer(p)
  );
}

export function build_getFirstsWeightForPlayer(c: any, player: PlayerSearchDisplay): number {
  if (!player) return 0;
  const list = c.guardianFirstsMap[c.getPlayerKey(player)] || [];
  return list.length;
}

export function build_getFirstsPrimaryAndSecondary(c: any): { primary: PlayerSearchDisplay | null; secondary: PlayerSearchDisplay[] } {
  const players = c.getFirstsFilteredPlayers();
  if (!players.length) {
    return { primary: null, secondary: [] };
  }
  const sorted = [...players].sort((a, b) => c.getFirstsWeightForPlayer(b) - c.getFirstsWeightForPlayer(a));
  const [primary, ...secondary] = sorted;
  return { primary, secondary };
}

export function build_getFirstsComparisonGroups(c: any): Array<{ game: 'D1' | 'D2'; players: PlayerSearchDisplay[] }> {
  const players = c.getFirstsFilteredPlayers();
  if (!players.length) return [];

  const byGame = new Map<'D1' | 'D2', PlayerSearchDisplay[]>();
  for (const p of players) {
    const game: 'D1' | 'D2' = p.game || 'D2';
    if (!byGame.has(game)) {
      byGame.set(game, []);
    }
    byGame.get(game)!.push(p);
  }

  const gameOrder: Array<'D1' | 'D2'> = ['D2', 'D1'];
  const result: Array<{ game: 'D1' | 'D2'; players: PlayerSearchDisplay[] }> = [];

  for (const game of gameOrder) {
    const groupPlayers = byGame.get(game);
    if (!groupPlayers || groupPlayers.length === 0) continue;

    const sortedPlayers = [...groupPlayers].sort((a, b) => {
      const platformA = a.platform || c.getPlatformName(a.membershipType);
      const platformB = b.platform || c.getPlatformName(b.membershipType);
      const platformCompare = platformA.localeCompare(platformB);
      if (platformCompare !== 0) return platformCompare;
      return a.displayName.localeCompare(b.displayName);
    });

    result.push({ game, players: sortedPlayers });
  }

  return result;
}

export function build_getActivityVersion(c: any, activityName: string): string {
  const colonIndex = activityName.indexOf(': ');
  if (colonIndex === -1) {
    return 'Standard'; // Default for activities without version
  }
  return activityName.substring(colonIndex + 2);
}

export function build_getD1RaidVariantName(c: any, referenceId: string, manifestName: string): string {
  return d1RaidVariantName(referenceId, manifestName);
}

export function build_getPlayerD2RaidVariants(c: any, player: any): FirstsVariantGroup[] {
  const raids = c.getPlayerRaids(player, 'D2').filter(
    (raid) => !raid.name.includes('Pantheon')
  );
  return sortGroupsByReleaseOrder(c.groupRaidsByBaseName(raids, 'D2'), 'D2', 'raid');
}

export function build_getPlayerD2DungeonVariants(c: any, player: any): FirstsVariantGroup[] {
  const dungeons = c.getPlayerDungeons(player, 'D2').filter(
    (dungeon) => !isRiteOfTheNineDungeonName(dungeon.name)
  );
  return sortGroupsByReleaseOrder(
    c.groupRaidsByBaseName(dungeons, 'D2'),
    'D2',
    'dungeon'
  );
}

export function build_getPlayerD1RaidVariants(c: any, player: any): FirstsVariantGroup[] {
  return sortGroupsByReleaseOrder(
    c.groupRaidsByBaseName(c.getPlayerRaids(player, 'D1'), 'D1'),
    'D1',
    'raid'
  );
}

export function build_getPlayerPantheonVariants(c: any, player: any): FirstsVariantGroup[] {
  const pantheonRaids = c.getPlayerRaids(player, 'D2').filter((raid) =>
    raid.name.includes('Pantheon')
  );
  return c.groupRaidsByBaseName(pantheonRaids, 'D2');
}

export function build_getRiteOfTheNineDungeons(c: any): FirstsVariantGroup[] {
  const allDungeonFirsts = c.aggregateGuardianFirsts.filter(
    (f) => f.game === 'D2' && f.type === 'dungeon'
  );
  const dungeons = filterRiteOfTheNineFirsts(earliestFirstsByName(allDungeonFirsts));
  return buildRiteOfTheNineCard(dungeons, (ref, isD1) =>
    c.manifest.getActivityName(ref, isD1)
  );
}

export function build_getPlayerRiteOfTheNineVariants(c: any, player: any): FirstsVariantGroup[] {
  const dungeons = filterRiteOfTheNineFirsts(c.getPlayerDungeons(player, 'D2'));
  return buildRiteOfTheNineCard(dungeons, (ref, isD1) =>
    c.manifest.getActivityName(ref, isD1)
  );
}

