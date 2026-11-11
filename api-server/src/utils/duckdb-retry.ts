/**
 * DuckDB node connections are not safe for concurrent client use, and Windows
 * parquet opens can throw a transient `Invalid`/`IO` error while a previous
 * process is still releasing a large file handle (seen at API cutover).
 */
export function isRetryableDuckDbError(error: unknown): boolean {
  const err = error as { errorType?: string; message?: string };
  const typ = String(err?.errorType || '');
  const msg = String(err?.message || error || '');
  if (typ === 'Invalid' || typ === 'IO') return true;
  return /Invalid Error|IO Error/i.test(msg);
}

export async function withDuckDbRetry<T>(
  fn: () => Promise<T>,
  opts?: {
    attempts?: number;
    delayMs?: number;
    onRetry?: (error: unknown, attempt: number) => void;
  }
): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  const delayMs = opts?.delayMs ?? 25;
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!isRetryableDuckDbError(error) || i === attempts) throw error;
      opts?.onRetry?.(error, i);
      await new Promise((resolve) => setTimeout(resolve, delayMs * i));
    }
  }
  throw last;
}

/** Serialize async work so a shared DuckDB connection is not used concurrently. */
export function createAsyncQueue(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
