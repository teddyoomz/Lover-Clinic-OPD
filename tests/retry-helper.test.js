// ─── withRetry + parseRetryAfterMs — adversarial tests (A3/A7) ─────────────
// Covers: retry budget, backoff, Retry-After override, sessionExpired stop,
// 4xx stop, timeout retry, callback hooks.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, parseRetryAfterMs } from '../api/proclinic/_lib/retry.js';

describe('parseRetryAfterMs', () => {
  it('R1 null/undefined/empty → null', () => {
    expect(parseRetryAfterMs(null)).toBe(null);
    expect(parseRetryAfterMs(undefined)).toBe(null);
    expect(parseRetryAfterMs('')).toBe(null);
  });

  it('R2 numeric seconds → ms', () => {
    expect(parseRetryAfterMs('5')).toBe(5000);
    expect(parseRetryAfterMs('120')).toBe(120000);
    expect(parseRetryAfterMs('0')).toBe(0);
  });

  it('R3 float seconds floor-rounded to ms', () => {
    expect(parseRetryAfterMs('1.5')).toBe(1500);
    expect(parseRetryAfterMs('0.9')).toBe(900);
  });

  it('R4 HTTP-date in the future → positive diff', () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const ms = parseRetryAfterMs(future);
    expect(ms).toBeGreaterThan(50_000);
    expect(ms).toBeLessThan(70_000);
  });

  it('R5 HTTP-date in the past → 0 (not negative)', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfterMs(past)).toBe(0);
  });

  it('R6 garbage → null', () => {
    expect(parseRetryAfterMs('not-a-date')).toBe(null);
    expect(parseRetryAfterMs('abc123')).toBe(null);
  });

  it('R7 negative integer → null (invalid)', () => {
    expect(parseRetryAfterMs('-5')).toBe(null);
  });
});

describe('withRetry — happy path', () => {
  it('W1 returns fn result on first-try success', async () => {
    const fn = vi.fn(async () => 'ok');
    const r = await withRetry(fn);
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('W2 retries until success', async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      if (n < 3) {
        const e = new Error('boom');
        e.status = 503;
        throw e;
      }
      return 'ok';
    });
    const r = await withRetry(fn, { retries: 3, baseMs: 1, maxMs: 2 });
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('W3 exhausts retries then throws last error', async () => {
    const fn = vi.fn(async () => {
      const e = new Error('persistent');
      e.status = 503;
      throw e;
    });
    await expect(withRetry(fn, { retries: 2, baseMs: 1, maxMs: 2 })).rejects.toThrow(/persistent/);
    expect(fn).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('W4 retries on timeout (no status) — AbortController-induced', async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      if (n === 1) {
        const e = new Error('Request timeout after 20000ms');
        e.timeout = true;
        throw e;
      }
      return 'ok';
    });
    const r = await withRetry(fn, { retries: 2, baseMs: 1, maxMs: 2 });
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('W5 retries on 429', async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      if (n === 1) {
        const e = new Error('Too Many Requests');
        e.status = 429;
        throw e;
      }
      return 'ok';
    });
    const r = await withRetry(fn, { retries: 2, baseMs: 1, maxMs: 2 });
    expect(r).toBe('ok');
  });
});

