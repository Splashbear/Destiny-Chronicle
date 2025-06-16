import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface LowmanPlayerClear {
  raid: string;
  isFresh: number;
  playDate: string;
  playTime: number;
  characters: Array<{
    bungieID: string;
    className: string;
    completed: number;
    smallIcon: string;
    mediumIcon: string;
    membershipID: string;
    membershipType: number;
  }>;
  difficulty: string;
  instanceID: string;
  isFlawless: number;
  fireteamSize: number;
}

@Injectable({ providedIn: 'root' })
export class LowmanApiService {
  private readonly baseUrl = '/api/lowman';

  constructor(private http: HttpClient) {}

  getPlayerClears(membershipId: string): Observable<LowmanPlayerClear[]> {
    return this.http.get<LowmanPlayerClear[]>(`${this.baseUrl}/getPlayerClears/${membershipId}`);
  }
} 