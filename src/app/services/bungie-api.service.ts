import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { BungieMembershipType } from 'bungie-api-ts/user';

export interface PlayerSearchResult {
  displayName: string;
  membershipId: string;
  membershipType: BungieMembershipType;
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
  private readonly API_KEY = environment.bungie.API_KEY;
  private readonly API_ROOT = '/Platform';

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
    const headers = new HttpHeaders({
      'X-API-Key': this.API_KEY
    });
    console.log('Request headers:', headers.keys());
    return headers;
  }

  searchPlayer(displayName: string): Observable<PlayerSearchResult[]> {
    console.log('Starting search for:', displayName);
    const [username, discriminator] = displayName.split('#');
    
    if (discriminator) {
      return this.searchByBungieName(username, discriminator);
    } else {
      return this.searchByLegacyName(username);
    }
  }

  private searchByBungieName(username: string, discriminator: string): Observable<PlayerSearchResult[]> {
    const body = {
      displayName: username,
      displayNameCode: parseInt(discriminator)
    };

    return this.http.post<BungieResponse<PlayerSearchResult[]>>(
      `${this.API_ROOT}/Destiny2/SearchDestinyPlayerByBungieName/All/`,
      body,
      { 
        headers: this.getHeaders()
      }
    ).pipe(
      tap(response => console.log('Bungie name search response:', response)),
      map(response => response.Response || []),
      catchError((error: any) => {
        console.error('Error in Bungie name search:', error);
        return throwError(() => error);
      })
    );
  }

  private searchByLegacyName(displayName: string): Observable<PlayerSearchResult[]> {
    console.log('Starting D1 search for:', displayName);
    const searchUrl = `${this.API_ROOT}/Destiny/SearchDestinyPlayer/all/${encodeURIComponent(displayName)}/`;
    console.log('Search URL:', searchUrl);
    
    return this.http.get<BungieResponse<PlayerSearchResult[]>>(
      searchUrl,
      { 
        headers: this.getHeaders(),
        observe: 'response'  // This will give us access to the full response including headers
      }
    ).pipe(
      tap(response => {
        console.log('Response headers:', response.headers.keys());
        console.log('Full search response:', JSON.stringify(response.body, null, 2));
        if (response.body?.ErrorCode !== 1) {
          console.error('API Error:', {
            code: response.body?.ErrorCode,
            status: response.body?.ErrorStatus,
            message: response.body?.Message,
            data: response.body?.MessageData
          });
        }
      }),
      map(response => {
        if (response.body?.ErrorCode === 1) {
          return response.body.Response || [];
        }
        console.error('Search failed:', {
          code: response.body?.ErrorCode,
          status: response.body?.ErrorStatus,
          message: response.body?.Message,
          data: response.body?.MessageData
        });
        return [];
      }),
      catchError((error: any) => {
        console.error('Error in search:', error);
        if (error.status === 404) {
          console.error('404 Error - Check if proxy is running and configured correctly');
        }
        return [];
      })
    );
  }

  getPGCR(activityId: string): Observable<any> {
    return this.http.get(
      `${this.API_ROOT}/Destiny2/Stats/PostGameCarnageReport/${activityId}/`,
      { headers: this.getHeaders() }
    ).pipe(
      map((response: any) => response.Response),
      catchError(error => {
        console.error('Error fetching PGCR:', error);
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
      `${this.API_ROOT}/Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/Activities/`,
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

  getProfile(membershipType: BungieMembershipType, membershipId: string): Observable<any> {
    return this.http.get(
      `${this.API_ROOT}/Destiny2/${membershipType}/Profile/${membershipId}/?components=200`, // 200 is for characters
      { headers: this.getHeaders() }
    ).pipe(
      map((response: any) => response.Response),
      catchError(error => {
        console.error('Error fetching profile:', error);
        return throwError(() => error);
      })
    );
  }
} 