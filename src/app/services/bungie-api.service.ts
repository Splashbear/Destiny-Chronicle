import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of, timer, forkJoin, from } from 'rxjs';
import { catchError, map, switchMap, retryWhen, delayWhen, retry, mergeMap, reduce } from 'rxjs/operators';
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

interface BungieApiResponse<T> {
  ErrorCode: number;
  ErrorStatus: string;
  Message: string;
  MessageData: { [key: string]: string };
  Response: T;
  ThrottleSeconds: number;
}

interface ProfileRecordsResponse {
  data: {
    records: {
      [key: string]: {
        objectives: Array<{ complete: boolean }>;
        state: number;
      };
    };
  };
}

interface TitleRecord {
  completed: boolean;
  objectives?: Array<{
    complete: boolean;
    progress?: number;
    completionValue?: number;
  }>;
  state: number;
  completedCount?: number;
}

interface TitleResponse {
  profileRecords?: {
    data?: {
      records?: { [key: string]: TitleRecord }
    }
  };
  characterRecords?: {
    data?: {
      records?: { [key: string]: TitleRecord }
    }
  };
  // Add other fields if needed
}

@Injectable({
  providedIn: 'root'
})
export class BungieApiService {
  private readonly API_KEY = environment.bungie.API_KEY;
  private readonly D1_BASE_URL = 'https://www.bungie.net/d1/Platform';
  private readonly D2_BASE_URL = 'https://www.bungie.net/Platform';
  


  constructor(private http: HttpClient) {}

  private buildUrl(url: string): string {
    // For now, use direct API calls to avoid rate limiting issues
    // We'll need to implement a proper solution for production deployment
    return url;
  }

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
    const finalUrl = this.buildUrl(url);
    
    return this.http.get<any>(finalUrl, { headers: this.getHeaders() }).pipe(
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
    // Check if the search term contains a Bungie Name (contains #)
    if (searchTerm.includes('#')) {
      const [displayName, displayNameCode] = searchTerm.split('#');
      return this.searchDestinyPlayerByBungieName(displayName, parseInt(displayNameCode));
    }
    
    // Regular search for non-Bungie Names
    const encodedTerm = encodeURIComponent(searchTerm);
    const url = `${this.D2_BASE_URL}/Destiny2/SearchDestinyPlayer/-1/${encodedTerm}/`;
    const finalUrl = this.buildUrl(url);
    return this.http.get<BungieResponse<PlayerSearchResult[]>>(finalUrl, { headers: this.getHeaders() });
  }

  getLinkedProfiles(membershipType: BungieMembershipType, membershipId: string): Observable<any> {
    const url = `${this.D2_BASE_URL}/Destiny2/${membershipType}/Profile/${membershipId}/LinkedProfiles/?getAllMemberships=true`;
    const finalUrl = this.buildUrl(url);
    return this.http.get(
      finalUrl,
      { headers: this.getHeaders() }
    ).pipe(
      catchError(error => {
        console.error('Error fetching linked profiles:', error);
        return of({});
      })
    );
  }

  getProfile(membershipType: BungieMembershipType, membershipId: string): Observable<any> {
    const url = `${this.D2_BASE_URL}/Destiny2/${membershipType}/Profile/${membershipId}/?components=100,200`;
    const finalUrl = this.buildUrl(url);
    return this.http.get(
      finalUrl,
      { headers: this.getHeaders() }
    ).pipe(
      catchError(error => {
        console.error('Error fetching profile:', error);
        return throwError(() => error);
      })
    );
  }

