import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, Directive, ElementRef, HostListener, inject, Input, OnChanges, OnDestroy } from '@angular/core';
import { FIRSTS_HOST } from './firsts-host.token';
import { TextViewService } from '../../services/text-view.service';
import { ActivityFirstCompletion } from '../../models/guardian-firsts.model';
import { completedClearRows, firstTags, pageSections, yearsAgoLabel } from '../../utils/text-tab-rows';

const firstsClicks = new WeakMap<HTMLElement, { kind: string; payload: unknown; flag?: boolean }>();

@Directive({
  selector: '[dcKind]',
  standalone: true,
})
export class FirstsClickDirective implements OnChanges, OnDestroy {
  @Input() dcKind = '';
  @Input() dcPayload: unknown;
  @Input() dcFlag = false;
  private readonly el: HTMLElement;

  constructor(element: ElementRef<HTMLElement>) {
    this.el = element.nativeElement;
  }

  ngOnChanges(): void {
    firstsClicks.set(this.el, { kind: this.dcKind, payload: this.dcPayload, flag: this.dcFlag });
  }

  ngOnDestroy(): void {
    firstsClicks.delete(this.el);
  }
}

interface TextFirstRow {
  name: string;
  who: string;
  when: string;
  years: string;
  tags: string;
  first: ActivityFirstCompletion | null;
  activity?: any;
  isD1?: boolean;
}

