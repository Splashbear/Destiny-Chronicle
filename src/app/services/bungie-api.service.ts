import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, map, tap, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { BungieMembershipType } from 'bungie-api-ts/user';

export interface PlayerSearchResult {
  displayName: string;
  membershipType: number;
  membershipId: string;
  bungieGlobalDisplayName?: string;
  bungieGlobalDisplayNameCode?: number;
}

interface BungieResponse<T> {
  Response: T;
  ErrorCode: number;
  ThrottleSeconds: number;
  ErrorStatus: string;
  Message: string;
  MessageData: Record<string, string>;
}

@Injectable({
  providedIn: 'root'
})
export class BungieApiService {
  private readonly API_KEY = 'e55082388d014a79b9f5da4be0063d1c';
  private readonly BASE_URL = '/Platform';
  private readonly OAUTH_AUTH_URL = 'https://www.bungie.net/en/OAuth/Authorize';
  private readonly OAUTH_CLIENT_ID = '49589';
  private readonly OAUTH_CLIENT_SECRET = 'VEB0lX66Of2PbonMGzpJT0YAGPb7G-yI.IJbkaZAlCQ';

  // Platform types for D1 and D2
  private readonly PLATFORMS = {
    XBOX: 1,    // BungieMembershipType.TigerXbox
    PLAYSTATION: 2,  // BungieMembershipType.TigerPsn
    STEAM: 3,   // BungieMembershipType.TigerSteam
    BATTLE_NET: 4,  // BungieMembershipType.TigerBlizzard
    STADIA: 5,  // BungieMembershipType.TigerStadia
    EPIC: 6     // BungieMembershipType.TigerEgs
  };

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'X-API-Key': this.API_KEY,
      'Content-Type': 'application/json'
    });
  }

  searchD1Player(searchTerm: string, membershipType: number): Observable<PlayerSearchResult[]> {
    console.log(`Searching D1 player: ${searchTerm} on platform: ${membershipType}`);
    const url = `${this.BASE_URL}/Destiny/SearchDestinyPlayer/${membershipType}/${encodeURIComponent(searchTerm)}/`;
    
    return this.http.get<any>(url, { headers: this.getHeaders() }).pipe(
      map(response => {
        if (response.ErrorCode === 1) {
          return response.Response.map((player: any) => ({
            displayName: player.displayName,
            membershipType: player.membershipType,
            membershipId: player.membershipId
          }));
        }
        return [];
      }),
      catchError(error => {
        console.error('Error in D1 search:', error);
        return of([]);
      })
    );
  }

  searchD2Player(bungieName: string): Observable<any> {
    const [displayName, displayNameCode] = bungieName.split('#');
    if (!displayName || !displayNameCode) {
      return throwError(() => new Error('Invalid Bungie name format. Use username#1234'));
    }

    const url = `${this.BASE_URL}/Destiny2/SearchDestinyPlayerByBungieName/-1/`;
    const body = {
      displayName,
      displayNameCode: parseInt(displayNameCode, 10)
    };

    console.log('Making D2 search request with:', {
      url,
      body,
      headers: this.getHeaders()
    });

    const headers = new HttpHeaders({
      'X-API-Key': this.API_KEY,
      'Content-Type': 'application/json',
      'Origin': 'https://www.bungie.net'
    });

    return this.http.post(url, body, {
      headers
    }).pipe(
      tap(response => console.log('D2 Search Response:', response)),
      catchError(error => {
        console.error('Error in D2 search:', {
          error,
          errorMessage: error.message,
          errorStatus: error.status,
          errorStatusText: error.statusText,
          errorUrl: error.url,
          errorHeaders: error.headers,
          errorBody: error.error
        });
        if (error instanceof HttpErrorResponse) {
          console.error('HTTP Error Details:', {
            status: error.status,
            statusText: error.statusText,
            url: error.url,
            headers: error.headers,
            error: error.error
          });
          if (error.error && error.error.ErrorCode === 2107) {
            console.error('Bungie API Error:', {
              errorCode: error.error.ErrorCode,
              errorStatus: error.error.ErrorStatus,
              message: error.error.Message,
              messageData: error.error.MessageData
            });
          }
        }
        return throwError(() => error);
      })
    );
  }

  getProfile(membershipType: BungieMembershipType, membershipId: string): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/Destiny2/${membershipType}/Profile/${membershipId}/?components=200,204`,
      { headers: this.getHeaders() }
    ).pipe(
      map((response: any) => response.Response),
      catchError(error => {
        console.error('Error fetching D2 profile:', error);
        return throwError(() => error);
      })
    );
  }

  getD1Profile(membershipType: BungieMembershipType, membershipId: string): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/Destiny/${membershipType}/Account/${membershipId}/Summary/`,
      { headers: this.getHeaders() }
    ).pipe(
      map((response: any) => response.Response),
      catchError(error => {
        console.error('Error fetching D1 profile:', error);
        return throwError(() => error);
      })
    );
  }

  getCrossSaveProfile(membershipType: BungieMembershipType, membershipId: string): Observable<any> {
    // For D1 players, return null since they don't have cross-save profiles
    if (membershipType === 1 || membershipType === 2) {
      return of(null);
    }

    return this.http.get(
      `${this.BASE_URL}/Destiny2/${membershipType}/Profile/${membershipId}/?components=204`,
      { headers: this.getHeaders() }
    ).pipe(
      map((response: any) => response.Response),
      catchError(error => {
        console.error('Error fetching cross-save profile:', error);
        return of(null);
      })
    );
  }

  getActivityHistory(membershipType: BungieMembershipType, membershipId: string, characterId: string, mode?: number, page: number = 0): Observable<any> {
    const count = 250; // Max activities per request
    const params: any = {
      count,
      page
    };
    
    if (mode !== undefined) {
      params.mode = mode;
    }

    return this.http.get(
      `${this.BASE_URL}/Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/Activities/`,
      {
        headers: this.getHeaders(),
        params
      }
    ).pipe(
      map((response: any) => response.Response),
      catchError(error => {
        console.error('Error fetching activity history:', error);
        return throwError(() => error);
      })
    );
  }

  getPGCR(activityId: string): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/Destiny2/Stats/PostGameCarnageReport/${activityId}/`,
      { headers: this.getHeaders() }
    ).pipe(
      map((response: any) => response.Response),
      catchError(error => {
        console.error('Error fetching PGCR:', error);
        return throwError(() => error);
      })
    );
  }

  isD1Player(player: PlayerSearchResult): boolean {
    // D1 players typically have a membershipType of 1 (Xbox) or 2 (PlayStation)
    // and don't have bungieGlobalDisplayName
    return (player.membershipType === 1 || player.membershipType === 2) && 
           !player.bungieGlobalDisplayName;
  }
} 