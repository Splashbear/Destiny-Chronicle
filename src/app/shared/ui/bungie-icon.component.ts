import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { AssetUrlService } from '../../services/asset-url.service';

/**
 * Renders a Bungie CDN / manifest icon path (CODE_CLEANUP_SPEC Step 5).
 * Pass a relative path or absolute URL; empty path shows a grey placeholder.
 */
@Component({
  selector: 'dc-bungie-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <img *ngIf="src; else placeholder"
         [src]="src"
         [attr.width]="size"
         [attr.height]="size"
         [style.width.px]="size"
         [style.height.px]="size"
         class="dc-bungie-icon"
         loading="lazy"
         alt="" />
    <ng-template #placeholder>
      <span class="dc-bungie-icon dc-bungie-icon--empty"
            [style.width.px]="size"
            [style.height.px]="size"
            aria-hidden="true"></span>
    </ng-template>
  `,
  styles: [`
    :host { display: inline-flex; flex-shrink: 0; line-height: 0; }
    .dc-bungie-icon { object-fit: contain; display: block; border-radius: 0.25rem; }
    .dc-bungie-icon--empty { display: block; border-radius: 0.25rem; background: #334155; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BungieIconComponent {
  private readonly assets = inject(AssetUrlService);

  /** Manifest-relative path or absolute URL. */
  @Input() path: string | null | undefined;
  @Input() size = 28;

  get src(): string {
    return this.assets.resolveIcon(this.path);
  }
}