describe('withRetry — non-retry cases', () => {
  it('N1 stops immediately on sessionExpired', async () => {
    const fn = vi.fn(async () => {
      const e = new Error('expired');
      e.sessionExpired = true;
      throw e;
    });
    await expect(withRetry(fn, { retries: 5, baseMs: 1 })).rejects.toThrow(/expired/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('N2 stops immediately on 4xx except 429', async () => {
    for (const status of [400, 401, 403, 404, 422]) {
      const fn = vi.fn(async () => {
        const e = new Error(`HTTP ${status}`);
        e.status = status;
        throw e;
      });
      await expect(withRetry(fn, { retries: 3, baseMs: 1 })).rejects.toBeDefined();
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it('N3 retries on 5xx statuses', async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      if (n < 3) {
        const e = new Error('boom');
        e.status = [500, 502, 503, 504][n - 1];
        throw e;
      }
      return 'ok';
    });
    const r = await withRetry(fn, { retries: 3, baseMs: 1, maxMs: 2 });
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('N4 429 special-cased to retry (not 4xx-stop)', async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      if (n < 3) {
        const e = new Error('429');
        e.status = 429;
        throw e;
      }
      return 'ok';
    });
    const r = await withRetry(fn, { retries: 3, baseMs: 1, maxMs: 2 });
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('withRetry — backoff timing', () => {
  it('B1 respects retryAfterMs override from error', async () => {
    let n = 0;
    const start = Date.now();
    const fn = vi.fn(async () => {
      n++;
      if (n === 1) {
        const e = new Error('429');
        e.status = 429;
        e.retryAfterMs = 80;
        throw e;
      }
      return 'ok';
    });
    await withRetry(fn, { retries: 1, baseMs: 5000, maxMs: 10000 });
    // Explicit retryAfterMs=80 should dominate over baseMs=5000.
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(70);
    expect(elapsed).toBeLessThan(500);
  });

  it('B2 caps delay at maxMs', async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      if (n === 1) {
        const e = new Error('429');
        e.status = 429;
        e.retryAfterMs = 999999;
        throw e;
      }
      return 'ok';
    });
    const start = Date.now();
    await withRetry(fn, { retries: 1, baseMs: 100, maxMs: 50 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

  it('B3 exponential progression base * 2^attempt', async () => {
    // With baseMs=20, maxMs=500, attempts 0/1/2 should sleep ~20/40/80 ms
    const delays = [];
    const fn = async (attempt) => {
      if (attempt < 3) {
        const e = new Error('boom');
        e.status = 503;
        throw e;
      }
      return 'ok';
    };
    await withRetry(fn, {
      retries: 3,
      baseMs: 20,
      maxMs: 500,
      onRetry: ({ delayMs }) => delays.push(delayMs),
    });
    expect(delays).toEqual([20, 40, 80]);
  });

  it('B4 onRetry callback invoked with error + attempt', async () => {
    const spy = vi.fn();
    let n = 0;
    const fn = async () => {
      n++;
      if (n < 2) {
        const e = new Error('boom');
        e.status = 503;
        throw e;
      }
      return 'ok';
    };
    await withRetry(fn, { retries: 3, baseMs: 1, maxMs: 2, onRetry: spy });
    expect(spy).toHaveBeenCalledTimes(1);
    const { attempt, error, delayMs } = spy.mock.calls[0][0];
    expect(attempt).toBe(0);
    expect(error).toBeInstanceOf(Error);
    expect(delayMs).toBe(1);
  });

  it('B5 onRetry callback exceptions don\'t break retry loop', async () => {
    let n = 0;
    const fn = async () => {
      n++;
      if (n < 2) {
        const e = new Error('boom');
        e.status = 503;
        throw e;
      }
      return 'ok';
    };
    const r = await withRetry(fn, {
      retries: 2,
      baseMs: 1,
      onRetry: () => { throw new Error('user callback boom'); },
    });
    expect(r).toBe('ok');
  });
});

describe('withRetry — edge cases', () => {
  it('E1 retries=0 means one attempt only', async () => {
    const fn = vi.fn(async () => {
      const e = new Error('boom');
      e.status = 503;
      throw e;
    });
    await expect(withRetry(fn, { retries: 0, baseMs: 1 })).rejects.toBeDefined();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('E2 default retries = 3', async () => {
    const fn = vi.fn(async () => {
      const e = new Error('boom');
      e.status = 503;
      throw e;
    });
    await expect(withRetry(fn, { baseMs: 1, maxMs: 2 })).rejects.toBeDefined();
    expect(fn).toHaveBeenCalledTimes(4); // 1 + 3
  });

  it('E3 non-Error throw (string) still retries when retriable-ish', async () => {
    let n = 0;
    const fn = async () => {
      n++;
      if (n < 2) throw 'string thrown'; // no .status — treated as retriable
      return 'ok';
    };
    const r = await withRetry(fn, { retries: 2, baseMs: 1, maxMs: 2 });
    expect(r).toBe('ok');
  });

  it('E4 passes attempt index into fn', async () => {
    const seen = [];
    const fn = async (attempt) => {
      seen.push(attempt);
      if (attempt < 2) {
        const e = new Error('boom');
        e.status = 503;
        throw e;
      }
      return attempt;
    };
    const r = await withRetry(fn, { retries: 3, baseMs: 1, maxMs: 2 });
    expect(r).toBe(2);
    expect(seen).toEqual([0, 1, 2]);
  });

  it('E5 retryAfterMs wins over baseMs calc, but still capped by maxMs', async () => {
    let n = 0;
    const fn = async () => {
      n++;
      if (n === 1) {
        const e = new Error('429');
        e.status = 429;
        e.retryAfterMs = 10000;
        throw e;
      }
      return 'ok';
    };
    const start = Date.now();
    await withRetry(fn, { retries: 1, baseMs: 1, maxMs: 40 });
    const elapsed = Date.now() - start;
    // Retry-After 10000ms should be capped at maxMs 40
    expect(elapsed).toBeLessThan(200);
  });

  it('E6 negative retryAfterMs ignored (fallback to baseMs)', async () => {
    let n = 0;
    const fn = async () => {
      n++;
      if (n === 1) {
        const e = new Error('boom');
        e.status = 503;
        e.retryAfterMs = -100; // invalid
        throw e;
      }
      return 'ok';
    };
    const start = Date.now();
    await withRetry(fn, { retries: 1, baseMs: 30, maxMs: 100 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });

  it('E7 NaN retryAfterMs ignored', async () => {
    let n = 0;
    const fn = async () => {
      n++;
      if (n === 1) {
        const e = new Error('boom');
        e.status = 503;
        e.retryAfterMs = NaN;
        throw e;
      }
      return 'ok';
    };
    const r = await withRetry(fn, { retries: 1, baseMs: 1, maxMs: 2 });
    expect(r).toBe('ok');
  });

  it('E8 zero retryAfterMs treated as "use baseMs"', async () => {
    let n = 0;
    const fn = async () => {
      n++;
      if (n === 1) {
        const e = new Error('boom');
        e.status = 503;
        e.retryAfterMs = 0;
        throw e;
      }
      return 'ok';
    };
    const r = await withRetry(fn, { retries: 1, baseMs: 5, maxMs: 10 });
    expect(r).toBe('ok');
  });
});

describe('withRetry — stress', () => {
  it('X1 very-fast retries (baseMs=1) complete quickly', async () => {
    let n = 0;
    const fn = async () => {
      n++;
      if (n < 10) {
        const e = new Error('boom');
        e.status = 503;
        throw e;
      }
      return 'ok';
    };
    const start = Date.now();
    const r = await withRetry(fn, { retries: 10, baseMs: 1, maxMs: 5 });
    const elapsed = Date.now() - start;
    expect(r).toBe('ok');
    expect(elapsed).toBeLessThan(500);
  });

  it('X2 handles 4xx inside sequence — stops immediately on 403', async () => {
    let n = 0;
    const fn = async () => {
      n++;
      if (n < 2) {
        const e = new Error('503');
        e.status = 503;
        throw e;
      }
      const e = new Error('403');
      e.status = 403;
      throw e;
    };
    await expect(withRetry(fn, { retries: 5, baseMs: 1, maxMs: 2 })).rejects.toMatchObject({ status: 403 });
  });
});
