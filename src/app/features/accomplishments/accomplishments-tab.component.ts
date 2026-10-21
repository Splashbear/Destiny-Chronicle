import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { DestinyLoaderComponent } from '../../components/destiny-loader/destiny-loader.component';
import { AccountCardGridComponent } from '../../components/account-card-grid/account-card-grid.component';
import { TextViewService } from '../../services/text-view.service';
import { BungieIconComponent } from '../../shared/ui/bungie-icon.component';
import { CoverageChipComponent } from '../../shared/ui/coverage-chip.component';
import { AccomplishmentsMedalsService } from '../../services/accomplishments-medals.service';
import { AccomplishmentsCollectionsService } from '../../services/accomplishments-collections.service';
import { AccomplishmentsSealTriumphsService } from '../../services/accomplishments-seal-triumphs.service';
import { AccomplishmentsD1Service } from '../../services/accomplishments-d1.service';
import { AccomplishmentsSnapshotService } from '../../services/accomplishments-snapshot.service';
import {
  AccountMedalsResult,
  MEDAL_MODE_GROUP_ORDER,
  MEDAL_SUBTYPE_ORDER,
  MedalModeGroupId,
  MedalSubtypeId,
} from '../../models/accomplishments-medals.model';
import { MODE_SUBTYPES } from '../../utils/medal-mode-groups';
import { SnapshotDownloadFormat } from '../../services/accomplishments-snapshot.service';
import {
  AccomplishmentBadge,
  AccomplishmentEmblem,
  AccountCollectionsResult,
} from '../../models/accomplishments-collections.model';
import {
  AccomplishmentCompletedSeal,
  AccomplishmentSealTriumph,
  AccountSealTriumphsResult,
} from '../../models/accomplishments-seal-triumphs.model';
import {
  AccomplishmentD1RecordBook,
  AccomplishmentD1RecordBookPage,
  AccountD1RecordBooksResult,
} from '../../models/accomplishments-d1.model';
import { pageSections } from '../../utils/text-tab-rows';
import { PlayerSearchDisplay } from '../../models/player-search-display.model';
import { ACCOMPLISHMENTS_HOST } from './accomplishments-host.token';

type AccompSection = 'medals' | 'badges' | 'emblems' | 'seals' | 'd1-books' | 'd1-medals';

