import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityFirstCompletion } from '../../models/guardian-firsts.model';
import { ActivityHistory } from '../../models/activity-history.model';

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
  /** e.g. "Fireteam of 6" or "alone" — facts only. */
  fireteamLabel?: string | null;
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
  @Output() shareMemory = new EventEmitter<AnniversaryFirst>();

  showAll = false;

  get featured(): AnniversaryFirst | null {
    return this.anniversaries[0] || null;
  }

  get selectedDateLabel(): string {
    if (!this.selectedDate) return '';
    const d = new Date(this.selectedDate + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return this.selectedDate;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

  /** Original Chronicle flavor — never presented as Bungie-written. */
  flavorLine(anniversary: AnniversaryFirst): string {
    const name = anniversary.activityName || 'that activity';
    const years = anniversary.yearsAgo;
    const when =
      years <= 0 ? 'Today' :
      years === 1 ? 'One year ago tonight' :
      `${this.numberWord(years)} years ago tonight`;

    switch (anniversary.type) {
      case 'solo-flawless':
        return `${when}, you solo flawless'd ${name}.`;
      case 'solo':
        return `${when}, you cleared ${name} alone.`;
      case 'first-ever':
        return `${when}, your journey began in ${name}.`;
      default:
        return `${when}, you stood in ${name}.`;
    }
  }

  private numberWord(n: number): string {
    const words = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen'
    ];
    return words[n] || String(n);
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
