import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Activity } from '../models/activity.model';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';

@Injectable({ providedIn: 'root' })
export class DestinyService {
  constructor(private http: HttpClient) {}

  // Fetch activities for a given membershipId
  getActivities(membershipId: string): Observable<Activity[]> {
    return this.http.get<Activity[]>(`/api/destiny/activities/${membershipId}`);
  }

  // Fetch first completions for a given membershipId
  getFirstCompletions(membershipId: string): Observable<ActivityFirstCompletion[]> {
    return this.http.get<ActivityFirstCompletion[]>(`/api/destiny/firsts/${membershipId}`);
  }

  // Fetch titles for a given membershipId
  getTitles(membershipId: string): Observable<{ name: string; completed: Date }[]> {
    return this.http.get<{ name: string; completed: Date }[]>(`/api/destiny/titles/${membershipId}`);
  }
} 