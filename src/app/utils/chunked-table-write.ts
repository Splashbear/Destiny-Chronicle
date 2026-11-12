/** Default rows per IndexedDB transaction for activity bulk writes. */
export const ACTIVITY_WRITE_CHUNK_SIZE = 2500;

export type BulkPutTable<T> = {
  bulkPut: (items: T[]) => Promise<unknown>;
};

export type BulkAddTable<T, K> = {
  // Dexie overloads are wider; accept any bulkAdd that can return keys.
  bulkAdd: (...args: any[]) => Promise<K | K[]>;
};

/** Yield to the event loop so large imports stay responsive. */
export function yieldToUi(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Write rows with Dexie bulkPut in chunks, yielding between transactions.
 */
export async function chunkedBulkPut<T>(
  table: BulkPutTable<T>,
  rows: readonly T[],
  chunkSize: number = ACTIVITY_WRITE_CHUNK_SIZE
): Promise<void> {
  if (!rows.length) return;
  const size = Math.max(1, chunkSize);
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size) as T[];
    await table.bulkPut(chunk);
    if (i + size < rows.length) {
      await yieldToUi();
    }
  }
}

/**
 * Insert rows without primary keys via bulkAdd, assign returned ids onto the row objects.
 */
export async function chunkedBulkAddAssignIds<T extends { id?: number }>(
  table: BulkAddTable<T, number>,
  rows: T[],
  chunkSize: number = ACTIVITY_WRITE_CHUNK_SIZE
): Promise<void> {
  if (!rows.length) return;
  const size = Math.max(1, chunkSize);
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const keys = (await table.bulkAdd(chunk, { allKeys: true })) as number[];
    for (let j = 0; j < chunk.length; j++) {
      chunk[j].id = keys[j];
    }
    if (i + size < rows.length) {
      await yieldToUi();
    }
  }
}
