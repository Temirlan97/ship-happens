// js/leaderboard.js talks to the network — every test here mocks
// global.fetch (and navigator.sendBeacon) rather than hitting anything
// real. It's also designed to degrade silently on any failure (the game
// must play identically if the API is unreachable), which several tests
// below verify directly.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';

let Game, Leaderboard;

beforeEach(() => {
  Game = loadGame();
  Leaderboard = Game.Leaderboard;
  vi.stubGlobal('fetch', vi.fn());
});

function jsonResponse(body) {
  return Promise.resolve({ json: () => Promise.resolve(body) });
}

describe('Leaderboard.runStart', () => {
  it('POSTs to /api/runs/start and stores the returned secret for later calls', async () => {
    fetch.mockReturnValueOnce(jsonResponse({ secret: 'abc123' }));
    await Leaderboard.runStart();
    expect(fetch).toHaveBeenCalledWith('/api/runs/start', expect.objectContaining({ method: 'POST' }));

    // Indirect check that the secret was actually stored: a subsequent call
    // that requires it (finishRun) should now actually hit the network
    // instead of short-circuiting.
    fetch.mockReturnValueOnce(jsonResponse({ qualifiesForName: false, rank: null }));
    await Leaderboard.finishRun(3, 1000, {});
    expect(fetch).toHaveBeenCalledWith('/api/runs/finish', expect.anything());
  });

  it('leaves no usable secret if the request fails — later calls stay no-ops', async () => {
    fetch.mockRejectedValueOnce(new Error('network down'));
    await Leaderboard.runStart();
    fetch.mockClear();
    const result = await Leaderboard.finishRun(3, 1000, {});
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toEqual({ qualifiesForName: false, rank: null });
  });
});

describe('Leaderboard.sendCheckpoint', () => {
  it('is a no-op without a session (never started, or start failed)', () => {
    vi.stubGlobal('navigator', { sendBeacon: vi.fn() });
    Leaderboard.sendCheckpoint(2, 500, {});
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });

  it('sends a beacon once a session exists', async () => {
    fetch.mockReturnValueOnce(jsonResponse({ secret: 'abc123' }));
    await Leaderboard.runStart();
    const sendBeacon = vi.fn();
    vi.stubGlobal('navigator', { sendBeacon });
    Leaderboard.sendCheckpoint(2, 500, { kills: 3 });
    expect(sendBeacon).toHaveBeenCalledOnce();
    expect(sendBeacon.mock.calls[0][0]).toBe('/api/runs/checkpoint');
  });

  it('falls back to fetch(keepalive) when sendBeacon is unavailable', async () => {
    fetch.mockReturnValueOnce(jsonResponse({ secret: 'abc123' }));
    await Leaderboard.runStart();
    vi.stubGlobal('navigator', {});
    fetch.mockReturnValueOnce(Promise.resolve({}));
    Leaderboard.sendCheckpoint(2, 500, {});
    expect(fetch).toHaveBeenCalledWith('/api/runs/checkpoint', expect.objectContaining({ keepalive: true }));
  });

  it('never throws even if sendBeacon itself throws', async () => {
    fetch.mockReturnValueOnce(jsonResponse({ secret: 'abc123' }));
    await Leaderboard.runStart();
    vi.stubGlobal('navigator', { sendBeacon: () => { throw new Error('boom'); } });
    expect(() => Leaderboard.sendCheckpoint(2, 500, {})).not.toThrow();
  });
});

describe('Leaderboard.finishRun', () => {
  it('returns the parsed server response', async () => {
    fetch.mockReturnValueOnce(jsonResponse({ secret: 's1' }));
    await Leaderboard.runStart();
    fetch.mockReturnValueOnce(jsonResponse({ qualifiesForName: true, rank: 4 }));
    const result = await Leaderboard.finishRun(8, 2000, { kills: 10 });
    expect(result).toEqual({ qualifiesForName: true, rank: 4 });
  });

  it('degrades to a safe default if the request throws', async () => {
    fetch.mockReturnValueOnce(jsonResponse({ secret: 's1' }));
    await Leaderboard.runStart();
    fetch.mockRejectedValueOnce(new Error('network down'));
    const result = await Leaderboard.finishRun(8, 2000, {});
    expect(result).toEqual({ qualifiesForName: false, rank: null });
  });

  it('forwards the ending reason to the server', async () => {
    fetch.mockReturnValueOnce(jsonResponse({ secret: 's1' }));
    await Leaderboard.runStart();
    fetch.mockReturnValueOnce(jsonResponse({ qualifiesForName: true, rank: 1 }));
    await Leaderboard.finishRun(8, 2000, { kills: 10 }, 'acquired');
    const [, options] = fetch.mock.calls.at(-1);
    expect(JSON.parse(options.body)).toMatchObject({ reason: 'acquired' });
  });
});

describe('Leaderboard.submitName', () => {
  it('returns {ok:false} without a session', async () => {
    const result = await Leaderboard.submitName('Alice');
    expect(result.ok).toBe(false);
  });

  it('POSTs the name and returns the server response once a session exists', async () => {
    fetch.mockReturnValueOnce(jsonResponse({ secret: 's1' }));
    await Leaderboard.runStart();
    fetch.mockReturnValueOnce(jsonResponse({ ok: true, name: 'Alice' }));
    const result = await Leaderboard.submitName('Alice');
    expect(result).toEqual({ ok: true, name: 'Alice' });
  });

  it('degrades to a safe default if the request throws', async () => {
    fetch.mockReturnValueOnce(jsonResponse({ secret: 's1' }));
    await Leaderboard.runStart();
    fetch.mockRejectedValueOnce(new Error('network down'));
    const result = await Leaderboard.submitName('Alice');
    expect(result).toEqual({ ok: false, reason: 'network' });
  });
});

describe('Leaderboard.fetchLeaderboard', () => {
  it('returns the entries array from the server', async () => {
    fetch.mockReturnValueOnce(jsonResponse({ entries: [{ name: 'Alice', sprint: 12 }] }));
    const entries = await Leaderboard.fetchLeaderboard();
    expect(entries).toEqual([{ name: 'Alice', sprint: 12 }]);
  });

  it('returns an empty array if the request fails', async () => {
    fetch.mockRejectedValueOnce(new Error('network down'));
    const entries = await Leaderboard.fetchLeaderboard();
    expect(entries).toEqual([]);
  });
});
