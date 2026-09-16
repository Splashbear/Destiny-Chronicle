import { Component, OnInit, Input, Output, EventEmitter, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import html2canvas from 'html2canvas';
import { TitleItem } from '../../services/title.service';
import { AssetUrlService } from '../../services/asset-url.service';

type LayoutType = 'grid' | 'square';
type SortType = 'release' | 'alpha' | 'curated' | 'gilded';
type CuratedGroup = 'expansion' | 'raid' | 'dungeon' | 'other';

interface SealDisplayItem extends TitleItem {
  curatedGroup?: CuratedGroup;
  manualOrder?: number;
}

interface GroupedSeals {
  group: CuratedGroup;
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
  includeChronicleFooter: boolean = true;
  isExporting: boolean = false;

  displaySeals: SealDisplayItem[] = [];
  groupedSeals: GroupedSeals[] = [];

  private readonly RAID_DUNGEON_MAP: { [titleNormalized: string]: CuratedGroup } = {
    // Raids
    'lastwhish': 'raid',
    'rivensbane': 'raid',
    'scourgeofthepast': 'raid',
    'blacksmith': 'raid',
    'crownsofsorrow': 'raid',
    'shadow': 'raid',
    'gardenofsalvation': 'raid',
    'enlightened': 'raid',
    'deepstone': 'raid',
    'descendant': 'raid',
    'vaultofglass': 'raid',
    'fatebreaker': 'raid',
    'vowofthedisciple': 'raid',
    'discipleslayer': 'raid',
    'kingsfall': 'raid',
    'kingslayer': 'raid',
    'rootofnightmares': 'raid',
    'queensguard': 'raid',
    'crotas': 'raid',
    'swordbearer': 'raid',
    'votdisciple': 'raid',
    'vaultglass': 'raid',
    
    // Dungeons
    'shatteredthrone': 'dungeon',
    'pit': 'dungeon',
    'prophecy': 'dungeon',
    'harbinger': 'dungeon',
    'graspofavarice': 'dungeon',
    'reaper': 'dungeon',
    'duality': 'dungeon',
    'discerptor': 'dungeon',
    'spireofthewatcher': 'dungeon',
    'glorious': 'dungeon',
    'ghostsofthen': 'dungeon',
    'ghoul': 'dungeon',
    'warlordsruin': 'dungeon',
    'wishbearer': 'dungeon',
    'wrathbearer': 'dungeon',
    'vespers': 'dungeon',
    'delver': 'dungeon',
  };

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

  private getCuratedGroup(seal: TitleItem): CuratedGroup {
    const normalized = this.normalizeName(seal.name);
    
    // Check explicit override map first
    if (this.RAID_DUNGEON_MAP[normalized]) {
      return this.RAID_DUNGEON_MAP[normalized];
    }

    // If has releaseRank, it's likely an expansion seal
    if (seal.releaseRank && seal.releaseRank > 0) {
      // Check if it's a MoT seal (contains MMXX pattern)
      const isMoT = /mm[x]+[iv]*/i.test(seal.name);
      if (isMoT) {
        return 'expansion';
      }
      
      // If not explicitly mapped and has release rank, default to expansion
      return 'expansion';
    }

    // Default to other for unknowns
    return 'other';
  }

  private updateDisplaySeals() {
    let seals = this.titles
      .filter(t => !this.earnedOnly || t.completed)
      .filter(t => this.showLegacy || !t.legacy)
      .map((t, index) => ({
        ...t,
        curatedGroup: this.getCuratedGroup(t),
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
    } else if (this.sortType === 'curated') {
      // For curated, group first, then sort within groups
      const groupOrder: CuratedGroup[] = ['expansion', 'raid', 'dungeon', 'other'];
      seals = seals.sort((a, b) => {
        const groupA = groupOrder.indexOf(a.curatedGroup!);
        const groupB = groupOrder.indexOf(b.curatedGroup!);
        if (groupA !== groupB) return groupA - groupB;
        // Within group: release order, then alpha
        const releaseCompare = (b.releaseRank || 0) - (a.releaseRank || 0);
        if (releaseCompare !== 0) return releaseCompare;
        return a.name.localeCompare(b.name);
      });
    }

    this.displaySeals = seals;
    
    // Create grouped view for curated display
    if (this.sortType === 'curated') {
      this.createGroupedSeals();
    } else {
      this.groupedSeals = [];
    }
  }

  private createGroupedSeals() {
    const groups: Map<CuratedGroup, SealDisplayItem[]> = new Map();
    
    for (const seal of this.displaySeals) {
      const group = seal.curatedGroup!;
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(seal);
    }

    const groupNames: Record<CuratedGroup, string> = {
      expansion: 'Expansion',
      raid: 'Raid',
      dungeon: 'Dungeon',
      other: 'Other'
    };

    this.groupedSeals = Array.from(groups.entries()).map(([group, seals]) => ({
      group,
      displayName: groupNames[group],
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
        backgroundColor: '#0f1419',
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

  getGildedIcon(seal: SealDisplayItem): string | null {
    if (!seal.isGilded || !this.showGildedBadge) return null;
    return seal.gildedIcon || null;
  }

  getSealIcon(seal: SealDisplayItem): string | null {
    if (seal.legacy && seal.altIcon) {
      return seal.altIcon;
    }
    return seal.icon || null;
  }

  onClose() {
    this.close.emit();
  }
}