  getPlayerTitles(membershipType: number, membershipId: string): Observable<BungieResponse<TitleResponse>> {
    const cacheBuster = Math.floor(Math.random() * 1e9);
    const url = `${this.D2_BASE_URL}/Destiny2/${membershipType}/Profile/${membershipId}/?components=900&_cb=${cacheBuster}`;
    const finalUrl = this.buildUrl(url);
    return this.http.get<BungieResponse<TitleResponse>>(finalUrl, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Error fetching player titles:', error);
        return throwError(() => error);
      })
    );
  }

  getD1Profile(membershipType: BungieMembershipType, membershipId: string): Observable<any> {
    const url = `${this.D1_BASE_URL}/Destiny/${membershipType}/Account/${membershipId}/Summary/`;
    const finalUrl = this.buildUrl(url);
    return this.http.get(
      finalUrl,
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

    const url = `${this.D2_BASE_URL}/Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/Activities/`;
    const finalUrl = this.buildUrl(url);
    return this.http.get(
      finalUrl,
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
    const finalUrl = this.buildUrl(url);

    return this.http.get<BungieResponse<any>>(finalUrl, {
      headers: this.getHeaders(),
      params
    }).pipe(
      map((response: BungieResponse<any>) => {
        if (response.ErrorCode !== 1) {
          throw new Error(`Bungie API Error: ${response.ErrorStatus} - ${response.Message}`);
        }

        // Transform the response to match expected structure and add game flag
        const activities = response.Response.data.activities || [];
        const respHasMore = (response as any)?.Response?.hasMore;
        const totalResults = response.Response.data.totalResults || 0;
        return {
          data: {
            activities: activities.map((activity: any) => ({
              ...activity,
              game: 'D1',  // Add game flag for D1 activities
              mode: mode   // Add mode to each activity
            }))
          },
          totalResults,
          // Prefer Bungie's hasMore when available; fallback to page-size heuristic
          hasMore: typeof respHasMore === 'boolean' ? respHasMore : (activities.length === count)
        };
      }),
      catchError(error => {
        console.error('Error fetching D1 activity history:', error);
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
      'Accept': 'application/json'
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
        console.error(`Error fetching PGCR ${activityId}:`, error);
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

  searchDestinyPlayerByBungieName(displayName: string, displayNameCode: number): Observable<BungieResponse<PlayerSearchResult[]>> {
    const url = `${this.D2_BASE_URL}/Destiny2/SearchDestinyPlayerByBungieName/-1/`;
    const finalUrl = this.buildUrl(url);
    const headers = new HttpHeaders({
      'X-API-Key': this.API_KEY,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    });
    const body = {
      displayName,
      displayNameCode: parseInt(displayNameCode.toString(), 10)
    };
    return this.http.post<BungieResponse<PlayerSearchResult[]>>(finalUrl, body, { headers }).pipe(
      map(response => {
        if (response.ErrorCode === 1) {
          // The response might be a single object or an array
          const responseData = response.Response;
          return {
            ...response,
            Response: Array.isArray(responseData) ? responseData : [responseData]
          };
        }
        return response;
      })
    );
  }

  getActivityCount(membershipType: number, membershipId: string, characterId: string): Observable<number> {
    const url = `${this.D2_BASE_URL}/Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/Activities/?count=1`;
    const finalUrl = this.buildUrl(url);
    return this.http.get<any>(
      finalUrl,
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
    const finalUrl = this.buildUrl(url);
    return this.http.get(finalUrl).pipe(
      map((response: any) => response.Response),
      catchError(this.handleError)
    );
  }

  /**
   * Batch fetches multiple D2 PGCRs with concurrency control.
   * More efficient than multiple individual requests.
   */
  getD2PGCRBatch(activityIds: string[], concurrencyLimit: number = 3): Observable<any[]> {
    if (activityIds.length === 0) {
      return of([]);
    }

    // Process in chunks to avoid overwhelming the API
    const chunks = this.chunkArray(activityIds, concurrencyLimit);
    
    return from(chunks).pipe(
      mergeMap(chunk => {
        const chunkRequests = chunk.map(id => this.getPGCR(id, false));
        return forkJoin(chunkRequests);
      }, concurrencyLimit),
      reduce((acc, chunk) => acc.concat(chunk), [] as any[])
    );
  }

  /**
   * Batch fetches multiple D1 PGCRs with concurrency control.
   * More efficient than multiple individual requests.
   */
  getD1PGCRBatch(activityIds: string[], concurrencyLimit: number = 3): Observable<any[]> {
    if (activityIds.length === 0) {
      return of([]);
    }

    // Process in chunks to avoid overwhelming the API
    const chunks = this.chunkArray(activityIds, concurrencyLimit);
    
    return from(chunks).pipe(
      mergeMap(chunk => {
        const chunkRequests = chunk.map(id => this.getPGCR(id, true));
        return forkJoin(chunkRequests);
      }, concurrencyLimit),
      reduce((acc, chunk) => acc.concat(chunk), [] as any[])
    );
  }

  /**
   * Helper method to chunk arrays for concurrency control.
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Fetches presentation node progressions (component 1005) for a player.
   * @param membershipType The membership type (1=Xbox, 2=PSN, 3=Steam, etc.)
   * @param membershipId The player's membership ID
   */
  getPresentationNodeProgressions(membershipType: number, membershipId: string): Observable<any> {
    const url = `${this.D2_BASE_URL}/Destiny2/${membershipType}/Profile/${membershipId}/?components=1005`;
    const finalUrl = this.buildUrl(url);
    return this.http.get<BungieResponse<any>>(finalUrl, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Error fetching presentation node progressions:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Performs a prefix search against Bungie.net users using the stable endpoint.
   * Route: POST /User/Search/GlobalName/0/
   * Body: { displayNamePrefix: "<partialName>" }
   * Bungie returns an object with Response.searchResults (up to 25 entries).
   */
  searchUsersPrefix(term: string): Observable<BungieResponse<any>> {
    const url = `${this.D2_BASE_URL}/User/Search/GlobalName/0/`;
    const finalUrl = this.buildUrl(url);
    const body = { displayNamePrefix: term };
    const headers = new HttpHeaders({
      'X-API-Key': this.API_KEY,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    });
    return this.http.post<BungieResponse<any>>(finalUrl, body, { headers }).pipe(
      catchError(err => {
        console.error('[BungieApi] Error in searchUsersPrefix:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Fetches all Destiny memberships (D1 + D2, all platforms) tied to a Bungie.net user ID.
   * The endpoint returns cross-save data and legacy accounts in one payload.
   * API doc: GET /User/GetMembershipsById/{bungieNetUserId}/254/
   */
  getMembershipData(bungieNetUserId: string | number): Observable<BungieResponse<any>> {
    const url = `${this.D2_BASE_URL}/User/GetMembershipsById/${bungieNetUserId}/254/`;
    const finalUrl = this.buildUrl(url);
    return this.http.get<BungieResponse<any>>(finalUrl, { headers: this.getHeaders() }).pipe(
      catchError(err => {
        console.error('[BungieApi] Error in getMembershipData:', err);
        return throwError(() => err);
      })
    );
  }

  // Fetch both ProfileRecords (900) and CharacterRecords (1000) in a single request – used for achievements & triumphs
  getPlayerRecords(membershipType: number, membershipId: string) {
    const url = `${this.D2_BASE_URL}/Destiny2/${membershipType}/Profile/${membershipId}/?components=900,1000`;
    const finalUrl = this.buildUrl(url);
    return this.http.get<BungieResponse<any>>(finalUrl, { headers: this.getHeaders() }).pipe(
      catchError(error => {
        console.error('Error fetching player records (900/1000):', error);
        return throwError(() => error);
      })
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

  /**
   * Searches both D1 and D2 APIs for the given search term.
   *
   * IMPORTANT: Bungie Names (e.g. "Player#1234") are **only** valid for D2.
   * Destiny 1 gamertags do **not** contain the #code suffix.
   * If a Bungie Name is supplied we strip the suffix when calling the D1 API
   * so Destiny 1 accounts can still be found.
   */
  searchAllGames(searchTerm: string): Observable<[any, PlayerSearchResult[], PlayerSearchResult[]]> {
    // ---------------------
    // Destiny 2 Search
    // ---------------------
    // Choose the correct endpoint depending on whether a Bungie Name code is present
    const d2$ = searchTerm.includes('#')
      ? this.searchD2Player(searchTerm).pipe(catchError((error) => {
          console.error('D2 search error:', error);
          return of(null);
        }))
      : this.searchUsersPrefix(searchTerm).pipe(catchError((error) => {
          console.error('D2 prefix search error:', error);
          return of(null);
        }));

    // ---------------------
    // Destiny 1 Search
    // ---------------------
    // Strip the #code suffix because D1 gamertags don't include it
    const d1SearchTerm = searchTerm.includes('#') ? searchTerm.split('#')[0] : searchTerm;

    // Destiny 1 searches for Xbox (1) and PlayStation (2)
    const d1Xbox$ = this.searchD1Player(d1SearchTerm, 1).pipe(catchError((error) => {
      console.error('D1 Xbox search error:', error);
      return of([]);
    }));
    const d1Psn$  = this.searchD1Player(d1SearchTerm, 2).pipe(catchError((error) => {
      console.error('D1 PSN search error:', error);
      return of([]);
    }));

    // Run them concurrently
    return forkJoin([d2$, d1Xbox$, d1Psn$]);
  }
} 