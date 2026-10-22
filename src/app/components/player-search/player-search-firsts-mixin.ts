// @ts-nocheck
/** Thin firsts-tab wrappers for PlayerSearchComponent (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  build_getFirstClearElapsed, build_getFirstClearFireteam, build_getGuardianFirstsForGame, build_getGuardianFirstRaidsForGame, build_getGuardianFirstDungeonsForGame, build_hasGuardianFirstsForGame, build_getFirstCompletionImage, build_isPerCharacterExpanded, build_togglePerCharacter, build_rebuildAggregateGuardianFirstsFromMap, build_getFirstsForPlayer, build_getPlayerRaids, build_getPlayerDungeons, build_getPlayerPantheonRaids, build_getPlayerRegularRaids, build_getGroupedLegacyPantheonRaids, build_getGroupedMotPantheonRaids, build_getGroupedPantheonRaids, build_getAggregateRaids, build_getAggregateDungeons, build_getAggregateStoryMilestones, build_getPlayerStoryMilestones, build_getGroupedRaids, build_getGroupedDungeons, build_groupActivitiesByBaseName, build_groupActivitiesByBaseNamePublic, build_groupRaidsByBaseName, build_getGroupedRegularRaids, build_getGroupedRegularRaidsMulti, build_getRegularRaidSingleCards, build_getGroupedD1RaidsMulti, build_getD1RaidSingleCards, build_getAllD2RaidVariants, build_getAllD2RaidVariantsForPlayer, build_getAllD2DungeonVariants, build_getAllD2DungeonVariantsForPlayer, build_getAllD1RaidVariants, build_getAllD1RaidVariantsForPlayer, build_sortRaids, build_sortDungeons, build_onClickPerCharacterFirst, build_getDungeonSoloFirstForPlayer, build_getPlatformIconForFirst, build_getPlatformNameForFirst, build_getPlatformShortName, build_getFirstEverForPlayer, build_firstCompletionToActivityHistory, build_deriveFirstEverFromLoadedFirsts, build_computeFirstEverActivityForPlayer, build_getAggregateFirstEver, build_get_firstsSectionFilterOptions, build_showFirstsSection, build_syncActiveFirstsGameWithPlayers, build_setActiveFirstsGame, build_getAggregateRaidsByPlatform, build_getAggregateDungeonsByPlatform, build_getAggregateFirstEverByPlatform, build_onFirstsAccountCardToggle, build_getFirstsFilteredPlayers, build_getFirstsWeightForPlayer, build_getFirstsPrimaryAndSecondary, build_getFirstsComparisonGroups, build_getActivityVersion, build_getD1RaidVariantName, build_getPlayerD2RaidVariants, build_getPlayerD2DungeonVariants, build_getPlayerD1RaidVariants, build_getPlayerPantheonVariants, build_getRiteOfTheNineDungeons, build_getPlayerRiteOfTheNineVariants
} from './player-search-firsts-methods';
import {
  groupRiteOfTheNineDungeonGroups,
  type FirstsVariantRow,
} from '../../utils/firsts-variant-grouping';
import { getCharacterId } from '../../utils/character-profile';
import { buildPerCharacterFirsts } from '../../utils/per-character-firsts';
import { openExternalPgcrForFirst as openExternalPgcrForFirstUtil } from '../../utils/open-external-pgcr';
import { PantheonEventId } from '../../config/pantheon.config';
import { buildGroupedPantheonEventCards } from '../../utils/pantheon-firsts';
import { resolveFirstCompletionImageForRaid } from '../../utils/first-completion-image';
import { ActivityDbService } from '../../services/activity-db.service';
import { gameIconUrl, platformIconUrl } from '../../utils/platform-display';
import { PlayerSearchHostAdaptersMixin } from './player-search-host-adapters-mixin';

/**
 * Mixin holding firsts display wrappers so the search component stays focused
 * on search/selection orchestration.
 */
