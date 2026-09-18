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
  platform?: string;
  completionDate: string;
  instanceId?: string;
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

  onDismiss(): void {
    this.dismiss.emit();
  }

  onNavigate(anniversary: AnniversaryFirst): void {
    this.navigateToFirst.emit(anniversary);
  }

  getAnniversaryIcon(anniversary: AnniversaryFirst): string {
    switch (anniversary.type) {
      case 'first-ever':
        return '🌟';
      case 'solo':
        return '🏃';
      case 'solo-flawless':
        return '💎';
      default:
        return '🎉';
    }
  }

  getAnniversaryTypeLabel(anniversary: AnniversaryFirst): string {
    switch (anniversary.type) {
      case 'first-ever':
        return 'First Ever Activity';
      case 'solo':
        return 'Solo';
      case 'solo-flawless':
        return 'Solo Flawless';
      default:
        return 'First Completion';
    }
  }

  trackByAnniversary(index: number, anniversary: AnniversaryFirst): string {
    return `${anniversary.type}-${anniversary.activityName}-${anniversary.completionDate}`;
  }
}
