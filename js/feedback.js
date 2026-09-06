// Talks to /api/feedback (see functions/api/feedback.js). Same fail-silent
// contract as js/leaderboard.js — a network failure just means the
// submission didn't go through, never a gameplay-affecting error.
(function () {
  async function submitFeedback(message) {
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message })
      });
      return await res.json();
    } catch (e) {
      return { ok: false, reason: 'network' };
    }
  }

  window.Game.Feedback = { submitFeedback };
})();
