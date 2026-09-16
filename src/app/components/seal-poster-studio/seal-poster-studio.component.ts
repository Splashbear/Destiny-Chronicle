import { Component, OnInit, OnChanges, SimpleChanges, Input, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import html2canvas from 'html2canvas';
import { TitleItem } from '../../services/title.service';
import { getTitleCategory, TitleCategory, CATEGORY_DISPLAY_ORDER } from '../../config/title-categories';

type ViewMode = 'browse' | 'poster';
type SortType = 'release' | 'alpha' | 'category' | 'gilded';
type LegacyFilter = 'all' | 'current' | 'legacy';

interface SealDisplayItem extends TitleItem {
  category?: TitleCategory;
  manualOrder?: number;
}

interface GroupedSeals {
  category: TitleCategory;
  displayName: string;
  seals: SealDisplayItem[];
}

@Component({
  selector: 'app-seal-poster-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './seal-poster-studio.component.html',
  styleUrls: ['./seal-poster-studio.component.scss']
})
export class SealPosterStudioComponent implements OnInit, OnChanges {
  @Input() titles: TitleItem[] = [];
  @Input() membershipId: string = '';

  @ViewChild('posterCanvas', { static: false }) posterCanvas?: ElementRef<HTMLDivElement>;

  viewMode: ViewMode = 'browse';
  sortType: SortType = 'release';
  showGildedBadge: boolean = true;
  legacyFilter: LegacyFilter = 'all';
  includeChronicleFooter: boolean = true;
  isExporting: boolean = false;

  displaySeals: SealDisplayItem[] = [];
  groupedSeals: GroupedSeals[] = [];
  hiddenCount = 0;

  private hiddenHashes = new Set<number>();
  private useManualOrder = false;

  constructor(private cdr: ChangeDetectorRef) {}

  get isPosterView(): boolean {
    return this.viewMode === 'poster' || this.isExporting;
  }

  ngOnInit() {
    this.reloadPersistedState();
    this.updateDisplaySeals();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['membershipId']) {
      this.reloadPersistedState();
    }
    if (changes['titles'] || changes['membershipId']) {
      this.updateDisplaySeals();
    }
  }

  trackByHash(_index: number, seal: SealDisplayItem): number {
    return seal.hash;
  }

  private normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private reloadPersistedState() {
    this.hiddenHashes = new Set(this.loadHiddenHashes());
    const saved = this.loadManualOrder();
    this.useManualOrder = Object.keys(saved).length > 0;
  }

  updateDisplaySeals() {
    const hidden = this.hiddenHashes;
    let seals = this.titles
      .filter(t => !hidden.has(t.hash))
      .filter(t => {
        if (this.legacyFilter === 'legacy') return !!t.legacy;
        if (this.legacyFilter === 'current') return !t.legacy;
        return true;
      })
      .map((t, index) => ({
        ...t,
        category: getTitleCategory(this.normalizeName(t.name)).category,
        manualOrder: this.getManualOrder(t.hash, index)
      }));

    if (this.sortType === 'alpha') {
      seals = seals.sort((a, b) => a.name.localeCompare(b.name));
    } else if (this.sortType === 'release') {
      seals = seals.sort((a, b) => (b.releaseRank || 0) - (a.releaseRank || 0));
    } else if (this.sortType === 'gilded') {
      seals = seals.sort((a, b) => {
        if (a.isGilded && !b.isGilded) return -1;
        if (!a.isGilded && b.isGilded) return 1;
        return (b.releaseRank || 0) - (a.releaseRank || 0);
      });
    } else if (this.sortType === 'category') {
      seals = seals.sort((a, b) => {
        const catA = getTitleCategory(this.normalizeName(a.name));
        const catB = getTitleCategory(this.normalizeName(b.name));
        if (catA.order !== catB.order) {
          return catA.order - catB.order;
        }
        const releaseCompare = (b.releaseRank || 0) - (a.releaseRank || 0);
        if (releaseCompare !== 0) return releaseCompare;
        return a.name.localeCompare(b.name);
      });
    }

    if (this.useManualOrder && this.sortType !== 'category') {
      const saved = this.loadManualOrder();
      seals = seals.sort((a, b) => {
        const ao = saved[a.hash];
        const bo = saved[b.hash];
        if (ao === undefined && bo === undefined) return 0;
        if (ao === undefined) return 1;
        if (bo === undefined) return -1;
        return ao - bo;
      });
    }

    this.displaySeals = seals;
    this.hiddenCount = hidden.size;

    if (this.sortType === 'category') {
      this.createGroupedSeals();
    } else {
      this.groupedSeals = [];
    }
  }

  private createGroupedSeals() {
    const groups: Map<TitleCategory, SealDisplayItem[]> = new Map();

    for (const seal of this.displaySeals) {
      const category = seal.category!;
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(seal);
    }

    this.groupedSeals = Array.from(groups.entries())
      .sort((a, b) => {
        const orderA = CATEGORY_DISPLAY_ORDER.indexOf(a[0]);
        const orderB = CATEGORY_DISPLAY_ORDER.indexOf(b[0]);
        return orderA - orderB;
      })
      .map(([category, seals]) => ({
        category,
        displayName: category,
        seals
      }));
  }

  onSortChange() {
    this.useManualOrder = false;
    this.updateDisplaySeals();
  }

  onToggleChange() {
    this.updateDisplaySeals();
  }

  setViewMode(mode: ViewMode) {
    this.viewMode = mode;
  }

  onDrop(event: CdkDragDrop<SealDisplayItem[]>) {
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    moveItemInArray(this.displaySeals, event.previousIndex, event.currentIndex);
    this.useManualOrder = true;
    this.saveManualOrder();
  }

  hideSeal(seal: SealDisplayItem, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.hiddenHashes.add(seal.hash);
    this.saveHiddenHashes();
    this.updateDisplaySeals();
    if (this.useManualOrder) {
      this.saveManualOrder();
    }
  }

  restoreHiddenSeals() {
    this.hiddenHashes.clear();
    this.saveHiddenHashes();
    this.updateDisplaySeals();
  }

  private getManualOrderKey(): string {
    return `destinyChronicle.sealPosterOrder.${this.membershipId}`;
  }

  private getHiddenKey(): string {
    return `destinyChronicle.sealPosterHidden.${this.membershipId}`;
  }

  private loadManualOrder(): { [hash: number]: number } {
    try {
      const stored = localStorage.getItem(this.getManualOrderKey());
      if (stored) {
        return JSON.parse(stored) as { [hash: number]: number };
      }
    } catch (error) {
      console.error('Error loading manual order:', error);
    }
    return {};
  }

  private loadHiddenHashes(): number[] {
    try {
      const stored = localStorage.getItem(this.getHiddenKey());
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.map(Number) : [];
      }
    } catch (error) {
      console.error('Error loading hidden seals:', error);
    }
    return [];
  }

  private getManualOrder(hash: number, defaultOrder: number): number {
    const order = this.loadManualOrder();
    return order[hash] !== undefined ? order[hash] : defaultOrder;
  }

  private saveManualOrder() {
    try {
      const order: { [hash: number]: number } = {};
      this.displaySeals.forEach((seal, index) => {
        order[seal.hash] = index;
      });
      localStorage.setItem(this.getManualOrderKey(), JSON.stringify(order));
    } catch (error) {
      console.error('Error saving manual order:', error);
    }
  }

  private saveHiddenHashes() {
    try {
      localStorage.setItem(this.getHiddenKey(), JSON.stringify([...this.hiddenHashes]));
    } catch (error) {
      console.error('Error saving hidden seals:', error);
    }
  }

  resetManualOrder() {
    try {
      localStorage.removeItem(this.getManualOrderKey());
      this.useManualOrder = false;
      this.updateDisplaySeals();
    } catch (error) {
      console.error('Error resetting manual order:', error);
    }
  }

  async exportPoster() {
    if (!this.posterCanvas) return;

    this.isExporting = true;
    this.cdr.detectChanges();

    try {
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(this.posterCanvas.nativeElement, {
        scale: 2,
        backgroundColor: '#1a1a1a',
        logging: false,
        useCORS: true,
        allowTaint: true
      });

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `destiny-seals-${Date.now()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
        this.isExporting = false;
        this.cdr.detectChanges();
      }, 'image/png');
    } catch (error) {
      console.error('Error exporting poster:', error);
      this.isExporting = false;
      this.cdr.detectChanges();
    }
  }

  getSealIcon(seal: SealDisplayItem): string | null {
    if (seal.isGilded && seal.gildedIcon) {
      return seal.gildedIcon;
    }
    if (!this.isPosterView && !seal.completed && seal.altIcon) {
      return seal.altIcon;
    }
    return seal.icon || null;
  }

  getGildCount(seal: SealDisplayItem): number | null {
    if (!seal.isGilded || !this.showGildedBadge || !seal.timesGilded) {
      return null;
    }
    return seal.timesGilded;
  }

  nameFontSize(name: string): string {
    const len = this.sealTitleLine(name).trim().length;
    if (len >= 20) return '0.52rem';
    if (len >= 16) return '0.58rem';
    if (len >= 12) return '0.64rem';
    return '0.72rem';
  }

  sealTitleLine(name: string): string {
    return this.splitSeasonSuffix(name).title;
  }

  sealSeasonLine(name: string): string | null {
    return this.splitSeasonSuffix(name).season;
  }

  private splitSeasonSuffix(name: string): { title: string; season: string | null } {
    const match = (name || '').match(/^(.*?)\s*(\(\s*Season of[^)]+\))\s*$/i);
    if (!match) {
      return { title: name || '', season: null };
    }
    return { title: match[1].trim(), season: match[2].trim() };
  }

  platformIconUrl(platform: string | undefined): string {
    switch (this.platformId(platform)) {
      case 1:
        return 'assets/icons/platforms/xbox.png';
      case 2:
        return 'assets/icons/platforms/ps.png';
      case 3:
        return 'assets/icons/platforms/steam.png';
      case 4:
        return 'assets/icons/platforms/blizzard.svg';
      case 5:
        return 'assets/icons/platforms/stadia.png';
      case 6:
        return 'assets/icons/platforms/egs.png';
      default:
        return '';
    }
  }

  private platformId(platform: string | undefined): number {
    if (!platform) return 0;
    const p = platform.toLowerCase();
    if (p.includes('xbox')) return 1;
    if (p.includes('playstation') || p.includes('psn') || p.includes('ps')) return 2;
    if (p.includes('steam') || p.includes('pc')) return 3;
    if (p.includes('blizzard') || p.includes('battlenet')) return 4;
    if (p.includes('stadia')) return 5;
    if (p.includes('epic')) return 6;
    return 0;
  }
}