@Component({
  selector: 'app-firsts-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, FirstsClickDirective],
  templateUrl: './firsts-tab.component.html',
  styleUrls: ['../../components/player-search/player-search-tab-shared.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class FirstsTabComponent {
  /** Host is PlayerSearchComponent today; FirstsStore later (CODE_CLEANUP_SPEC Step 4). */
  readonly ps = inject(FIRSTS_HOST);
  readonly text = inject(TextViewService);
  readonly pageSize = 40;
  textPages = 1;

  @HostListener('click', ['$event'])
  onDelegatedClick(event: MouseEvent): void {
    const el = (event.target as HTMLElement | null)?.closest?.('[dcKind]') as HTMLElement | null;
    const hit = el ? firstsClicks.get(el) : undefined;
    if (!hit) return;
    if (hit.kind === 'show-more') {
      this.showMoreTextRows();
      return;
    }
    if (hit.kind === 'game') {
      this.textPages = 1;
      this.ps.setActiveFirstsGame(hit.payload as 'D1' | 'D2');
      return;
    }
    if (hit.kind === 'account') {
      this.textPages = 1;
      this.ps.onFirstsAccountCardToggle(String(hit.payload));
      return;
    }
    if (hit.kind === 'text-first') {
      this.openFirst(hit.payload as TextFirstRow, event);
      return;
    }
    if (hit.kind === 'pgcr-first') {
      this.ps.openExternalPGCRForFirst(hit.payload as ActivityFirstCompletion, event);
      return;
    }
    if (hit.kind === 'pgcr-stored') {
      this.ps.openExternalPGCRFromStored(hit.payload as any, event);
      return;
    }
    if (hit.kind === 'pgcr') {
      this.ps.openExternalPGCR(hit.payload as any, !!hit.flag, event);
    }
  }

  showMoreTextRows(): void {
    this.textPages += 1;
  }

  /** Same completed firsts the full tab lists for the active game, without images. */
  textFirsts(): { sections: Array<{ title: string; rows: TextFirstRow[] }>; total: number; shown: number } {
    if (this.ps.loadingGuardianFirsts) {
      return { sections: [], total: 0, shown: 0 };
    }
    return pageSections(this.collectFirstSections(), this.pageSize, this.textPages);
  }

  openFirst(row: TextFirstRow, event: MouseEvent): void {
    if (row.first) {
      this.ps.openExternalPGCRForFirst(row.first, event);
      return;
    }
    if (row.activity) {
      const game = row.activity.game;
      const isD1 = game === 'D1' ? true : game === 'D2' ? false : !!row.isD1;
      this.ps.openExternalPGCR(row.activity, isD1, event);
    }
  }

  private collectFirstSections(): Array<{ title: string; rows: TextFirstRow[] }> {
    const game = this.ps.activeFirstsGame;
    if (this.ps.selectedAccountKeysForFirsts.size > 0) {
      const sections: Array<{ title: string; rows: TextFirstRow[] }> = [];
      for (const player of this.ps.getFirstsFilteredPlayers()) {
        const prefix = [player.displayName, player.platform, player.game].filter(Boolean).join(' · ');
        sections.push(...this.playerSections(player, prefix ? `${prefix} — ` : ''));
      }
      return sections.filter(section => section.rows.length);
    }
    return this.aggregateSections(game);
  }

  private aggregateSections(game: 'D1' | 'D2'): Array<{ title: string; rows: TextFirstRow[] }> {
    const sections: Array<{ title: string; rows: TextFirstRow[] }> = [];
    if (this.ps.showFirstsSection('first-ever')) {
      const first = this.earliestAcrossGames();
      sections.push({
        title: 'First ever',
        rows: first ? [this.rowFromActivity(first, first.game === 'D1')] : [],
      });
    }
    if (this.ps.showFirstsSection('story')) {
      sections.push({
        title: 'Story milestones',
        rows: (this.ps.getAggregateStoryMilestones(game) || []).map((item: ActivityFirstCompletion) => this.rowFromFirst(item)),
      });
    }
    if (game === 'D2' && this.ps.showFirstsSection('pantheon-events')) {
      sections.push({
        title: 'Pantheon',
        rows: [
          ...this.rowsFromVersions(this.ps.getGroupedLegacyPantheonRaids()),
          ...this.rowsFromVersions(this.ps.getGroupedMotPantheonRaids()),
          ...this.rowsFromRite(this.ps.getRiteOfTheNineDungeons()),
        ],
      });
    }
    if (this.ps.showFirstsSection('raids')) {
      const raids = game === 'D1' ? this.ps.getAllD1RaidVariants() : this.ps.getAllD2RaidVariants();
      sections.push({ title: `${game} raids`, rows: this.rowsFromVariants(raids) });
    }
    if (game === 'D2' && this.ps.showFirstsSection('dungeons')) {
      sections.push({ title: 'D2 dungeons', rows: this.rowsFromVariants(this.ps.getAllD2DungeonVariants(), true) });
    }
    return this.withCounts(sections);
  }

  private playerSections(player: any, prefix: string): Array<{ title: string; rows: TextFirstRow[] }> {
    const game = player.game as 'D1' | 'D2';
    const sections: Array<{ title: string; rows: TextFirstRow[] }> = [];
    if (this.ps.showFirstsSection('first-ever')) {
      const first = this.ps.getFirstEverForPlayer(player);
      sections.push({
        title: `${prefix}First ever`,
        rows: first ? [this.rowFromActivity(first, game === 'D1')] : [],
      });
    }
    if (this.ps.showFirstsSection('story')) {
      sections.push({
        title: `${prefix}Story milestones`,
        rows: (this.ps.getPlayerStoryMilestones(player, game) || []).map((item: ActivityFirstCompletion) => this.rowFromFirst(item)),
      });
    }
    if (game === 'D2' && this.ps.showFirstsSection('pantheon-events')) {
      sections.push({
        title: `${prefix}Pantheon`,
        rows: [
          ...this.rowsFromVersions(this.ps.getGroupedPantheonRaidsForPlayer(player, 'legacy-pantheon')),
          ...this.rowsFromVersions(this.ps.getGroupedPantheonRaidsForPlayer(player, 'mot-pantheon')),
          ...this.rowsFromRite(this.ps.getPlayerRiteOfTheNineVariants(player)),
        ],
      });
    }
    if (this.ps.showFirstsSection('raids')) {
      const raids = game === 'D1' ? this.ps.getPlayerD1RaidVariants(player) : this.ps.getPlayerD2RaidVariants(player);
      sections.push({
        title: `${prefix}${game} raids`,
        rows: this.rowsFromVariants(raids),
      });
    }
    if (game === 'D2' && this.ps.showFirstsSection('dungeons')) {
      sections.push({
        title: `${prefix}D2 dungeons`,
        rows: this.rowsFromVariants(this.ps.getPlayerD2DungeonVariants(player), true),
      });
    }
    return this.withCounts(sections);
  }

  private withCounts(sections: Array<{ title: string; rows: TextFirstRow[] }>): Array<{ title: string; rows: TextFirstRow[] }> {
    return sections
      .filter(section => section.rows.length)
      .map(section => ({ ...section, title: `${section.title} (${section.rows.length})` }));
  }

  private rowsFromVariants(
    items: Array<{ baseName: string; variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean }> }>,
    solo = false
  ): TextFirstRow[] {
    const shaped = items.map(item => ({
      baseName: item.baseName,
      variants: item.variants.map(variant => ({
        version: variant.version,
        hasClear: variant.hasClear,
        when: variant.first?.completionDate || variant.first?.period,
        tags: this.tagsFor(variant.first, solo),
      })),
    }));
    return completedClearRows(shaped).map(row => {
      const first = this.findFirst(items, row.name);
      return {
        ...row,
        years: yearsAgoLabel(row.when),
        first,
        who: first ? this.whoFor(first.membershipId, first.game) : '',
      };
    });
  }

  private findFirst(
    items: Array<{ baseName: string; variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean }> }>,
    name: string
  ): ActivityFirstCompletion | null {
    for (const item of items) {
      for (const variant of item.variants) {
        if (!variant.hasClear || !variant.first) {
          continue;
        }
        const version = variant.version && variant.version !== 'Normal' ? `: ${variant.version}` : '';
        if (`${item.baseName}${version}` === name) {
          return variant.first;
        }
      }
    }
    return null;
  }

  private rowsFromVersions(groups: Array<{ baseName: string; versions: ActivityFirstCompletion[]; cardTitle?: string }>): TextFirstRow[] {
    const rows: TextFirstRow[] = [];
    for (const group of groups || []) {
      for (const first of group.versions || []) {
        rows.push(this.rowFromFirst(first));
      }
    }
    return rows;
  }

  private rowsFromRite(groups: any[]): TextFirstRow[] {
    const rows: TextFirstRow[] = [];
    for (const rite of groups || []) {
      for (const dungeon of this.ps.getRiteOfTheNineDungeonGroups(rite.variants || [])) {
        for (const variant of dungeon.variants || []) {
          if (!variant.hasClear || !variant.first) {
            continue;
          }
          rows.push(this.rowFromFirst(variant.first));
        }
      }
    }
    return rows;
  }

  /** Lifetime first across every selected account, D1 and D2. */
  private earliestAcrossGames(): any {
    const candidates = [
      this.ps.getAggregateFirstEver('D1'),
      this.ps.getAggregateFirstEver('D2'),
    ].filter(Boolean) as Array<{ period?: string; game?: string }>;
    candidates.sort((a, b) => new Date(a.period || 0).getTime() - new Date(b.period || 0).getTime());
    return candidates[0];
  }

  private whoFor(membershipId?: string, game?: string): string {
    const match = (this.ps.selectedPlayers || []).find((player: { membershipId: string; game?: string; displayName?: string; platform?: string }) =>
      String(player.membershipId) === String(membershipId || '') && (!game || player.game === game)
    );
    if (!match) {
      return game || '';
    }
    return [match.displayName, match.platform, match.game].filter(Boolean).join(' · ');
  }

  private rowFromActivity(activity: any, isD1: boolean): TextFirstRow {
    const game = activity?.game === 'D1' || activity?.game === 'D2' ? activity.game : (isD1 ? 'D1' : 'D2');
    const d1 = game === 'D1';
    const who = this.whoFor(activity?.membershipId, game);
    if (activity && !activity.displayName) {
      const match = (this.ps.selectedPlayers || []).find((player: { membershipId: string; game?: string; displayName?: string }) =>
        String(player.membershipId) === String(activity.membershipId || '') && player.game === game
      );
      if (match) {
        activity.displayName = match.displayName;
      }
    }
    const when = String(activity?.period || '').slice(0, 10);
    return {
      name: this.ps.getActivityName(activity, d1),
      who,
      when,
      years: yearsAgoLabel(activity?.period),
      tags: '-',
      first: null,
      activity,
      isD1: d1,
    };
  }

  private rowFromFirst(first: ActivityFirstCompletion, solo = false): TextFirstRow {
    const when = String(first.completionDate || first.period || '').slice(0, 10);
    return {
      name: first.name,
      who: this.whoFor(first.membershipId, first.game),
      when,
      years: yearsAgoLabel(first.completionDate || first.period),
      tags: this.tagsFor(first, solo),
      first,
      isD1: first.game === 'D1',
    };
  }

  private tagsFor(first: ActivityFirstCompletion | undefined, solo: boolean): string {
    if (!first) {
      return '-';
    }
    const extra = solo ? this.ps.getSoloFirstForFirst(first) : null;
    const bits = [
      firstTags({
        isSolo: !!first.isSolo || !!extra?.firstSolo,
        isFlawless: !!first.isFlawless || !!extra?.firstFlawless,
        isSoloFlawless: !!first.isSoloFlawless,
      }),
    ];
    const elapsed = this.ps.getFirstClearElapsed(first);
    if (elapsed) bits.push(elapsed);
    const fireteam = this.ps.getFirstClearFireteam(first);
    if (fireteam) bits.push(fireteam);
    return bits.filter(bit => bit && bit !== '-').join(' · ') || '-';
  }
}