export abstract class PlayerSearchFirstsMixin extends PlayerSearchHostAdaptersMixin {
  getFirstClearElapsed(first: any, baseName?: string): string | null {
    return build_getFirstClearElapsed(this, first, baseName);
  }
  getFirstClearFireteam(first: any): string | null {
    return build_getFirstClearFireteam(this, first);
  }
  getGuardianFirstsForGame(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    return build_getGuardianFirstsForGame(this, game);
  }
  getGuardianFirstRaidsForGame(membershipId: string, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    return build_getGuardianFirstRaidsForGame(this, membershipId, game);
  }
  getGuardianFirstDungeonsForGame(membershipId: string, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    return build_getGuardianFirstDungeonsForGame(this, membershipId, game);
  }
  hasGuardianFirstsForGame(game: 'D1' | 'D2'): boolean {
    return build_hasGuardianFirstsForGame(this, game);
  }
  getFirstCompletionImage(first: ActivityFirstCompletion): string | SafeHtml | null {
    return build_getFirstCompletionImage(this, first);
  }
  isPerCharacterExpanded(player: PlayerSearchDisplay, kind: 'first-ever' | 'raid' | 'dungeon'): boolean {
    return build_isPerCharacterExpanded(this, player, kind);
  }
  togglePerCharacter(player: PlayerSearchDisplay, kind: 'first-ever' | 'raid' | 'dungeon'): void {
    return build_togglePerCharacter(this, player, kind);
  }
  protected rebuildAggregateGuardianFirstsFromMap(): void {
    return build_rebuildAggregateGuardianFirstsFromMap(this);
  }
  protected getFirstsForPlayer(player: PlayerSearchDisplay): ActivityFirstCompletion[] {
    return build_getFirstsForPlayer(this, player);
  }
  getPlayerRaids(player: PlayerSearchDisplay, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    return build_getPlayerRaids(this, player, game);
  }
  getPlayerDungeons(player: PlayerSearchDisplay, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    return build_getPlayerDungeons(this, player, game);
  }
  getPlayerPantheonRaids(player: PlayerSearchDisplay): ActivityFirstCompletion[] {
    return build_getPlayerPantheonRaids(this, player);
  }
  getPlayerRegularRaids(player: PlayerSearchDisplay, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    return build_getPlayerRegularRaids(this, player, game);
  }
  getGroupedLegacyPantheonRaids(){ return build_getGroupedLegacyPantheonRaids(this);
  }
  getGroupedMotPantheonRaids() {
    return build_getGroupedMotPantheonRaids(this);
  }
  getGroupedPantheonRaids(){ return build_getGroupedPantheonRaids(this);
  }
  getAggregateRaids(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    return build_getAggregateRaids(this, game);
  }
  getAggregateDungeons(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    return build_getAggregateDungeons(this, game);
  }
  getAggregateStoryMilestones(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    return build_getAggregateStoryMilestones(this, game);
  }
  getPlayerStoryMilestones(player: PlayerSearchDisplay, game?: 'D1' | 'D2'): ActivityFirstCompletion[] {
    return build_getPlayerStoryMilestones(this, player, game);
  }
  getGroupedRaids(game: 'D1' | 'D2') {
    return build_getGroupedRaids(this, game);
  }
  getGroupedDungeons(game: 'D1' | 'D2') {
    return build_getGroupedDungeons(this, game);
  }
  groupActivitiesByBaseNamePublic(activities: ActivityFirstCompletion[]) {
    return build_groupActivitiesByBaseNamePublic(this, activities);
  }
  getGroupedRegularRaids() {
    return build_getGroupedRegularRaids(this);
  }
  getGroupedRegularRaidsMulti() {
    return build_getGroupedRegularRaidsMulti(this);
  }
  getRegularRaidSingleCards() {
    return build_getRegularRaidSingleCards(this);
  }
  getGroupedD1RaidsMulti() {
    return build_getGroupedD1RaidsMulti(this);
  }
  getD1RaidSingleCards() {
    return build_getD1RaidSingleCards(this);
  }
  getAllD2RaidVariants(): FirstsVariantGroup[] {
    return build_getAllD2RaidVariants(this);
  }
  getAllD2RaidVariantsForPlayer(player: PlayerSearchDisplay): FirstsVariantGroup[] {
    return build_getAllD2RaidVariantsForPlayer(this, player);
  }
  getAllD2DungeonVariants(): FirstsVariantGroup[] {
    return build_getAllD2DungeonVariants(this);
  }
  getAllD2DungeonVariantsForPlayer(player: PlayerSearchDisplay): FirstsVariantGroup[] {
    return build_getAllD2DungeonVariantsForPlayer(this, player);
  }
  getAllD1RaidVariants(): FirstsVariantGroup[] {
    return build_getAllD1RaidVariants(this);
  }
  getAllD1RaidVariantsForPlayer(player: PlayerSearchDisplay): FirstsVariantGroup[] {
    return build_getAllD1RaidVariantsForPlayer(this, player);
  }
  protected sortRaids(list: ActivityFirstCompletion[], game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    return build_sortRaids(this, list, game);
  }
  protected sortDungeons(list: ActivityFirstCompletion[]): ActivityFirstCompletion[] {
    return build_sortDungeons(this, list);
  }
  onClickPerCharacterFirst(first: ActivityHistory | ActivityFirstCompletion, player: PlayerSearchDisplay): void {
    return build_onClickPerCharacterFirst(this, first, player);
  }
  getDungeonSoloFirstForPlayer(player: PlayerSearchDisplay, label: string): DungeonSoloFirst | undefined {
    return build_getDungeonSoloFirstForPlayer(this, player, label);
  }
  getPlatformIconForFirst(first: { membershipId?: string }): string {
    return build_getPlatformIconForFirst(this, first);
  }
  getPlatformNameForFirst(first: { membershipId?: string }): string {
    return build_getPlatformNameForFirst(this, first);
  }
  getPlatformShortName(platform: string): string {
    return build_getPlatformShortName(this, platform);
  }
  getFirstEverForPlayer(player: PlayerSearchDisplay): ActivityHistory | undefined {
    return build_getFirstEverForPlayer(this, player);
  }
  protected firstCompletionToActivityHistory(f: ActivityFirstCompletion): ActivityHistory {
    return build_firstCompletionToActivityHistory(this, f);
  }
  protected async computeFirstEverActivityForPlayer(player: PlayerSearchDisplay): Promise<ActivityHistory | undefined> {
    return build_computeFirstEverActivityForPlayer(this, player);
  }
  getAggregateFirstEver(game: 'D1' | 'D2'): ActivityHistory | undefined {
    return build_getAggregateFirstEver(this, game);
  }
  showFirstsSection(section: 'first-ever' | 'story' | 'pantheon-events' | 'raids' | 'dungeons'): boolean {
    return build_showFirstsSection(this, section);
  }
  syncActiveFirstsGameWithPlayers(): void {
    return build_syncActiveFirstsGameWithPlayers(this);
  }
  setActiveFirstsGame(game: 'D1' | 'D2' | string): void {
    return build_setActiveFirstsGame(this, game);
  }
  getAggregateRaidsByPlatform(game: 'D1' | 'D2', platform: string): ActivityFirstCompletion[] {
    return build_getAggregateRaidsByPlatform(this, game, platform);
  }
  getAggregateDungeonsByPlatform(game: 'D1' | 'D2', platform: string): ActivityFirstCompletion[] {
    return build_getAggregateDungeonsByPlatform(this, game, platform);
  }
  getAggregateFirstEverByPlatform(game: 'D1' | 'D2', platform: string): ActivityHistory | undefined {
    return build_getAggregateFirstEverByPlatform(this, game, platform);
  }
  onFirstsAccountCardToggle(accountKey: string): void {
    return build_onFirstsAccountCardToggle(this, accountKey);
  }
  getFirstsFilteredPlayers(): PlayerSearchDisplay[] {
    return build_getFirstsFilteredPlayers(this);
  }
  getFirstsWeightForPlayer(player: PlayerSearchDisplay): number {
    return build_getFirstsWeightForPlayer(this, player);
  }
  getFirstsPrimaryAndSecondary() {
    return build_getFirstsPrimaryAndSecondary(this);
  }
  getFirstsComparisonGroups() {
    return build_getFirstsComparisonGroups(this);
  }
  getActivityVersion(activityName: string): string {
    return build_getActivityVersion(this, activityName);
  }
  protected getD1RaidVariantName(referenceId: string, manifestName: string): string {
    return build_getD1RaidVariantName(this, referenceId, manifestName);
  }
  getPlayerD2RaidVariants(player: any): FirstsVariantGroup[] {
    return build_getPlayerD2RaidVariants(this, player);
  }
  getPlayerD2DungeonVariants(player: any): FirstsVariantGroup[] {
    return build_getPlayerD2DungeonVariants(this, player);
  }
  getPlayerD1RaidVariants(player: any): FirstsVariantGroup[] {
    return build_getPlayerD1RaidVariants(this, player);
  }
  getPlayerPantheonVariants(player: any): FirstsVariantGroup[] {
    return build_getPlayerPantheonVariants(this, player);
  }
  getRiteOfTheNineDungeons(): FirstsVariantGroup[] {
    return build_getRiteOfTheNineDungeons(this);
  }
  getPlayerRiteOfTheNineVariants(player: any): FirstsVariantGroup[] {
    return build_getPlayerRiteOfTheNineVariants(this, player);
  }

