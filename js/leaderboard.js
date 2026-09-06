// Talks to the /api/runs/* and /api/leaderboard Cloudflare Pages Functions
// (see functions/). Strictly additive: every call is wrapped so a network
// failure or unreachable API degrades silently — the game must play
// identically to how it always has if the backend is ever down.
(function () {
  let secret = null;

  function post(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then((r) => r.json());
  }

  async function runStart() {
    secret = null;
    try {
      const res = await post('/api/runs/start', {});
      secret = res && res.secret ? res.secret : null;
    } catch (e) { secret = null; }
  }

  // Fire-and-forget by design — called from wave-start callbacks, must
  // never block gameplay on a network round trip. sendBeacon survives a
  // tab close mid-request; fetch(keepalive) is the fallback where it's
  // unavailable.
  function sendCheckpoint(claimedSprint, budget, stats) {
    if (!secret) return;
    const payload = JSON.stringify({ secret, claimedSprint, budget, stats });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/runs/checkpoint', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch('/api/runs/checkpoint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
      }
    } catch (e) { /* never let a checkpoint failure affect gameplay */ }
  }

  async function finishRun(claimedSprint, budget, stats, reason) {
    if (!secret) return { qualifiesForName: false, rank: null };
    try {
      return await post('/api/runs/finish', { secret, claimedSprint, budget, stats, reason });
    } catch (e) {
      return { qualifiesForName: false, rank: null };
    }
  }

  async function submitName(name) {
    if (!secret) return { ok: false, reason: 'no_session' };
    try {
      return await post('/api/runs/name', { secret, name });
    } catch (e) {
      return { ok: false, reason: 'network' };
    }
  }

  async function fetchLeaderboard() {
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      return (data && data.entries) || [];
    } catch (e) {
      return [];
    }
  }

  window.Game.Leaderboard = { runStart, sendCheckpoint, finishRun, submitName, fetchLeaderboard };
})();
