import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WastedOnDestinyService {
  constructor(private http: HttpClient) {}

  getProfile(membershipId: string): Observable<any> {
    return this.http.get<any>(`https://apiv4.wastedondestiny.com/profile/${membershipId}`);
  }
} 