import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of, timer } from 'rxjs';
import { catchError, map, tap, switchMap, retryWhen, delayWhen } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { BungieMembershipType } from 'bungie-api-ts/user';

export interface PlayerSearchResult {
  displayName: string;
  membershipType: number;
  membershipId: string;
  bungieGlobalDisplayName?: string;
  bungieGlobalDisplayNameCode?: string;
  isCrossSavePrimary?: boolean;
}

export interface BungieResponse<T> {
  Response: T;
  ErrorCode: number;
  ErrorStatus: string;
  Message: string;
  MessageData: { [key: string]: string };
}

@Injectable({
  providedIn: 'root'
})
export class BungieApiService {
  private readonly API_KEY = environment.bungie.API_KEY;
  private readonly D1_BASE_URL = 'https://www.bungie.net/d1/Platform';
  private readonly D2_BASE_URL = 'https://www.bungie.net/Platform';

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'X-API-Key': this.API_KEY,
      'User-Agent': 'DestinyChronicle/1.0',
      'Origin': window.location.origin
    });
  }

  searchD1Player(searchTerm: string, membershipType: number): Observable<PlayerSearchResult[]> {
    console.log(`Searching D1 player: ${searchTerm} on platform: ${membershipType}`);
    const url = `${this.D1_BASE_URL}/Destiny/SearchDestinyPlayer/${membershipType}/${encodeURIComponent(searchTerm)}/`;
    
    return this.http.get<any>(url, { headers: this.getHeaders() }).pipe(
      tap(response => console.log('D1 Search Response:', response)),
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

  searchD2Player(searchTerm: string): Observable<BungieResponse<PlayerSearchResult[]>> {
    const url = `${this.D2_BASE_URL}/Destiny2/SearchDestinyPlayer/-1/${encodeURIComponent(searchTerm)}/`;
    return this.http.get<BungieResponse<PlayerSearchResult[]>>(url, { headers: this.getHeaders() });
  }

  getLinkedProfiles(membershipType: BungieMembershipType, membershipId: string): Observable<any> {
    return this.http.get(
      `${this.D2_BASE_URL}/Destiny2/${membershipType}/Profile/${membershipId}/LinkedProfiles/`,
      { headers: this.getHeaders() }
    ).pipe(
      map((response: any) => response.Response),
      catchError(error => {
        console.error('Error fetching linked profiles:', error);
        return of({});
      })
    );
  }

  getProfile(membershipType: BungieMembershipType, membershipId: string): Observable<any> {
    return this.http.get(
      `${this.D2_BASE_URL}/Destiny2/${membershipType}/Profile/${membershipId}/?components=100,200`,
      { headers: this.getHeaders() }
    ).pipe(
      map((response: any) => response.Response),
      catchError(error => {
        console.error('Error fetching profile:', error);
        return throwError(() => error);
      })
    );
  }

  getD1Profile(membershipType: BungieMembershipType, membershipId: string): Observable<any> {
    return this.http.get(
      `${this.D1_BASE_URL}/Destiny/${membershipType}/Account/${membershipId}/Summary/`,
      { headers: this.getHeaders() }
    ).pipe(
      tap(response => console.log('D1 Profile Response:', response)),
      map((response: any) => response.Response),
      catchError(error => {
        console.error('Error fetching D1 profile:', error);
        return throwError(() => error);
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
      `${this.D2_BASE_URL}/Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/Activities/`,
      {
        headers: this.getHeaders(),
        params
      }
    ).pipe(
      tap(response => console.log('D2 Activity History Response:', response)),
      map((response: any) => response.Response),
      catchError(error => {
        console.error('Error fetching activity history:', error);
        return throwError(() => error);
      })
    );
  }

  getD1ActivityHistory(membershipType: BungieMembershipType, membershipId: string, characterId: string, mode: number = 0, page: number = 0): Observable<any> {
    const count = 250; // Max activities per request
    const params: any = {
      count,
      page,
      mode // always include mode, default 0
    };
    const url = `${this.D1_BASE_URL}/Destiny/Stats/ActivityHistory/${membershipType}/${membershipId}/${characterId}/`;
    console.log('D1 ActivityHistory Request:', { url, params });
    return this.http.get<BungieResponse<any>>(url, {
      headers: this.getHeaders(),
      params
    }).pipe(
      tap(rawResponse => {
        console.log('D1 ActivityHistory Raw Response:', rawResponse);
        if (rawResponse && 'ErrorCode' in rawResponse) {
          console.log('D1 ActivityHistory Error Details:', {
            errorCode: rawResponse.ErrorCode,
            errorStatus: rawResponse.ErrorStatus,
            message: rawResponse.Message,
            messageData: rawResponse.MessageData
          });
        }
      }),
      map((response: BungieResponse<any>) => {
        console.log('D1 ActivityHistory Response before mapping:', response);
        if (response.ErrorCode !== 1) {
          throw new Error(`Bungie API Error: ${response.ErrorStatus} - ${response.Message}`);
        }
        return response.Response;
      }),
      catchError(error => {
        console.error('Error fetching D1 activity history:', {
          error,
          errorMessage: error.message,
          errorStatus: error.status,
          errorStatusText: error.statusText,
          errorUrl: error.url,
          errorHeaders: error.headers,
          errorBody: error.error
        });
        return throwError(() => error);
      }),
      tap(response => {
        console.log('D1 ActivityHistory Final Response:', response);
      })
    );
  }

  getPGCR(activityId: string): Observable<any> {
    return this.http.get(
      `${this.D2_BASE_URL}/Destiny2/Stats/PostGameCarnageReport/${activityId}/`,
      { headers: this.getHeaders() }
    ).pipe(
      tap(response => console.log('PGCR Response:', response)),
      map((response: any) => response.Response),
      catchError(error => {
        console.error('Error fetching PGCR:', error);
        return throwError(() => error);
      })
    );
  }

  isD1Player(player: PlayerSearchResult): boolean {
    // D1 players are identified by:
    // 1. Having a membershipType of 1 (Xbox) or 2 (PlayStation)
    // 2. Not having a bungieGlobalDisplayName (which is D2-specific)
    // 3. Not having cross-save enabled
    return (player.membershipType === 1 || player.membershipType === 2) && 
           !player.bungieGlobalDisplayName &&
           !player.isCrossSavePrimary;
  }

  searchDestinyPlayerByBungieName(displayName: string, displayNameCode: number): Observable<any> {
    const url = `${this.D2_BASE_URL}/Platform/Destiny2/SearchDestinyPlayerByBungieName/-1/`;
    const headers = new HttpHeaders({
      'X-API-Key': this.API_KEY,
      'User-Agent': 'DestinyChronicle/1.0',
    });
    return this.http.post(url, { displayName, displayNameCode }, { headers });
  }

  getActivityCount(membershipType: number, membershipId: string, characterId: string): Observable<number> {
    return this.http.get<any>(
      `${this.D2_BASE_URL}/Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/Activities/?count=1`,
      { headers: this.getHeaders() }
    ).pipe(
      map(response => response.Response?.totalResults ?? 0),
      catchError(error => {
        console.error('Error fetching activity count:', error);
        return of(0);
      })
    );
  }
} 