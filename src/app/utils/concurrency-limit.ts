/**
 * FIFO concurrency limiter (CODE_CLEANUP_SPEC).
 * Used for per-account Bungie sync so we stay under rate limits.
 */
export function createConcurrencyLimiter(maxParallel: number): {
  run<T>(task: () => Promise<T>): Promise<T>;
  activeCount(): number;
  queueLength(): number;
} {
  let active = 0;
  const queue: Array<() => void> = [];

  const runNext = () => {
    const next = queue.shift();
    if (next) next();
  };

  return {
    activeCount: () => active,
    queueLength: () => queue.length,
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const exec = () => {
          active++;
          task()
            .then(resolve)
            .catch(reject)
            .finally(() => {
              active--;
              runNext();
            });
        };
        if (active < maxParallel) {
          exec();
        } else {
          queue.push(exec);
        }
      });
    },
  };
}
