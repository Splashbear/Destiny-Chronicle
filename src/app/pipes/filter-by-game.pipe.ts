import { Pipe, PipeTransform } from '@angular/core';
import { BungieApiService } from '../services/bungie-api.service';

@Pipe({
  name: 'filterByGame'
})
export class FilterByGamePipe implements PipeTransform {
  constructor(private bungieService: BungieApiService) {}

  transform(players: any[], game: 'D1' | 'D2'): any[] {
    if (!players) return [];
    return players.filter(player => {
      const isD1Player = this.bungieService.isD1Player(player);
      return game === 'D1' ? isD1Player : !isD1Player;
    });
  }
} 