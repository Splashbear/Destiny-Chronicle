import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { PlatformAccount } from '../models/platform-account.model';

/**
 * Global singleton that owns the list of Destiny accounts currently selected in the UI.
 *
 * Why a dedicated service?
 *  • Keeps component state lean – any component can inject and react to the same stream.
 *  • Avoids @Input prop-drilling once we want to display data side-by-side (DungeonSoloFirsts, etc.).
 *  • Gives us one place to persist/rehydrate the selection (e.g. localStorage) later on.
 */
@Injectable({ providedIn: 'root' })
export class SelectedAccountsService {
  /** Internal subject.  Array is replaced immutably to help OnPush CD. */
  private readonly _accounts$ = new BehaviorSubject<PlatformAccount[]>([]);

  /** Public readonly stream.  Consumers subscribe to react to changes. */
  readonly accounts$: Observable<PlatformAccount[]> = this._accounts$.asObservable();

  /** Convenience observable for just the membershipIds (for e.g. caching keys). */
  readonly membershipIds$: Observable<string[]> = this.accounts$.pipe(
    map(accs => accs.map(a => a.membershipId)),
    distinctUntilChanged((a, b) => a.join('|') === b.join('|'))
  );

  /** Current snapshot getter.  Prefer the stream when possible. */
  get current(): PlatformAccount[] {
    return this._accounts$.value;
  }

  /** Add an account if it is not already present (based on membershipId). */
  add(account: PlatformAccount): void {
    const list = this._accounts$.value;
    const exists = list.some(a => a.membershipId === account.membershipId);
    if (exists) return;
    this._accounts$.next([...list, account]);
  }

  /** Remove an account by its Bungie membershipId. */
  remove(membershipId: string): void {
    const list = this._accounts$.value;
    if (list.some(a => a.membershipId === membershipId)) {
      this._accounts$.next(list.filter(a => a.membershipId !== membershipId));
    }
  }

  /** Clear all selections (rarely used but handy for debug). */
  clear(): void {
    if (this._accounts$.value.length > 0) {
      this._accounts$.next([]);
    }
  }
} 