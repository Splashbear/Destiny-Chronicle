import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SharedStateService {
  pendingShare: any | null = null;
} 