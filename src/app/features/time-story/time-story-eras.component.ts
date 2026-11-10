import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { DestinyLoaderComponent } from '../../components/destiny-loader/destiny-loader.component';
import { BreakdownMembershipScope } from '../../services/activity-breakdown.service';
import { TimeStoryService } from '../../services/time-story.service';
import { TIME_STORY_LABEL, TIME_STORY_LABEL_TOOLTIP } from '../../utils/time-story-copy';
import { TIME_STORY_ERA_COVERAGE_NOTE } from '../../utils/time-story-era-starts';
import type { TimeStoryEraItem } from '../../utils/time-story-eras';

@Component({
  selector: 'app-time-story-eras',
  standalone: true,
  imports: [CommonModule, DestinyLoaderComponent],
  templateUrl: './time-story-eras.component.html',
  styleUrls: ['./time-story-eras.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeStoryErasComponent implements OnChanges {
  @Input() scopes: BreakdownMembershipScope[] = [];
  @Input() identityByMembership: Record<string, string> = {};
  @Input() effectiveGame: 'D1' | 'D2' | 'Both' = 'Both';
  @Input() hasSelectedPlayers = false;
  @Input() syncInProgress = false;

  loading = false;
  eras: TimeStoryEraItem[] | null = null;
  readonly labelText = TIME_STORY_LABEL;
  readonly labelTooltip = TIME_STORY_LABEL_TOOLTIP;
  readonly note =
    'Most-played activity in each season, episode, or expansion. Uses the same Time in activities rules as the year chart.';
  readonly coverageNote = TIME_STORY_ERA_COVERAGE_NOTE;

  private loadGen = 0;
  private lastScopeKey = '';
  private lastIdentityKey = '';
  private lastGame: 'D1' | 'D2' | 'Both' | '' = '';

  constructor(
    private timeStory: TimeStoryService,
    private cdr: ChangeDetectorRef
  ) {}

  get showGameBadge(): boolean {
    return this.effectiveGame === 'Both';
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (!this.hasSelectedPlayers || this.scopes.length === 0) {
      this.eras = null;
      this.loading = false;
      this.lastScopeKey = '';
      this.lastIdentityKey = '';
      this.lastGame = '';
      this.cdr.markForCheck();
      return;
    }

    const scopeKey = this.scopes
      .map(s => `${s.game}:${s.membershipId}`)
      .sort()
      .join(',');
    const identityKey = Object.entries(this.identityByMembership || {})
      .map(([id, ident]) => `${id}=${ident}`)
      .sort()
      .join(',');
    const scopesChanged = scopeKey !== this.lastScopeKey;
    const identityChanged = identityKey !== this.lastIdentityKey;
    const gameChanged = this.effectiveGame !== this.lastGame;

    const syncJustFinished =
      !!changes['syncInProgress'] &&
      this.syncInProgress === false &&
      changes['syncInProgress'].previousValue === true;

    if (this.syncInProgress) {
      if (!this.eras?.length) {
        this.loading = true;
        this.cdr.markForCheck();
      }
      return;
    }

    if (syncJustFinished || scopesChanged || identityChanged || gameChanged || this.eras == null) {
      this.lastScopeKey = scopeKey;
      this.lastIdentityKey = identityKey;
      this.lastGame = this.effectiveGame;
      await this.reload();
    }
  }

  private async reload(): Promise<void> {
    const gen = ++this.loadGen;
    const showSpinner = !this.eras?.length;
    this.loading = showSpinner;
    this.cdr.markForCheck();
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const eras = await this.timeStory.getEras(this.scopes, this.identityByMembership, timeZone);
      if (gen !== this.loadGen) return;
      this.eras = eras;
    } catch (err) {
      if (gen !== this.loadGen) return;
      console.error('Time story eras failed', err);
      this.eras = [];
    } finally {
      if (gen === this.loadGen) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    }
  }
}
