import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { DestinyLoaderComponent } from '../destiny-loader/destiny-loader.component';
import { AccountCardGridComponent } from '../account-card-grid/account-card-grid.component';
import { PlayerSearchComponent } from './player-search.component';
import { TextViewService } from '../../services/text-view.service';
import { AccomplishmentsMedalsService } from '../../services/accomplishments-medals.service';
import { AccomplishmentsCollectionsService } from '../../services/accomplishments-collections.service';
import { AccomplishmentsSealTriumphsService } from '../../services/accomplishments-seal-triumphs.service';
import { AccountMedalsResult, MedalModeGroupId } from '../../models/accomplishments-medals.model';
import {
  AccomplishmentBadge,
  AccomplishmentEmblem,
  AccountCollectionsResult,
} from '../../models/accomplishments-collections.model';
import {
  AccomplishmentCompletedSeal,
  AccountSealTriumphsResult,
} from '../../models/accomplishments-seal-triumphs.model';
import { pageSections } from '../../utils/text-tab-rows';
import { PlayerSearchDisplay } from '../../models/player-search-display.model';

type AccompSection = 'medals' | 'badges' | 'emblems' | 'seals';

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
  private readonly medalsSvc = inject(AccomplishmentsMedalsService);
  private readonly collectionsSvc = inject(AccomplishmentsCollectionsService);
  private readonly sealsSvc = inject(AccomplishmentsSealTriumphsService);
  private readonly cdr = inject(ChangeDetectorRef);

  activeSection: AccompSection = 'medals';
  loading = false;
  asOf: string | null = null;
  activeMode: MedalModeGroupId | null = null;
  readonly pageSize = 48;
  /** Fewer seals per page — each expands to many triumph rows. */
  readonly sealPageSize = 12;
  visibleCount = 48;
  textPages = 1;

  medalResults: Record<string, AccountMedalsResult> = {};
  collectionResults: Record<string, AccountCollectionsResult> = {};
  sealResults: Record<string, AccountSealTriumphsResult> = {};

  ngOnInit(): void {
    void this.refresh();
  }

  setSection(section: AccompSection): void {
    if (this.activeSection === section) return;
    this.activeSection = section;
    this.visibleCount = section === 'seals' ? this.sealPageSize : this.pageSize;
    this.textPages = 1;
    this.cdr.markForCheck();
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const players = this.ps.getAccomplishmentsFilteredPlayers();
    if (!players.length) {
      this.medalResults = {};
      this.collectionResults = {};
      this.sealResults = {};
      this.asOf = null;
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    this.cdr.markForCheck();

    let latestAsOf: string | null = this.asOf;
    const d2 = players.filter((p) => !this.ps.isD1Player(p));

    if (this.activeSection === 'medals') {
      const next = { ...this.medalResults };
      for (const player of d2) {
        const key = this.ps.getPlayerKey(player);
        try {
          const result = await this.medalsSvc.loadAccountMedals(player.membershipType, player.membershipId);
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
      this.medalResults = next;
    } else if (this.activeSection === 'seals') {
      const next = { ...this.sealResults };
      for (const player of d2) {
        const key = this.ps.getPlayerKey(player);
        try {
          const result = await this.sealsSvc.loadAccountSealTriumphs(
            player.membershipType,
            player.membershipId
          );
          next[key] = result;
          if (result.fetchedAt && (!latestAsOf || result.fetchedAt > latestAsOf)) {
            latestAsOf = result.fetchedAt;
          }
        } catch (e: any) {
          next[key] = {
            membershipId: player.membershipId,
            membershipType: player.membershipType,
            fetchedAt: new Date().toISOString(),
            seals: [],
            status: 'error',
            message: e?.message || 'Could not load seal triumphs',
          };
        }
      }
      this.sealResults = next;
    } else {
      const next = { ...this.collectionResults };
      for (const player of d2) {
        const key = this.ps.getPlayerKey(player);
        try {
          const result = await this.collectionsSvc.loadAccountCollections(
            player.membershipType,
            player.membershipId
          );
          next[key] = result;
          if (result.fetchedAt && (!latestAsOf || result.fetchedAt > latestAsOf)) {
            latestAsOf = result.fetchedAt;
          }
        } catch (e: any) {
          next[key] = {
            membershipId: player.membershipId,
            membershipType: player.membershipType,
            fetchedAt: new Date().toISOString(),
            badges: [],
            emblems: [],
            status: 'error',
            message: e?.message || 'Could not load collections',
          };
        }
      }
      this.collectionResults = next;
    }

    this.asOf = latestAsOf;
    this.loading = false;
    this.visibleCount = this.activeSection === 'seals' ? this.sealPageSize : this.pageSize;
    this.textPages = 1;
    this.cdr.markForCheck();
  }

  d2Players(): PlayerSearchDisplay[] {
    return this.ps.getAccomplishmentsFilteredPlayers().filter((p) => !this.ps.isD1Player(p));
  }

  aggregatedMedals(): AccountMedalsResult | null {
    const players = this.d2Players();
    if (!players.length) return null;
    if (players.length === 1) {
      return this.medalResults[this.ps.getPlayerKey(players[0])] || null;
    }
    const byId = new Map<string, { medal: AccountMedalsResult['groups'][0]['medals'][0]; count: number }>();
    let status: AccountMedalsResult['status'] = 'empty';
    let message: string | undefined;
    let fetchedAt = '';
    for (const player of players) {
      const r = this.medalResults[this.ps.getPlayerKey(player)];
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

  aggregatedCollections(): AccountCollectionsResult | null {
    const players = this.d2Players();
    if (!players.length) return null;
    if (players.length === 1) {
      return this.collectionResults[this.ps.getPlayerKey(players[0])] || null;
    }
    const badgeMap = new Map<string, AccomplishmentBadge>();
    const emblemMap = new Map<string, AccomplishmentEmblem>();
    let status: AccountCollectionsResult['status'] = 'empty';
    let message: string | undefined;
    let fetchedAt = '';
    for (const player of players) {
      const r = this.collectionResults[this.ps.getPlayerKey(player)];
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
      for (const b of r.badges) {
        const cur = badgeMap.get(b.hash);
        if (!cur || b.acquired > cur.acquired || (b.complete && !cur.complete)) {
          badgeMap.set(b.hash, b);
        }
      }
      for (const e of r.emblems) {
        emblemMap.set(e.hash, e);
      }
    }
    if (status !== 'ok') {
      return {
        membershipId: 'aggregate',
        membershipType: 0,
        fetchedAt: fetchedAt || new Date().toISOString(),
        badges: [],
        emblems: [],
        status,
        message,
      };
    }
    const badges = [...badgeMap.values()].sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    const emblems = [...emblemMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    return {
      membershipId: 'aggregate',
      membershipType: 0,
      fetchedAt: fetchedAt || new Date().toISOString(),
      badges,
      emblems,
      status: badges.length || emblems.length ? 'ok' : 'empty',
      message:
        badges.length || emblems.length
          ? undefined
          : 'No badges or emblems on the selected accounts',
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

  totalVisibleMedals(result: AccountMedalsResult | null): number {
    if (!result) return 0;
    const groups = this.activeMode
      ? result.groups.filter((g) => g.id === this.activeMode)
      : result.groups;
    return groups.reduce((n, g) => n + g.medals.length, 0);
  }

  completedBadgeCount(cols: AccountCollectionsResult | null): number {
    return (cols?.badges || []).filter((b) => b.complete).length;
  }

  visibleBadges(cols: AccountCollectionsResult | null): AccomplishmentBadge[] {
    return (cols?.badges || []).slice(0, this.visibleCount);
  }

  visibleEmblems(cols: AccountCollectionsResult | null): AccomplishmentEmblem[] {
    return (cols?.emblems || []).slice(0, this.visibleCount);
  }

  aggregatedSeals(): AccountSealTriumphsResult | null {
    const players = this.d2Players();
    if (!players.length) return null;
    if (players.length === 1) {
      return this.sealResults[this.ps.getPlayerKey(players[0])] || null;
    }
    const sealMap = new Map<string, AccomplishmentCompletedSeal>();
    let status: AccountSealTriumphsResult['status'] = 'empty';
    let message: string | undefined;
    let fetchedAt = '';
    for (const player of players) {
      const r = this.sealResults[this.ps.getPlayerKey(player)];
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
      for (const s of r.seals) {
        if (!sealMap.has(s.hash)) sealMap.set(s.hash, s);
      }
    }
    if (status !== 'ok') {
      return {
        membershipId: 'aggregate',
        membershipType: 0,
        fetchedAt: fetchedAt || new Date().toISOString(),
        seals: [],
        status,
        message,
      };
    }
    const seals = [...sealMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    return {
      membershipId: 'aggregate',
      membershipType: 0,
      fetchedAt: fetchedAt || new Date().toISOString(),
      seals,
      status: seals.length ? 'ok' : 'empty',
      message: seals.length ? undefined : 'No completed seals on the selected accounts',
    };
  }

  visibleSeals(result: AccountSealTriumphsResult | null): AccomplishmentCompletedSeal[] {
    return (result?.seals || []).slice(0, this.visibleCount);
  }

  showMore(): void {
    this.visibleCount += this.activeSection === 'seals' ? this.sealPageSize : this.pageSize;
    this.cdr.markForCheck();
  }

  textMedals(result: AccountMedalsResult | null) {
    if (!result || result.status !== 'ok') {
      return { sections: [] as Array<{ title: string; rows: { name: string; detail: string }[] }>, total: 0, shown: 0 };
    }
    const groups = this.activeMode
      ? result.groups.filter((g) => g.id === this.activeMode)
      : result.groups;
    const sections = groups.map((g) => ({
      title: `${g.id} (${g.medals.length})`,
      rows: g.medals.map((m) => ({ name: m.name, detail: String(m.count) })),
    }));
    return pageSections(sections, 40, this.textPages);
  }

  textBadges(cols: AccountCollectionsResult | null) {
    if (!cols || cols.status !== 'ok') {
      return { sections: [] as Array<{ title: string; rows: { name: string; detail: string }[] }>, total: 0, shown: 0 };
    }
    const complete = cols.badges.filter((b) => b.complete);
    const progress = cols.badges.filter((b) => !b.complete);
    const sections = [
      {
        title: `Complete (${complete.length})`,
        rows: complete.map((b) => ({ name: b.name, detail: `${b.acquired}/${b.total}` })),
      },
      {
        title: `In progress (${progress.length})`,
        rows: progress.map((b) => ({
          name: b.name,
          detail: `${b.acquired}/${b.total} · ${b.remaining} left`,
        })),
      },
    ].filter((s) => s.rows.length);
    return pageSections(sections, 40, this.textPages);
  }

  textEmblems(cols: AccountCollectionsResult | null) {
    if (!cols || cols.status !== 'ok') {
      return { sections: [] as Array<{ title: string; rows: { name: string; detail: string }[] }>, total: 0, shown: 0 };
    }
    const sections = [
      {
        title: `Owned emblems (${cols.emblems.length})`,
        rows: cols.emblems.map((e) => ({ name: e.name, detail: '' })),
      },
    ];
    return pageSections(sections, 40, this.textPages);
  }

  textSeals(result: AccountSealTriumphsResult | null) {
    if (!result || result.status !== 'ok') {
      return { sections: [] as Array<{ title: string; rows: { name: string; detail: string }[] }>, total: 0, shown: 0 };
    }
    const sections = result.seals.map((s) => ({
      title: `${s.name} (${s.triumphs.length})${s.legacy ? ' · legacy' : ''}`,
      rows: s.triumphs.map((t) => ({ name: t.name, detail: '' })),
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

  trackBadge(_: number, b: AccomplishmentBadge): string {
    return b.hash;
  }

  trackEmblem(_: number, e: AccomplishmentEmblem): string {
    return e.hash;
  }

  trackSeal(_: number, s: AccomplishmentCompletedSeal): string {
    return s.hash;
  }

  trackTriumph(_: number, t: { hash: string }): string {
    return t.hash;
  }
}
