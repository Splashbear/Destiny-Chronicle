import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityFirstCompletion } from '../../models/guardian-firsts.model';
import { ActivityHistory } from '../../models/activity-history.model';
import { anniversaryCardFlavor } from '../../utils/anniversary-share-flavor';

export interface AnniversaryFirst {
  first: ActivityFirstCompletion | ActivityHistory;
  type: 'guardian-first' | 'first-ever' | 'solo' | 'solo-flawless';
  activityName: string;
  year: number;
  yearsAgo: number;
  game: 'D1' | 'D2';
  completionDate: string;
  /** Local calendar date, same formatting as the Firsts cards. */
  dateLabel?: string;
  instanceId?: string;
  platform?: string;
  /** Bungie activity icon (manifest). */
  iconUrl?: string | null;
  /** Bungie PGCR / activity hero art when available. */
  pgcrImageUrl?: string | null;
  /** e.g. "Fireteam of 6" or "alone" when we don't have names. */
  fireteamLabel?: string | null;
  /** Short display names from the first-clear PGCR, entry order. */
  fireteamNames?: string[];
}

@Component({
  selector: 'app-anniversary-celebration-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './anniversary-celebration-banner.component.html',
  styleUrls: ['./anniversary-celebration-banner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnniversaryCelebrationBannerComponent {
  @Input() anniversaries: AnniversaryFirst[] = [];
  @Input() selectedDate: string = '';
  @Output() dismiss = new EventEmitter<void>();
  @Output() navigateToFirst = new EventEmitter<AnniversaryFirst>();
  /** Emits the featured first; parent shares the full On-This-Day list. */
  @Output() shareMemory = new EventEmitter<AnniversaryFirst>();

  get featured(): AnniversaryFirst | null {
    return this.anniversaries[0] || null;
  }

  get selectedDateLabel(): string {
    if (!this.selectedDate) return '';
    const d = new Date(this.selectedDate + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return this.selectedDate;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /** One consolidated headline for every first that night (matches the share PNG). */
  get headline(): string {
    return anniversaryCardFlavor(this.anniversaries);
  }

  get typeSummary(): string {
    if (this.anniversaries.length <= 1) {
      return this.featured ? this.getAnniversaryTypeLabel(this.featured) : '';
    }
    const labels = this.anniversaries.map(a => this.getAnniversaryTypeLabel(a));
    const unique = [...new Set(labels)];
    return unique.join(' · ');
  }

  onDismiss(): void {
    this.dismiss.emit();
  }

  onNavigate(anniversary: AnniversaryFirst): void {
    this.navigateToFirst.emit(anniversary);
  }

  onShare(anniversary: AnniversaryFirst): void {
    this.shareMemory.emit(anniversary);
  }

  /** @deprecated Prefer `headline` — kept for older call sites/tests. */
  flavorLine(anniversary: AnniversaryFirst): string {
    return anniversaryCardFlavor([anniversary]);
  }

  getAnniversaryTypeLabel(anniversary: AnniversaryFirst): string {
    switch (anniversary.type) {
      case 'first-ever':
        return 'First Ever Activity';
      case 'solo':
        return 'Solo';
      case 'solo-flawless':
        return 'Solo Flawless';
      default: {
        const first = anniversary.first as ActivityFirstCompletion;
        if (first?.type === 'story') return 'Story First';
        if (first?.type === 'raid') return 'Raid First';
        if (first?.type === 'dungeon') return 'Dungeon First';
        return 'Guardian First';
      }
    }
  }

  trackByAnniversary(_index: number, anniversary: AnniversaryFirst): string {
    return `${anniversary.type}-${anniversary.activityName}-${anniversary.completionDate}`;
  }
}
