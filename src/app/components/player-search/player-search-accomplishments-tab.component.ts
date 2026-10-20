import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { DestinyLoaderComponent } from '../destiny-loader/destiny-loader.component';
import { AccountCardGridComponent } from '../account-card-grid/account-card-grid.component';
import { PlayerSearchComponent } from './player-search.component';
import { TextViewService } from '../../services/text-view.service';
import { AccomplishmentsMedalsService } from '../../services/accomplishments-medals.service';
import { AccountMedalsResult, MedalModeGroupId } from '../../models/accomplishments-medals.model';
import { pageSections } from '../../utils/text-tab-rows';
import { PlayerSearchDisplay } from '../../models/player-search-display.model';

@Component({
  selector: 'app-player-search-accomplishments-tab',
  standalone: true,
  imports: [CommonModule, DestinyLoaderComponent, AccountCardGridComponent],
  templateUrl: './player-search-accomplishments-tab.component.html',
  styleUrls: ['./player-search-tab-shared.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerSearchAccomplishmentsTabComponent implements OnInit {
  readonly ps = inject(PlayerSearchComponent);
  readonly text = inject(TextViewService);
  private readonly medals = inject(AccomplishmentsMedalsService);
  private readonly cdr = inject(ChangeDetectorRef);

  loading = false;
  asOf: string | null = null;
  /** Active mode filter; null = all groups. */
  activeMode: MedalModeGroupId | null = null;
  /** Paginate full-view rows for weaker devices. */
  readonly pageSize = 48;
  visibleCount = 48;
  textPages = 1;

  /** membershipKey → result */
  results: Record<string, AccountMedalsResult> = {};

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const players = this.ps.getAccomplishmentsFilteredPlayers();
    if (!players.length) {
      this.results = {};
      this.asOf = null;
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    this.cdr.markForCheck();

    const next: Record<string, AccountMedalsResult> = { ...this.results };
    let latestAsOf: string | null = this.asOf;

    for (const player of players) {
      if (this.ps.isD1Player(player)) {
        continue;
      }
      const key = this.ps.getPlayerKey(player);
      try {
        const result = await this.medals.loadAccountMedals(player.membershipType, player.membershipId);
        next[key] = result;
        if (result.fetchedAt && (!latestAsOf || result.fetchedAt > latestAsOf)) {
          latestAsOf = result.fetchedAt;
        }
      } catch (e: any) {
        next[key] = {
          membershipId: player.membershipId,
          membershipType: player.membershipType,
          fetchedAt: new Date().toISOString(),
          groups: [],
          totalEarned: 0,
          status: 'error',
          message: e?.message || 'Could not load medals',
        };
      }
    }

    this.results = next;
    this.asOf = latestAsOf;
    this.loading = false;
    this.visibleCount = this.pageSize;
    this.textPages = 1;
    this.cdr.markForCheck();
  }

  d2Players(): PlayerSearchDisplay[] {
    return this.ps.getAccomplishmentsFilteredPlayers().filter((p) => !this.ps.isD1Player(p));
  }

  d1PlayersSelected(): boolean {
    return this.ps.getAccomplishmentsFilteredPlayers().some((p) => this.ps.isD1Player(p));
  }

  aggregated(): AccountMedalsResult | null {
    const players = this.d2Players();
    if (!players.length) return null;
    if (players.length === 1) {
      return this.results[this.ps.getPlayerKey(players[0])] || null;
    }
    // Aggregate: max count per medal across selected accounts (same platform key space)
    const byId = new Map<string, { medal: AccountMedalsResult['groups'][0]['medals'][0]; count: number }>();
    let status: AccountMedalsResult['status'] = 'empty';
    let message: string | undefined;
    let fetchedAt = '';
    for (const player of players) {
      const r = this.results[this.ps.getPlayerKey(player)];
      if (!r) continue;
      if (r.fetchedAt > fetchedAt) fetchedAt = r.fetchedAt;
      if (r.status === 'hidden' && status !== 'ok') {
        status = 'hidden';
        message = r.message;
        continue;
      }
      if (r.status === 'error' && status !== 'ok' && status !== 'hidden') {
        status = 'error';
        message = r.message;
        continue;
      }
      if (r.status === 'ok') status = 'ok';
      for (const g of r.groups) {
        for (const m of g.medals) {
          const cur = byId.get(m.statId);
          if (!cur || m.count > cur.count) {
            byId.set(m.statId, { medal: m, count: m.count });
          }
        }
      }
    }
    if (status !== 'ok') {
      return {
        membershipId: 'aggregate',
        membershipType: 0,
        fetchedAt: fetchedAt || new Date().toISOString(),
        groups: [],
        totalEarned: 0,
        status,
        message,
      };
    }
    const medals = [...byId.values()].map(({ medal, count }) => ({ ...medal, count }));
    medals.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    // Reuse service grouping by reconstructing via modeGroup field
    const groupMap = new Map<MedalModeGroupId, typeof medals>();
    for (const m of medals) {
      const list = groupMap.get(m.modeGroup) || [];
      list.push(m);
      groupMap.set(m.modeGroup, list);
    }
    const groups = [...groupMap.entries()].map(([id, list]) => ({ id, medals: list }));
    return {
      membershipId: 'aggregate',
      membershipType: 0,
      fetchedAt: fetchedAt || new Date().toISOString(),
      groups,
      totalEarned: medals.reduce((s, m) => s + m.count, 0),
      status: medals.length ? 'ok' : 'empty',
      message: medals.length ? undefined : 'No medals earned on the selected accounts',
    };
  }

  modeIds(result: AccountMedalsResult | null): MedalModeGroupId[] {
    return (result?.groups || []).map((g) => g.id);
  }

  setMode(mode: MedalModeGroupId | null): void {
    this.activeMode = mode;
    this.visibleCount = this.pageSize;
    this.textPages = 1;
    this.cdr.markForCheck();
  }

  visibleMedals(result: AccountMedalsResult | null) {
    if (!result) return [];
    const groups = this.activeMode
      ? result.groups.filter((g) => g.id === this.activeMode)
      : result.groups;
    const flat = groups.flatMap((g) => g.medals.map((m) => ({ ...m, groupLabel: g.id })));
    return flat.slice(0, this.visibleCount);
  }

  totalVisible(result: AccountMedalsResult | null): number {
    if (!result) return 0;
    const groups = this.activeMode
      ? result.groups.filter((g) => g.id === this.activeMode)
      : result.groups;
    return groups.reduce((n, g) => n + g.medals.length, 0);
  }

  showMore(): void {
    this.visibleCount += this.pageSize;
    this.cdr.markForCheck();
  }

  textMedals(result: AccountMedalsResult | null) {
    if (!result || result.status !== 'ok') {
      return { sections: [] as Array<{ title: string; rows: { name: string; count: number }[] }>, total: 0, shown: 0 };
    }
    const groups = this.activeMode
      ? result.groups.filter((g) => g.id === this.activeMode)
      : result.groups;
    const sections = groups.map((g) => ({
      title: `${g.id} (${g.medals.length})`,
      rows: g.medals.map((m) => ({ name: m.name, count: m.count })),
    }));
    return pageSections(sections, 40, this.textPages);
  }

  showMoreText(): void {
    this.textPages += 1;
    this.cdr.markForCheck();
  }

  trackMedal(_: number, m: { statId: string }): string {
    return m.statId;
  }
}
