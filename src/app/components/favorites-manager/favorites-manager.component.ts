import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { TimezoneService } from '../../services/timezone.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlayerSearchDisplay } from '../../models/player-search-display.model';
import { FavoriteAccount } from '../../services/activity-db.service';

@Component({
  selector: 'app-favorites-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Favorites Modal -->
    <div *ngIf="showModal" 
         class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
         (click)="closeModalOnBackdrop($event)">
      <div class="bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden"
           (click)="$event.stopPropagation()">
        
        <!-- Modal Header -->
        <div class="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 class="text-xl font-bold text-white">Manage Favorites</h2>
          <button (click)="closeModal()" 
                  class="text-slate-400 hover:text-white transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <!-- Modal Content -->
        <div class="p-6 overflow-y-auto max-h-[60vh]">
          
          <!-- Add New Favorite -->
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-white mb-3">Add to Favorites</h3>
            <div class="flex gap-3">
              <input type="text" 
                     [(ngModel)]="newFavoriteName"
                     placeholder="Enter player name..."
                     class="flex-1 px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-400 focus:ring-1 focus:ring-blue-400">
              <button (click)="addFavorite()"
                      [disabled]="!newFavoriteName"
                      class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50">
                Add
              </button>
            </div>
          </div>

          <!-- Current Favorites -->
          <div>
            <h3 class="text-lg font-semibold text-white mb-3">Current Favorites</h3>
            
            <div *ngIf="favorites.length === 0" class="text-center text-slate-400 py-8">
              <div class="text-4xl mb-4">⭐</div>
              <p>No favorites yet.</p>
              <p class="text-sm mt-2">Add players to your favorites for quick access.</p>
            </div>

            <div *ngIf="favorites.length > 0" class="space-y-3">
              <div *ngFor="let favorite of favorites" 
                   class="bg-slate-700/50 rounded-lg p-4 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center">
                    <span class="text-white font-medium">{{ favorite.displayName.charAt(0) }}</span>
                  </div>
                  <div>
                    <div class="text-white font-medium">{{ favorite.displayName }}</div>
                    <div class="text-sm text-slate-400">{{ favorite.platform }} • {{ favorite.game }}</div>
                    <div class="text-xs text-slate-500">Added {{ formatDate(favorite.lastUpdated) }}</div>
                  </div>
                </div>
                
                <div class="flex items-center gap-2">
                  <button (click)="loadFavorite(favorite)"
                          class="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-sm rounded transition-colors">
                    Load
                  </button>
                  <button (click)="removeFavorite(favorite)"
                          class="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="mt-6 pt-6 border-t border-slate-700">
            <div class="flex gap-3">
              <button (click)="loadAllFavorites()"
                      [disabled]="favorites.length === 0"
                      class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50">
                Load All Favorites
              </button>
              <button (click)="clearAllFavorites()"
                      [disabled]="favorites.length === 0"
                      class="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50">
                Clear All
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FavoritesManagerComponent implements OnInit {
  private readonly timezone = inject(TimezoneService);

  @Input() showModal: boolean = false;
  @Input() favorites: FavoriteAccount[] = [];
  @Input() selectedPlayers: PlayerSearchDisplay[] = [];
  
  @Output() modalClose = new EventEmitter<void>();
  @Output() favoriteAdd = new EventEmitter<string>();
  @Output() favoriteRemove = new EventEmitter<FavoriteAccount>();
  @Output() favoriteLoad = new EventEmitter<FavoriteAccount>();
  @Output() favoritesLoadAll = new EventEmitter<void>();
  @Output() favoritesClearAll = new EventEmitter<void>();

  newFavoriteName: string = '';

  ngOnInit() {
    // Component initialization
  }

  /**
   * Closes the modal
   */
  closeModal(): void {
    this.modalClose.emit();
  }

  /**
   * Closes modal when clicking on backdrop
   */
  closeModalOnBackdrop(event: Event): void {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  /**
   * Adds a new favorite
   */
  addFavorite(): void {
    if (this.newFavoriteName.trim()) {
      this.favoriteAdd.emit(this.newFavoriteName.trim());
      this.newFavoriteName = '';
    }
  }

  /**
   * Removes a favorite
   */
  removeFavorite(favorite: FavoriteAccount): void {
    this.favoriteRemove.emit(favorite);
  }

  /**
   * Loads a specific favorite
   */
  loadFavorite(favorite: FavoriteAccount): void {
    this.favoriteLoad.emit(favorite);
  }

  /**
   * Loads all favorites
   */
  loadAllFavorites(): void {
    this.favoritesLoadAll.emit();
  }

  /**
   * Clears all favorites
   */
  clearAllFavorites(): void {
    if (confirm('Are you sure you want to clear all favorites? This action cannot be undone.')) {
      this.favoritesClearAll.emit();
    }
  }

  /**
   * Formats date for display
   */
  formatDate(dateString: string): string {
    return this.timezone.formatDate(dateString);
  }
}
