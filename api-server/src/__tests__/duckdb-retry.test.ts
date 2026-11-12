import { createAsyncQueue, isRetryableDuckDbError, withDuckDbRetry } from '../utils/duckdb-retry';

describe('duckdb-retry', () => {
  test('isRetryableDuckDbError matches Invalid and IO, not binder or interrupt', () => {
    expect(isRetryableDuckDbError({ errorType: 'Invalid', message: 'Invalid Error' })).toBe(true);
    expect(isRetryableDuckDbError({ errorType: 'IO', message: 'IO Error' })).toBe(true);
    expect(isRetryableDuckDbError({ message: 'Invalid Error: \u0001' })).toBe(true);
    expect(isRetryableDuckDbError({ message: 'Invalid Error' })).toBe(true);
    expect(isRetryableDuckDbError({ errorType: 'Catalog', message: 'Table does not exist' })).toBe(false);
    expect(isRetryableDuckDbError({ message: 'Binder Error: Referenced column "foo" not found' })).toBe(false);
    expect(isRetryableDuckDbError({ errorType: 'INTERRUPT', message: 'INTERRUPT Error' })).toBe(false);
  });

  test('withDuckDbRetry retries Invalid once then succeeds', async () => {
    let attempts = 0;
    const retries: number[] = [];
    const result = await withDuckDbRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          const err: any = new Error('Invalid Error');
          err.errorType = 'Invalid';
          throw err;
        }
        return 'ok';
      },
      { delayMs: 1, onRetry: (_e, attempt) => retries.push(attempt) }
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
    expect(retries).toEqual([1]);
  });

  test('withDuckDbRetry does not retry binder errors', async () => {
    let attempts = 0;
    await expect(
      withDuckDbRetry(async () => {
        attempts += 1;
        throw new Error('Binder Error: Referenced column "foo" not found');
      }, { delayMs: 1 })
    ).rejects.toThrow(/Binder Error/);
    expect(attempts).toBe(1);
  });

  test('createAsyncQueue runs tasks one at a time in order', async () => {
    const enqueue = createAsyncQueue();
    const seen: number[] = [];
    const tasks = [1, 2, 3].map((n) =>
      enqueue(async () => {
        seen.push(n);
        await new Promise((r) => setTimeout(r, 5));
        seen.push(n + 10);
        return n;
      })
    );
    await expect(Promise.all(tasks)).resolves.toEqual([1, 2, 3]);
    expect(seen).toEqual([1, 11, 2, 12, 3, 13]);
  });
});
