import { Component, Input } from '@angular/core';
import { NgIf, NgForOf, DatePipe } from '@angular/common';
import { DungeonSoloFirst } from '../../models/dungeon-solo-first.model';

@Component({
  selector: 'app-dungeon-solo-firsts',
  standalone: true,
  imports: [NgIf, NgForOf],
  providers: [DatePipe],
  templateUrl: './dungeon-solo-firsts.component.html',
  styleUrls: ['./dungeon-solo-firsts.component.css']
})
export class DungeonSoloFirstsComponent {
  @Input() solos: DungeonSoloFirst[] = [];

  trackByFamily(_: number, item: DungeonSoloFirst) {
    return item.family;
  }

  constructor(private datePipe: DatePipe) {}

  format(dateStr: string | Date | undefined): string {
    if (!dateStr) return '';
    return this.datePipe.transform(dateStr, 'mediumDate') || '';
  }
} 