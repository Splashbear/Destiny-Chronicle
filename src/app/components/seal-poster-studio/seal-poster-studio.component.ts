import { Component, OnInit, Input, Output, EventEmitter, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import html2canvas from 'html2canvas';
import { TitleItem } from '../../services/title.service';
import { AssetUrlService } from '../../services/asset-url.service';
import { getTitleCategory, TitleCategory, CATEGORY_DISPLAY_ORDER } from '../../config/title-categories';

type LayoutType = 'grid' | 'square';
type SortType = 'release' | 'alpha' | 'category' | 'gilded';

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
export class SealPosterStudioComponent implements OnInit {
  @Input() titles: TitleItem[] = [];
  @Input() membershipId: string = '';
  @Output() close = new EventEmitter<void>();
  
  @ViewChild('posterCanvas', { static: false }) posterCanvas?: ElementRef<HTMLDivElement>;

  layout: LayoutType = 'grid';
  sortType: SortType = 'release';
  showGildedBadge: boolean = true;
  showLegacy: boolean = true;
  earnedOnly: boolean = true;
  includeUnearned: boolean = false;
  includeChronicleFooter: boolean = true;
  isExporting: boolean = false;

  displaySeals: SealDisplayItem[] = [];
  groupedSeals: GroupedSeals[] = [];

  constructor(
    private assetUrl: AssetUrlService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadManualOrder();
    this.updateDisplaySeals();
  }

  private normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  updateDisplaySeals() {
    let seals = this.titles
      .filter(t => {
        // Filter by earned/unearned
        if (this.earnedOnly && !this.includeUnearned) {
          return t.completed;
        }
        if (this.includeUnearned) {
          return true; // Show all seals (earned and unearned)
        }
        return t.completed;
      })
      .filter(t => this.showLegacy || !t.legacy)
      .map((t, index) => ({
        ...t,
        category: getTitleCategory(this.normalizeName(t.name)).category,
        manualOrder: this.getManualOrder(t.hash, index)
      }));

    // Apply sorting
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
      // For category, group by season/expansion
      seals = seals.sort((a, b) => {
        const catA = getTitleCategory(this.normalizeName(a.name));
        const catB = getTitleCategory(this.normalizeName(b.name));
        
        // First sort by category order
        if (catA.order !== catB.order) {
          return catA.order - catB.order;
        }
        
        // Within category: release order, then alpha
        const releaseCompare = (b.releaseRank || 0) - (a.releaseRank || 0);
        if (releaseCompare !== 0) return releaseCompare;
        return a.name.localeCompare(b.name);
      });
    }

    this.displaySeals = seals;
    
    // Create grouped view for category display
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
    this.updateDisplaySeals();
  }

  onToggleChange() {
    this.updateDisplaySeals();
  }

  onDrop(event: CdkDragDrop<SealDisplayItem[]>) {
    moveItemInArray(this.displaySeals, event.previousIndex, event.currentIndex);
    this.saveManualOrder();
  }

  private getManualOrderKey(): string {
    return `destinyChronicle.sealPosterOrder.${this.membershipId}`;
  }

  private loadManualOrder() {
    try {
      const key = this.getManualOrderKey();
      const stored = localStorage.getItem(key);
      if (stored) {
        const order = JSON.parse(stored) as { [hash: number]: number };
        return order;
      }
    } catch (error) {
      console.error('Error loading manual order:', error);
    }
    return {};
  }

  private getManualOrder(hash: number, defaultOrder: number): number {
    const order = this.loadManualOrder();
    return order[hash] !== undefined ? order[hash] : defaultOrder;
  }

  private saveManualOrder() {
    try {
      const key = this.getManualOrderKey();
      const order: { [hash: number]: number } = {};
      this.displaySeals.forEach((seal, index) => {
        order[seal.hash] = index;
      });
      localStorage.setItem(key, JSON.stringify(order));
    } catch (error) {
      console.error('Error saving manual order:', error);
    }
  }

  resetManualOrder() {
    try {
      const key = this.getManualOrderKey();
      localStorage.removeItem(key);
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
    // Use gilded icon if seal is gilded and we have one
    if (seal.isGilded && seal.gildedIcon) {
      return seal.gildedIcon;
    }
    // Otherwise use base icon (not alt icon, we want golden look for all)
    return seal.icon || null;
  }

  getGildText(seal: SealDisplayItem): string | null {
    if (!seal.isGilded || !this.showGildedBadge || !seal.timesGilded) {
      return null;
    }
    return `V${seal.timesGilded}`;
  }

  onClose() {
    this.close.emit();
  }
}
