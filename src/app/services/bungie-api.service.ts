import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of, timer, forkJoin } from 'rxjs';
import { catchError, map, tap, switchMap, retryWhen, delayWhen, retry } from 'rxjs/operators';
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
    const origin = window.location.origin || 'http://localhost:4200';
    return new HttpHeaders({
      'X-API-Key': this.API_KEY,
      'User-Agent': 'DestinyChronicle/1.0',
      'Origin': origin,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    });
  }

  searchD1Player(searchTerm: string, membershipType: number): Observable<PlayerSearchResult[]> {
    const url = `${this.D1_BASE_URL}/Destiny/SearchDestinyPlayer/${membershipType}/${encodeURIComponent(searchTerm)}/`;
    
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

  searchD2Player(searchTerm: string): Observable<BungieResponse<PlayerSearchResult[]>> {
    const url = `${this.D2_BASE_URL}/Destiny2/SearchDestinyPlayer/-1/${encodeURIComponent(searchTerm)}/`;
    return this.http.get<BungieResponse<PlayerSearchResult[]>>(url, { headers: this.getHeaders() });
  }

  getLinkedProfiles(membershipType: BungieMembershipType, membershipId: string): Observable<any> {
    return this.http.get(
      `${this.D2_BASE_URL}/Destiny2/${membershipType}/Profile/${membershipId}/LinkedProfiles/`,
      { headers: this.getHeaders() }
    ).pipe(
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
      catchError(error => {
        console.error('Error fetching activity history:', error);
        return throwError(() => error);
      })
    );
  }

  getD1ActivityHistory(
    membershipType: BungieMembershipType,
    membershipId: string,
    characterId: string,
    mode: number = 0,
    page: number = 0
  ): Observable<any> {
    const count = 250; // Max activities per request
    const params: any = {
      count,
      page,
      mode // always include mode
    };

    const url = `${this.D1_BASE_URL}/Destiny/Stats/ActivityHistory/${membershipType}/${membershipId}/${characterId}/`;

    return this.http.get<BungieResponse<any>>(url, {
      headers: this.getHeaders(),
      params
    }).pipe(
      map((response: BungieResponse<any>) => {
        if (response.ErrorCode !== 1) {
          throw new Error(`Bungie API Error: ${response.ErrorStatus} - ${response.Message}`);
        }

        // Transform the response to match expected structure and add game flag
        const activities = response.Response.data.activities || [];
        return {
          data: {
            activities: activities.map((activity: any) => ({
              ...activity,
              game: 'D1',  // Add game flag for D1 activities
              mode: mode   // Add mode to each activity
            }))
          },
          totalResults: response.Response.data.totalResults || 0,
          hasMore: activities.length === count
        };
      }),
      catchError(error => {
        console.error('[DEBUG] Error fetching D1 activity history:', {
          mode,
          page,
          error,
          errorMessage: error.message,
          errorStatus: error.status,
          errorStatusText: error.statusText,
          errorUrl: error.url,
          errorHeaders: error.headers,
          errorBody: error.error
        });
        return throwError(() => error);
      })
    );
  }

  // Add a new method to get all D1 activities for a character
  getAllD1Activities(
    membershipType: BungieMembershipType,
    membershipId: string,
    characterId: string
  ): Observable<any> {
    // D1 activity modes
    const D1_MODES = [
      0,   // None (PvE)
      1,   // Story
      2,   // Strike
      3,   // Raid
      4,   // AllPvP
      5,   // Patrol
      6,   // AllPvE
      10,  // Control
      12,  // Clash
      15,  // Iron Banner
      16,  // Nightfall
      17,  // PrestigeNightfall
      18,  // AllStrikes
      19,  // TrialsOfOsiris
      22,  // Survival
      24,  // Rumble
      25,  // AllMayhem
      31,  // Supremacy
      32,  // PrivateMatchesAll
      37,  // Survival
      38,  // Countdown
      39,  // TrialsOfTheNine
      40,  // Breakthrough
      41,  // Doubles
      42,  // PrivateMatchesClash
      43,  // PrivateMatchesControl
      44,  // PrivateMatchesSupremacy
      45,  // Gambit
      46,  // AllPvECompetitive
      48,  // Showdown
      49,  // Lockdown
      50,  // Momentum
      51,  // CountdownClassic
      52,  // Elimination
      53   // Rift
    ];

    // Create an array of observables for each mode
    const modeObservables = D1_MODES.map(mode => {
      return this.getD1ActivityHistory(membershipType, membershipId, characterId, mode, 0).pipe(
        // Add mode information to the response
        map(response => ({
          ...response,
          mode
        }))
      );
    });

    // Combine all mode observables
    return forkJoin(modeObservables).pipe(
      map(responses => {
        // Combine all activities from different modes
        const allActivities = responses.flatMap(response => 
          response.data.activities || []
        );

        // Sort activities by period (newest first)
        allActivities.sort((a, b) => 
          new Date(b.period).getTime() - new Date(a.period).getTime()
        );

        return {
          data: {
            activities: allActivities
          }
        };
      })
    );
  }

  getPGCR(activityId: string, isD1: boolean = false): Observable<any> {
    // Use stats.bungie.net for PGCR endpoint
    const baseUrl = 'https://stats.bungie.net/Platform';
    const url = isD1 
      ? `${baseUrl}/Destiny/Stats/PostGameCarnageReport/${activityId}/`
      : `${baseUrl}/Destiny2/Stats/PostGameCarnageReport/${activityId}/`;
    
    const headers = new HttpHeaders({
      'X-API-Key': this.API_KEY,
      'User-Agent': 'DestinyChronicle/1.0',
      'Accept': 'application/json',
      'Origin': window.location.origin || 'http://localhost:4200'
    });
    
    return this.http.get<BungieResponse<any>>(url, { 
      headers,
      observe: 'response' // Get full response including headers
    }).pipe(
      map(response => {
        const body = response.body;
        if (!body) {
          throw new Error('Empty response body');
        }
        if (body.ErrorCode !== 1) {
          throw new Error(`Bungie API Error: ${body.ErrorStatus} - ${body.Message}`);
        }
        return body.Response;
      }),
      retry({
        count: 3,
        delay: (error, retryCount) => {
          // Only retry on 500 errors or network errors
          if (error.status !== 500 && error.status !== 0) {
            return throwError(() => error);
          }
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, retryCount - 1) * 1000;
          return timer(delay);
        }
      }),
      catchError(error => {
        console.error(`[DEBUG] Error fetching PGCR ${activityId}:`, {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          url: error.url,
          headers: error.headers,
          body: error.error
        });
        throw error;
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
    const url = `${this.D2_BASE_URL}/Destiny2/SearchDestinyPlayerByBungieName/-1/`;
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

  /**
   * Fetches a D1 PGCR (Post Game Carnage Report) from the Bungie API.
   * @param activityId The ID of the activity to fetch.
   * @returns An Observable of the PGCR data.
   */
  getD1PGCR(activityId: string): Observable<any> {
    const url = `${this.D1_BASE_URL}/Destiny/Stats/PostGameCarnageReport/${activityId}/`;
    return this.http.get(url).pipe(
      map((response: any) => response.Response),
      catchError(this.handleError)
    );
  }

  private handleError(error: HttpErrorResponse) {
    console.error('Bungie API Error:', error);
    let errorMessage = 'An error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = error.error.message;
    } else {
      // Server-side error
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
    }
    
    return throwError(() => new Error(errorMessage));
  }
} 