@Component({
  selector: 'app-accomplishments-tab',
  standalone: true,
  imports: [CommonModule, DestinyLoaderComponent, AccountCardGridComponent, CoverageChipComponent, BungieIconComponent],
  templateUrl: './accomplishments-tab.component.html',
  styleUrls: ['../../components/player-search/player-search-tab-shared.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccomplishmentsTabComponent implements OnInit {
  /** Host is PlayerSearchComponent today (CODE_CLEANUP_SPEC Step 4). */
  readonly ps = inject(ACCOMPLISHMENTS_HOST);
  readonly text = inject(TextViewService);
  private readonly medalsSvc = inject(AccomplishmentsMedalsService);
  private readonly collectionsSvc = inject(AccomplishmentsCollectionsService);
  private readonly sealsSvc = inject(AccomplishmentsSealTriumphsService);
  private readonly d1Svc = inject(AccomplishmentsD1Service);
  private readonly snapshotSvc = inject(AccomplishmentsSnapshotService);
  private readonly cdr = inject(ChangeDetectorRef);

  activeSection: AccompSection = 'medals';
  loading = false;
  savingSnapshot = false;
  snapshotMessage: string | null = null;
  asOf: string | null = null;
  activeMode: MedalModeGroupId = 'Crucible';
  activeSubtype: MedalSubtypeId = 'Multi + Streak';
  snapshotFormat: SnapshotDownloadFormat = 'xlsx';
  readonly pageSize = 48;
  readonly sealPageSize = 12;
  visibleCount = 48;
  textPages = 1;
  /** Expanded D1 record book hashes for completed-record lists. */
  expandedBookHashes = new Set<string>();
  /** Expanded page keys within a book: `${bookHash}|${pageName}`. */
  expandedBookPageKeys = new Set<string>();
  /** Expanded seal hashes (collapsed by default). */
  expandedSealHashes = new Set<string>();

  medalResults: Record<string, AccountMedalsResult> = {};
  collectionResults: Record<string, AccountCollectionsResult> = {};
  sealResults: Record<string, AccountSealTriumphsResult> = {};
  d1BookResults: Record<string, AccountD1RecordBooksResult> = {};
  d1MedalResults: Record<string, AccountMedalsResult> = {};

  ngOnInit(): void {
    void this.refresh();
  }

  setSection(section: AccompSection): void {
    if (this.activeSection === section) return;
    this.activeSection = section;
    this.visibleCount = section === 'seals' ? this.sealPageSize : this.pageSize;
    this.textPages = 1;
    this.snapshotMessage = null;
    this.cdr.markForCheck();
    void this.refresh();
  }

  onGameChange(game: 'D1' | 'D2'): void {
    this.ps.setActiveAccomplishmentsGame(game);
    this.activeSection = game === 'D1' ? 'd1-books' : 'medals';
    this.visibleCount = this.pageSize;
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
      this.d1BookResults = {};
      this.d1MedalResults = {};
      this.asOf = null;
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    this.cdr.markForCheck();

    let latestAsOf: string | null = this.asOf;
    const d2 = players.filter((p: PlayerSearchDisplay) => !this.ps.isD1Player(p));
    const d1 = players.filter((p: PlayerSearchDisplay) => this.ps.isD1Player(p));

    if (this.activeSection === 'medals') {
      this.medalResults = await this.loadD2Medals(d2, latestAsOf).then((r) => {
        latestAsOf = r.asOf;
        return r.map;
      });
    } else if (this.activeSection === 'seals') {
      this.sealResults = await this.loadSeals(d2, latestAsOf).then((r) => {
        latestAsOf = r.asOf;
        return r.map;
      });
    } else if (this.activeSection === 'badges' || this.activeSection === 'emblems') {
      this.collectionResults = await this.loadCollections(d2, latestAsOf).then((r) => {
        latestAsOf = r.asOf;
        return r.map;
      });
    } else if (this.activeSection === 'd1-books') {
      this.d1BookResults = await this.loadD1Books(d1, latestAsOf).then((r) => {
        latestAsOf = r.asOf;
        return r.map;
      });
    } else if (this.activeSection === 'd1-medals') {
      this.d1MedalResults = await this.loadD1Medals(d1, latestAsOf).then((r) => {
        latestAsOf = r.asOf;
        return r.map;
      });
    }

    this.asOf = latestAsOf;
    this.loading = false;
    this.visibleCount = this.activeSection === 'seals' ? this.sealPageSize : this.pageSize;
    this.textPages = 1;
    if (this.activeSection === 'medals') {
      this.ensureMedalFilters(this.aggregatedMedals());
    } else if (this.activeSection === 'd1-medals') {
      this.ensureMedalFilters(this.aggregatedD1Medals());
    }
    this.cdr.markForCheck();
  }

  setSnapshotFormat(format: SnapshotDownloadFormat): void {
    this.snapshotFormat = format;
    this.cdr.markForCheck();
  }

  async saveSnapshot(): Promise<void> {
    const players = this.ps.getAccomplishmentsFilteredPlayers();
    if (!players.length) {
      this.snapshotMessage = 'Select at least one account.';
      this.cdr.markForCheck();
      return;
    }
    this.savingSnapshot = true;
    this.snapshotMessage = null;
    this.cdr.markForCheck();
    try {
      const snap = await this.snapshotSvc.saveSnapshot(
        players.map((p: PlayerSearchDisplay) => ({
          membershipId: p.membershipId,
          membershipType: p.membershipType,
          game: this.ps.isD1Player(p) ? 'D1' : 'D2',
          displayName: p.displayName,
          platform: p.platform,
        })),
        { format: this.snapshotFormat }
      );
      const kind =
        this.snapshotFormat === 'xlsx' ? 'Excel' : this.snapshotFormat === 'txt' ? 'text' : 'JSON';
      this.snapshotMessage = `Snapshot saved as ${kind} (${snap.accounts.length} account${snap.accounts.length === 1 ? '' : 's'}). Opens in Excel or Google Sheets.`;
    } catch (e: any) {
      this.snapshotMessage = e?.message || 'Could not save snapshot';
    }
    this.savingSnapshot = false;
    this.cdr.markForCheck();
  }

  private async loadD2Medals(d2: PlayerSearchDisplay[], asOf: string | null) {
    const next: Record<string, AccountMedalsResult> = {};
    let latest = asOf;
    for (const player of d2) {
      const key = this.ps.getPlayerKey(player);
      try {
        const result = await this.medalsSvc.loadAccountMedals(player.membershipType, player.membershipId);
        next[key] = result;
        if (result.fetchedAt && (!latest || result.fetchedAt > latest)) latest = result.fetchedAt;
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
    return { map: next, asOf: latest };
  }

  private async loadSeals(d2: PlayerSearchDisplay[], asOf: string | null) {
    const next = { ...this.sealResults };
    let latest = asOf;
    for (const player of d2) {
      const key = this.ps.getPlayerKey(player);
      try {
        const result = await this.sealsSvc.loadAccountSealTriumphs(
          player.membershipType,
          player.membershipId
        );
        next[key] = result;
        if (result.fetchedAt && (!latest || result.fetchedAt > latest)) latest = result.fetchedAt;
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
    return { map: next, asOf: latest };
  }

  private async loadCollections(d2: PlayerSearchDisplay[], asOf: string | null) {
    const next = { ...this.collectionResults };
    let latest = asOf;
    for (const player of d2) {
      const key = this.ps.getPlayerKey(player);
      try {
        const result = await this.collectionsSvc.loadAccountCollections(
          player.membershipType,
          player.membershipId
        );
        next[key] = result;
        if (result.fetchedAt && (!latest || result.fetchedAt > latest)) latest = result.fetchedAt;
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
    return { map: next, asOf: latest };
  }

  private async loadD1Books(d1: PlayerSearchDisplay[], asOf: string | null) {
    const next = { ...this.d1BookResults };
    let latest = asOf;
    for (const player of d1) {
      const key = this.ps.getPlayerKey(player);
      try {
        const result = await this.d1Svc.loadRecordBooks(player.membershipType, player.membershipId);
        next[key] = result;
        if (result.fetchedAt && (!latest || result.fetchedAt > latest)) latest = result.fetchedAt;
      } catch (e: any) {
        next[key] = {
          membershipId: player.membershipId,
          membershipType: player.membershipType,
          fetchedAt: new Date().toISOString(),
          books: [],
          status: 'error',
          message: e?.message || 'Could not load D1 record books',
        };
      }
    }
    return { map: next, asOf: latest };
  }

  private async loadD1Medals(d1: PlayerSearchDisplay[], asOf: string | null) {
    const next: Record<string, AccountMedalsResult> = {};
    let latest = asOf;
    for (const player of d1) {
      const key = this.ps.getPlayerKey(player);
      try {
        const result = await this.d1Svc.loadMedals(player.membershipType, player.membershipId);
        next[key] = result;
        if (result.fetchedAt && (!latest || result.fetchedAt > latest)) latest = result.fetchedAt;
      } catch (e: any) {
        next[key] = {
          membershipId: player.membershipId,
          membershipType: player.membershipType,
          fetchedAt: new Date().toISOString(),
          groups: [],
          totalEarned: 0,
          status: 'error',
          message: e?.message || 'Could not load D1 medals',
        };
      }
    }
    return { map: next, asOf: latest };
  }

  d2Players(): PlayerSearchDisplay[] {
    return this.ps.getAccomplishmentsFilteredPlayers().filter((p: PlayerSearchDisplay) => !this.ps.isD1Player(p));
  }

  d1Players(): PlayerSearchDisplay[] {
    return this.ps.getAccomplishmentsFilteredPlayers().filter((p: PlayerSearchDisplay) => this.ps.isD1Player(p));
  }

  aggregatedMedals(): AccountMedalsResult | null {
    return this.aggregateMedals(this.d2Players(), this.medalResults);
  }

  aggregatedD1Medals(): AccountMedalsResult | null {
    return this.aggregateMedals(this.d1Players(), this.d1MedalResults);
  }

  private aggregateMedals(
    players: PlayerSearchDisplay[],
    source: Record<string, AccountMedalsResult>
  ): AccountMedalsResult | null {
    if (!players.length) return null;
    if (players.length === 1) return source[this.ps.getPlayerKey(players[0])] || null;
    const byId = new Map<string, { medal: AccountMedalsResult['groups'][0]['medals'][0]; count: number }>();
    let status: AccountMedalsResult['status'] = 'empty';
    let message: string | undefined;
    let fetchedAt = '';
    for (const player of players) {
      const r = source[this.ps.getPlayerKey(player)];
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
          if (!cur || m.count > cur.count) byId.set(m.statId, { medal: m, count: m.count });
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
    medals.sort(
      (a, b) =>
        (a.catalogOrder ?? 1e9) - (b.catalogOrder ?? 1e9) ||
        b.count - a.count ||
        a.name.localeCompare(b.name)
    );
    const groupMap = new Map<MedalModeGroupId, typeof medals>();
    for (const id of MEDAL_MODE_GROUP_ORDER) groupMap.set(id, []);
    for (const m of medals) {
      const id: MedalModeGroupId =
        m.modeGroup === 'Other' || !groupMap.has(m.modeGroup) ? 'Crucible' : m.modeGroup;
      groupMap.get(id)!.push(m);
    }
    const groups = MEDAL_MODE_GROUP_ORDER.map((id) => ({
      id,
      medals: groupMap.get(id)!,
    }));
    return {
      membershipId: 'aggregate',
      membershipType: 0,
      fetchedAt: fetchedAt || new Date().toISOString(),
      groups,
      totalEarned: medals.reduce((s, m) => s + (m.count > 0 ? m.count : 0), 0),
      status: medals.length ? 'ok' : 'empty',
      message: medals.length ? undefined : 'No medals on the selected accounts',
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
      for (const e of r.emblems) emblemMap.set(e.hash, e);
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

  aggregatedD1Books(): AccountD1RecordBooksResult | null {
    const players = this.d1Players();
    if (!players.length) return null;
    if (players.length === 1) {
      return this.d1BookResults[this.ps.getPlayerKey(players[0])] || null;
    }
    const bookMap = new Map<string, AccomplishmentD1RecordBook>();
    let status: AccountD1RecordBooksResult['status'] = 'empty';
    let message: string | undefined;
    let fetchedAt = '';
    for (const player of players) {
      const r = this.d1BookResults[this.ps.getPlayerKey(player)];
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
      for (const b of r.books) {
        const cur = bookMap.get(b.hash);
        if (!cur || b.completed > cur.completed) bookMap.set(b.hash, b);
      }
    }
    if (status !== 'ok') {
      return {
        membershipId: 'aggregate',
        membershipType: 0,
        fetchedAt: fetchedAt || new Date().toISOString(),
        books: [],
        status,
        message,
      };
    }
    const books = [...bookMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    return {
      membershipId: 'aggregate',
      membershipType: 0,
      fetchedAt: fetchedAt || new Date().toISOString(),
      books,
      status: books.length ? 'ok' : 'empty',
      message: books.length ? undefined : 'No D1 record books on the selected accounts',
    };
  }

  /** Always Crucible / Gambit / Vanguard. */
  modeIds(_result?: AccountMedalsResult | null): MedalModeGroupId[] {
    return MEDAL_MODE_GROUP_ORDER;
  }

  setMode(mode: MedalModeGroupId): void {
    this.activeMode = mode;
    this.activeSubtype = this.firstSubtypeForMode(mode, this.currentMedalAgg());
    this.visibleCount = this.pageSize;
    this.textPages = 1;
    this.cdr.markForCheck();
  }

  setSubtype(subtype: MedalSubtypeId): void {
    this.activeSubtype = subtype;
    this.visibleCount = this.pageSize;
    this.textPages = 1;
    this.cdr.markForCheck();
  }

  /** All MEDALS_LIST subtypes for the active D2 mode (even if none earned yet). */
  subtypeIds(_result?: AccountMedalsResult | null): MedalSubtypeId[] {
    const mode = this.activeMode;
    if (mode === 'Crucible' || mode === 'Gambit' || mode === 'Vanguard') {
      return MODE_SUBTYPES[mode];
    }
    return MEDAL_SUBTYPE_ORDER;
  }

  ensureMedalFilters(result: AccountMedalsResult | null): void {
    if (!result || result.status !== 'ok') return;
    if (this.ps.activeAccomplishmentsGame === 'D1') return;
    const subtypes = this.subtypeIds(result);
    if (!subtypes.includes(this.activeSubtype)) {
      this.activeSubtype = subtypes[0] || MODE_SUBTYPES.Crucible[0];
    }
  }

  private firstSubtypeForMode(
    mode: MedalModeGroupId,
    result: AccountMedalsResult | null
  ): MedalSubtypeId {
    const allowed =
      mode === 'Crucible' || mode === 'Gambit' || mode === 'Vanguard'
        ? MODE_SUBTYPES[mode]
        : MEDAL_SUBTYPE_ORDER;
    const inMode = (result?.groups || [])
      .filter((g) => g.id === mode)
      .flatMap((g) => g.medals);
    const present = new Set(inMode.map((m) => m.subtype));
    return allowed.find((id) => present.has(id)) || allowed[0];
  }

  private currentMedalAgg(): AccountMedalsResult | null {
    if (this.ps.activeAccomplishmentsGame === 'D1') return this.aggregatedD1Medals();
    return this.aggregatedMedals();
  }

  /** D1: flat earned list. D2: active mode + subtype from MEDALS_LIST. */
  private filteredMedalList(result: AccountMedalsResult | null) {
    if (!result) return [];
    if (this.ps.activeAccomplishmentsGame === 'D1') {
      return result.groups
        .flatMap((g) => g.medals.map((m) => ({ ...m, groupLabel: g.id })))
        .sort(
          (a, b) =>
            (a.catalogOrder ?? 1e9) - (b.catalogOrder ?? 1e9) ||
            b.count - a.count ||
            a.name.localeCompare(b.name)
        );
    }
    const groups = result.groups.filter((g) => g.id === this.activeMode);
    return groups
      .flatMap((g) => g.medals.map((m) => ({ ...m, groupLabel: g.id })))
      .filter((m) => m.subtype === this.activeSubtype);
  }

  visibleMedals(result: AccountMedalsResult | null) {
    return this.filteredMedalList(result).slice(0, this.visibleCount);
  }

  totalVisibleMedals(result: AccountMedalsResult | null): number {
    return this.filteredMedalList(result).length;
  }

  /** How many medals in the active D2 filter have count &gt; 0. */
  earnedInFilter(result: AccountMedalsResult | null): number {
    return this.filteredMedalList(result).filter((m) => m.count > 0).length;
  }

  /** Earned / available medal types for a subtype under the active mode. */
  subtypeProgress(
    result: AccountMedalsResult | null,
    subtype: MedalSubtypeId
  ): { earned: number; total: number } {
    const medals = (result?.groups || [])
      .filter((g) => g.id === this.activeMode)
      .flatMap((g) => g.medals)
      .filter((m) => m.subtype === subtype);
    return {
      earned: medals.filter((m) => m.count > 0).length,
      total: medals.length,
    };
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

  visibleSeals(result: AccountSealTriumphsResult | null): AccomplishmentCompletedSeal[] {
    return (result?.seals || []).slice(0, this.visibleCount);
  }

  visibleBooks(result: AccountD1RecordBooksResult | null): AccomplishmentD1RecordBook[] {
    return (result?.books || []).slice(0, this.visibleCount);
  }

  toggleBook(hash: string): void {
    if (this.expandedBookHashes.has(hash)) {
      this.expandedBookHashes.delete(hash);
      // Collapse pages when the book closes
      for (const key of [...this.expandedBookPageKeys]) {
        if (key.startsWith(`${hash}|`)) this.expandedBookPageKeys.delete(key);
      }
      this.expandedBookPageKeys = new Set(this.expandedBookPageKeys);
    } else {
      this.expandedBookHashes.add(hash);
    }
    this.expandedBookHashes = new Set(this.expandedBookHashes);
    this.cdr.markForCheck();
  }

  isBookExpanded(hash: string): boolean {
    return this.expandedBookHashes.has(hash);
  }

  bookPageKey(bookHash: string, pageName: string): string {
    return `${bookHash}|${pageName}`;
  }

  toggleBookPage(bookHash: string, pageName: string): void {
    const key = this.bookPageKey(bookHash, pageName);
    if (this.expandedBookPageKeys.has(key)) this.expandedBookPageKeys.delete(key);
    else this.expandedBookPageKeys.add(key);
    this.expandedBookPageKeys = new Set(this.expandedBookPageKeys);
    this.cdr.markForCheck();
  }

  isBookPageExpanded(bookHash: string, pageName: string): boolean {
    return this.expandedBookPageKeys.has(this.bookPageKey(bookHash, pageName));
  }

  pageCompleted(page: AccomplishmentD1RecordBookPage): number {
    return (page?.records || []).filter((r) => r.complete).length;
  }

  toggleSeal(hash: string): void {
    if (this.expandedSealHashes.has(hash)) this.expandedSealHashes.delete(hash);
    else this.expandedSealHashes.add(hash);
    this.expandedSealHashes = new Set(this.expandedSealHashes);
    this.cdr.markForCheck();
  }

  isSealExpanded(hash: string): boolean {
    return this.expandedSealHashes.has(hash);
  }

  /** Group seal triumphs by TRIUMPHS_LIST category when known. */
  sealTriumphGroups(
    seal: AccomplishmentCompletedSeal
  ): Array<{ category: string | null; triumphs: AccomplishmentSealTriumph[] }> {
    const map = new Map<string, AccomplishmentSealTriumph[]>();
    const uncategorized: AccomplishmentSealTriumph[] = [];
    for (const t of seal.triumphs || []) {
      if (t.category) {
        const list = map.get(t.category) || [];
        list.push(t);
        map.set(t.category, list);
      } else {
        uncategorized.push(t);
      }
    }
    const groups: Array<{ category: string | null; triumphs: AccomplishmentSealTriumph[] }> = [
      ...[...map.entries()]
        .sort((a, b) => {
          const ao = Math.min(...a[1].map((t) => t.catalogOrder ?? 1e9));
          const bo = Math.min(...b[1].map((t) => t.catalogOrder ?? 1e9));
          return ao - bo || a[0].localeCompare(b[0]);
        })
        .map(([category, triumphs]) => ({ category: category as string | null, triumphs })),
    ];
    if (uncategorized.length) {
      groups.push({ category: null, triumphs: uncategorized });
    }
    return groups;
  }

  expandAllSeals(result: AccountSealTriumphsResult | null): void {
    for (const s of result?.seals || []) this.expandedSealHashes.add(s.hash);
    this.expandedSealHashes = new Set(this.expandedSealHashes);
    this.cdr.markForCheck();
  }

  collapseAllSeals(): void {
    this.expandedSealHashes = new Set();
    this.cdr.markForCheck();
  }

  showMore(): void {
    this.visibleCount += this.activeSection === 'seals' ? this.sealPageSize : this.pageSize;
    this.cdr.markForCheck();
  }

  textMedals(result: AccountMedalsResult | null) {
    if (!result || result.status !== 'ok') {
      return { sections: [] as Array<{ title: string; rows: { name: string; detail: string }[] }>, total: 0, shown: 0 };
    }
    const flat = this.filteredMedalList(result);
    if (this.ps.activeAccomplishmentsGame === 'D1') {
      const sections = [
        {
          title: `D1 Medals (${flat.length})`,
          rows: flat.map((m) => ({
            name: m.description ? `${m.name} — ${m.description}` : m.name,
            detail: String(m.count),
          })),
        },
      ];
      return pageSections(sections, 40, this.textPages);
    }
    const bySubtype = new Map<string, typeof flat>();
    for (const m of flat) {
      const key = `${this.activeMode} · ${m.subtype}`;
      const list = bySubtype.get(key) || [];
      list.push(m);
      bySubtype.set(key, list);
    }
    const sections = [...bySubtype.entries()].map(([title, medals]) => ({
      title: `${title} (${medals.length})`,
      rows: medals.map((m) => ({
        name: m.description ? `${m.name} — ${m.description}` : m.name,
        detail: String(m.count),
      })),
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
    return pageSections(
      [
        {
          title: `Owned emblems (${cols.emblems.length})`,
          rows: cols.emblems.map((e) => ({ name: e.name, detail: '' })),
        },
      ],
      40,
      this.textPages
    );
  }

  textSeals(result: AccountSealTriumphsResult | null) {
    if (!result || result.status !== 'ok') {
      return { sections: [] as Array<{ title: string; rows: { name: string; detail: string }[] }>, total: 0, shown: 0 };
    }
    const sections = result.seals.map((s) => ({
      title: `${s.name} (${s.triumphs.length})${s.legacy ? ' · legacy' : ''}`,
      rows: s.triumphs.map((t) => ({
        name: t.description ? `${t.name} — ${t.description}` : t.name,
        detail: '',
      })),
    }));
    return pageSections(sections, 40, this.textPages);
  }

  textD1Books(result: AccountD1RecordBooksResult | null) {
    if (!result || result.status !== 'ok') {
      return { sections: [] as Array<{ title: string; rows: { name: string; detail: string }[] }>, total: 0, shown: 0 };
    }
    const sections = result.books.flatMap((b) => {
      if (b.pages?.length) {
        return b.pages.map((page) => ({
          title: `${b.name} · ${page.name} (${this.pageCompleted(page)}/${page.records.length})`,
          rows: page.records.map((r) => ({
            name: r.name,
            detail: r.complete ? 'Complete' : r.progressText || r.description || '',
          })),
        }));
      }
      return [
        {
          title: `${b.name} (${b.completed}/${b.total})`,
          rows: b.completedRecords.map((r) => ({
            name: r.name,
            detail: r.progressText || '',
          })),
        },
      ];
    });
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

  trackBook(_: number, b: AccomplishmentD1RecordBook): string {
    return b.hash;
  }

  trackRecord(_: number, r: { hash: string }): string {
    return r.hash;
  }
}
