import { environment } from '../../environments/environment';

export interface IdbReadTotal {
  calls: number;
  rows: number;
}

const totals = new Map<string, IdbReadTotal>();

/** Dev counter for IndexedDB reads. Production stays quiet. */
export function noteIdbRead(name: string, rows: number): void {
  const current = totals.get(name) || { calls: 0, rows: 0 };
  current.calls += 1;
  current.rows += rows;
  totals.set(name, current);
  if (!environment.production) {
    console.debug(`[idb] ${name} last=${rows} calls=${current.calls} rows=${current.rows}`);
  }
}

export function idbReadSnapshot(): Record<string, IdbReadTotal> {
  return Object.fromEntries([...totals.entries()].map(([name, total]) => [name, { ...total }]));
}

export function resetIdbReadLog(): void {
  totals.clear();
}

if (!environment.production && typeof window !== 'undefined') {
  (window as Window & { __dcIdbReads?: () => Record<string, IdbReadTotal> }).__dcIdbReads = idbReadSnapshot;
}
