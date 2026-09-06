import { describe, it, expect, vi } from 'vitest';
import { isRateLimited } from '../../functions/_shared/rateLimit.js';

// A minimal stand-in for the one D1 shape this module actually calls:
// db.prepare(sql).bind(...args).first(). `count` is whatever the fake
// COUNT(*) query should report back.
function fakeDb(count) {
  const first = vi.fn().mockResolvedValue({ n: count });
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { db: { prepare }, prepare, bind, first };
}

describe('isRateLimited', () => {
  it('is false when the recent count is under the limit', async () => {
    const { db } = fakeDb(5);
    const limited = await isRateLimited(db, 'abc', { windowMs: 60000, maxRequests: 20 });
    expect(limited).toBe(false);
  });

  it('is true once the recent count reaches the limit', async () => {
    const { db } = fakeDb(20);
    const limited = await isRateLimited(db, 'abc', { windowMs: 60000, maxRequests: 20 });
    expect(limited).toBe(true);
  });

  it('is true when the recent count exceeds the limit', async () => {
    const { db } = fakeDb(21);
    const limited = await isRateLimited(db, 'abc', { windowMs: 60000, maxRequests: 20 });
    expect(limited).toBe(true);
  });

  it('treats a missing/null count result as zero (not limited)', async () => {
    const bindResult = { first: vi.fn().mockResolvedValue(null) };
    const db = { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue(bindResult) }) };
    const limited = await isRateLimited(db, 'abc', { windowMs: 60000, maxRequests: 20 });
    expect(limited).toBe(false);
  });

  it('fails open (never limited) when there is no ipHash to key on', async () => {
    const { db, prepare } = fakeDb(999);
    const limited = await isRateLimited(db, null, { windowMs: 60000, maxRequests: 20 });
    expect(limited).toBe(false);
    expect(prepare).not.toHaveBeenCalled(); // short-circuits before ever touching the DB
  });

  it('queries with the ipHash and a since-cutoff derived from windowMs', async () => {
    const { db, bind } = fakeDb(0);
    const before = Date.now();
    await isRateLimited(db, 'the-hash', { windowMs: 60000, maxRequests: 20 });
    const [ipHashArg, sinceArg] = bind.mock.calls[0];
    expect(ipHashArg).toBe('the-hash');
    expect(sinceArg).toBeGreaterThanOrEqual(before - 60000);
    expect(sinceArg).toBeLessThan(before - 60000 + 1000); // sane, not off by some huge amount
  });
});