  protected groupActivitiesByBaseName(
    activities: ActivityFirstCompletion[]
  ): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    return build_groupActivitiesByBaseName(this, activities);
  }
  protected groupRaidsByBaseName(
    activities: ActivityFirstCompletion[],
    game: 'D1' | 'D2'
  ): FirstsVariantGroup[] {
    return build_groupRaidsByBaseName(this, activities, game);
  }
  protected deriveFirstEverFromLoadedFirsts(
    player: PlayerSearchDisplay,
    loadedFirsts?: ActivityFirstCompletion[]
  ): ActivityHistory | undefined {
    return build_deriveFirstEverFromLoadedFirsts(this, player, loadedFirsts);
  }
  get firstsSectionFilterOptions() {
    return build_get_firstsSectionFilterOptions(this);
  }

  getPerCharacterFirsts(player: PlayerSearchDisplay, type: 'first-ever' | 'raid' | 'dungeon') {
    const pKey = this.getPlayerKey(player);
    const charIds = (this.characters[pKey] || [])
      .map(getCharacterId)
      .filter((id): id is string => !!id);
    return buildPerCharacterFirsts({
      type,
      characterIds: charIds,
      getActivitiesForCharacter: (cid) =>
        (this.activities[`${player.membershipId}|${cid}`] || []) as ActivityHistory[],
      firstsForPlayer: this.getFirstsForPlayer(player),
      playerGame: player.game,
      playerMembershipType: player.membershipType,
      getPlatformIconUrl: (mt) => this.getPlatformIconUrl(mt),
    });
  }

  protected getExpandKey(
    player: PlayerSearchDisplay,
    kind: 'first-ever' | 'raid' | 'dungeon'
  ): string {
    return `${this.getPlayerKey(player)}|${kind}`;
  }

  getGameIconUrl(game: 'D1' | 'D2' | string): string {
    return gameIconUrl(game);
  }

  getPlatformIconUrl(membershipType: number): string {
    return platformIconUrl(membershipType);
  }

  getPlatformIconUrlForFirst(first: { membershipId?: string }): string {
    const pl =
      first && first.membershipId
        ? this.selectedPlayers.find((p) => p.membershipId === first.membershipId)
        : undefined;
    return this.getPlatformIconUrl(pl?.membershipType ?? 0);
  }

  async loadGuardianFirsts(player: PlayerSearchDisplay): Promise<void> {
    await this.guardianFirstsLoad.loadGuardianFirsts(this.asGuardianFirstsLoadHost(), player);
  }

  protected async loadDungeonSoloFirsts(player: PlayerSearchDisplay): Promise<void> {
    await this.guardianFirstsLoad.loadDungeonSoloFirsts(
      {
        setLoadingSolo: (membershipId, loading) => {
          this.loadingDungeonSoloFirsts[membershipId] = loading;
        },
        setDungeonSoloFirsts: (membershipId, data) => {
          this.dungeonSoloFirsts[membershipId] = data as any;
        },
        detectChanges: () => this.cdr.detectChanges(),
      },
      player.membershipId
    );
  }

  openExternalPGCRForFirst(first: ActivityFirstCompletion, _event?: MouseEvent) {
    openExternalPgcrForFirstUtil(
      first,
      this.activeTab,
      () => this.pgcrModalService.openPgcrLiteFromFirst(first),
      (id: string | number, d1: boolean) => this.openFullPgcrInNewTab(id, d1)
    );
  }

  getGroupedPantheonEvent(eventId: PantheonEventId): Array<{
    baseName: string;
    versions: ActivityFirstCompletion[];
    cardTitle: string;
  }> {
    return buildGroupedPantheonEventCards(
      this.aggregateGuardianFirsts,
      eventId,
      (acts) => this.groupActivitiesByBaseName(acts)
    );
  }

  getGroupedPantheonRaidsForPlayer(
    player: PlayerSearchDisplay,
    eventId: PantheonEventId = 'legacy-pantheon'
  ): Array<{
    baseName: string;
    versions: ActivityFirstCompletion[];
    cardTitle: string;
  }> {
    return buildGroupedPantheonEventCards(
      this.getFirstsForPlayer(player),
      eventId,
      (acts) => this.groupActivitiesByBaseName(acts)
    );
  }

  getFirstCompletionImageForRaid(raid: {
    baseName: string;
    variants: Array<{ hasClear: boolean; first?: ActivityFirstCompletion }>;
  }): any {
    return resolveFirstCompletionImageForRaid({
      raid,
      getFirstCompletionImage: (first) => this.getFirstCompletionImage(first),
      activityFamilyMap: (ActivityDbService as any)['ACTIVITY_FAMILY_MAP'],
      d1FamilyMap: (ActivityDbService as any)['D1_FAMILY_MAP'],
      getPgcrImage: (refId, isD1) => this.manifest.getActivityPgcrImage(refId, isD1),
      resolveAssetUrl: (path) => this.assetUrl.resolve(path),
    });
  }

  getSoloFirstForFirst(first: ActivityFirstCompletion): any {
    if (!first || !first.membershipId) return undefined;
    const player = this.selectedPlayers.find((p) => p.membershipId === first.membershipId);
    if (!player) return undefined;
    return this.getDungeonSoloFirstForPlayer(player, first.name);
  }

  getRiteOfTheNineDungeonGroups(
    variants: FirstsVariantRow[]
  ): Array<{ dungeonName: string; variants: FirstsVariantRow[] }> {
    return groupRiteOfTheNineDungeonGroups(variants);
  }

  async getFirstEverActivity(player: PlayerSearchDisplay, game: 'D1' | 'D2'): Promise<any> {
    return this.firstActivityService.getFirstEverActivity({
      membershipId: player.membershipId,
      game,
    });
  }

  async computeFirstEverActivityForSelectedPlayerFromDb(): Promise<any> {
    if (this.selectedPlayers.length === 0) return undefined;
    const player = this.selectedPlayers[0];
    return this.firstActivityService.getFirstEverActivity({
      membershipId: player.membershipId,
      game: player.game,
    });
  }

  protected async setFirstEverActivityFromDb() {
    if (this.selectedPlayers.length > 0) {
      const player = this.selectedPlayers[0];
      this.firstEverActivity = await this.firstActivityService.getFirstEverActivity({
        membershipId: player.membershipId,
        game: player.game,
      });
    } else {
      this.firstEverActivity = undefined;
    }
    this.cdr.detectChanges();
  }
}
