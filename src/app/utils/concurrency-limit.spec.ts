import { createConcurrencyLimiter } from './concurrency-limit';

describe('createConcurrencyLimiter', () => {
  it('runs at most maxParallel tasks at once', async () => {
    const limiter = createConcurrencyLimiter(2);
    let running = 0;
    let peak = 0;
    const mk = () =>
      limiter.run(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise(r => setTimeout(r, 20));
        running--;
      });
    await Promise.all([mk(), mk(), mk(), mk()]);
    expect(peak).toBe(2);
    // Allow finally handlers to decrement active after last resolve.
    await new Promise(r => setTimeout(r, 0));
    expect(limiter.activeCount()).toBe(0);
  });
});

