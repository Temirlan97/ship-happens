// Standalone admin tool for curating the leaderboard and viewing aggregate
// stats. The password is held in memory only (never localStorage) and is
// sent as a header on every admin API call — see functions/_shared/adminAuth.js.
(function () {
  let password = null;
  let page = 0;
  let feedbackPage = 0;
  const PAGE_SIZE = 50;

  const el = (id) => document.getElementById(id);

  function authedFetch(path, options) {
    return fetch(path, {
      ...options,
      headers: { ...(options && options.headers), 'X-Admin-Password': password }
    });
  }

  async function tryLogin() {
    const input = el('passwordInput');
    const errorEl = el('passwordError');
    password = input.value;
    const res = await authedFetch('/api/admin/stats');
    if (res.status === 401) {
      password = null;
      errorEl.textContent = 'Wrong password.';
      errorEl.classList.remove('hidden');
      return;
    }
    el('passwordGate').classList.add('hidden');
    el('adminPanel').classList.remove('hidden');
    await refreshAll();
  }

  async function refreshAll() {
    await Promise.all([loadStats(), loadRuns(), loadFeedback()]);
  }

  async function loadStats() {
    const res = await authedFetch('/api/admin/stats');
    if (!res.ok) return;
    const { totals, bySprint } = await res.json();
    const grid = el('statsGrid');
    grid.innerHTML = '';
    const boxes = [
      ['Total runs', totals.totalRuns],
      ['Finished runs', totals.finishedRuns],
      ['Suspicious runs', totals.suspiciousRuns],
      ['Total playtime', formatDuration(totals.totalPlaySeconds)],
      ['Avg run length', formatDuration(Math.round(totals.avgPlaySeconds))],
      ['Avg sprint reached', Math.round(totals.avgSprintReached * 10) / 10],
      ['Best sprint ever', totals.bestSprintEver],
      ['Distinct sprint counts', bySprint.length]
    ];
    boxes.forEach(([label, value]) => {
      const box = document.createElement('div');
      box.className = 'stat-box';
      const valueEl = document.createElement('div');
      valueEl.className = 'value';
      valueEl.textContent = String(value);
      const labelEl = document.createElement('div');
      labelEl.className = 'label';
      labelEl.textContent = label;
      box.appendChild(valueEl);
      box.appendChild(labelEl);
      grid.appendChild(box);
    });
  }

  function formatDuration(totalSeconds) {
    const s = totalSeconds || 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  async function loadRuns() {
    const params = new URLSearchParams({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    if (el('filterSuspicious').checked) params.set('suspicious', '1');
    if (el('filterApproved').checked) params.set('approved', '1');
    const res = await authedFetch('/api/admin/runs?' + params.toString());
    if (!res.ok) return;
    const { runs } = await res.json();
    renderRuns(runs || []);
    el('pageLabel').textContent = String(page + 1);
  }

  function renderRuns(runs) {
    const tbody = el('runsBody');
    tbody.innerHTML = '';
    runs.forEach((run) => {
      const tr = document.createElement('tr');
      if (run.suspicious) tr.classList.add('suspicious');
      if (!run.approved) tr.classList.add('hidden-row');

      const cells = [
        run.id,
        run.player_name || '—',
        run.ending_reason === 'acquired' ? 'Acquired' : (run.finished_at ? 'Bankrupt' : '—'),
        run.claimed_sprint,
        run.claimed_budget,
        formatDuration(run.duration_seconds),
        run.checkpoint_count,
        run.suspicious ? (run.suspicious_reason || 'yes') : 'no',
        run.approved ? 'yes' : 'no'
      ];
      cells.forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value === null || value === undefined ? '' : String(value);
        tr.appendChild(td);
      });

      const actionsTd = document.createElement('td');
      const renameBtn = actionBtn('Rename', () => renameRun(run.id));
      const toggleBtn = actionBtn(run.approved ? 'Hide' : 'Unhide', () => toggleApproved(run.id, !run.approved));
      const deleteBtn = actionBtn('Delete', () => deleteRun(run.id), true);
      actionsTd.append(renameBtn, toggleBtn, deleteBtn);
      tr.appendChild(actionsTd);

      tbody.appendChild(tr);
    });
  }

  function actionBtn(label, onClick, danger) {
    const btn = document.createElement('button');
    btn.textContent = label;
    if (danger) btn.classList.add('danger');
    btn.addEventListener('click', onClick);
    return btn;
  }

  async function renameRun(id) {
    const name = window.prompt('New name (leave blank to clear):');
    if (name === null) return;
    await authedFetch(`/api/admin/runs/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ player_name: name })
    });
    await loadRuns();
  }

  async function toggleApproved(id, approved) {
    await authedFetch(`/api/admin/runs/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved })
    });
    await loadRuns();
  }

  async function deleteRun(id) {
    if (!window.confirm('Delete this run permanently?')) return;
    await authedFetch(`/api/admin/runs/${id}`, { method: 'DELETE' });
    await loadRuns();
  }

  async function loadFeedback() {
    const params = new URLSearchParams({ limit: PAGE_SIZE, offset: feedbackPage * PAGE_SIZE });
    const res = await authedFetch('/api/admin/feedback?' + params.toString());
    if (!res.ok) return;
    const { feedback } = await res.json();
    renderFeedback(feedback || []);
    el('feedbackPageLabel').textContent = String(feedbackPage + 1);
  }

  function renderFeedback(items) {
    const tbody = el('feedbackBody');
    tbody.innerHTML = '';
    items.forEach((item) => {
      const tr = document.createElement('tr');

      const idTd = document.createElement('td');
      idTd.textContent = String(item.id);
      tr.appendChild(idTd);

      const receivedTd = document.createElement('td');
      receivedTd.textContent = new Date(item.created_at).toLocaleString();
      tr.appendChild(receivedTd);

      // .textContent (never innerHTML) is the actual XSS guard here — a
      // message containing e.g. "<script>" renders as inert literal text,
      // never parsed as markup.
      const messageTd = document.createElement('td');
      messageTd.className = 'message-cell';
      messageTd.textContent = item.message;
      tr.appendChild(messageTd);

      const actionsTd = document.createElement('td');
      actionsTd.appendChild(actionBtn('Delete', () => deleteFeedback(item.id), true));
      tr.appendChild(actionsTd);

      tbody.appendChild(tr);
    });
  }

  async function deleteFeedback(id) {
    if (!window.confirm('Delete this feedback permanently?')) return;
    await authedFetch(`/api/admin/feedback/${id}`, { method: 'DELETE' });
    await loadFeedback();
  }

  el('passwordSubmit').addEventListener('click', tryLogin);
  el('passwordInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });
  el('refreshBtn').addEventListener('click', refreshAll);
  el('filterSuspicious').addEventListener('change', () => { page = 0; loadRuns(); });
  el('filterApproved').addEventListener('change', () => { page = 0; loadRuns(); });
  el('prevPageBtn').addEventListener('click', () => { if (page > 0) { page--; loadRuns(); } });
  el('nextPageBtn').addEventListener('click', () => { page++; loadRuns(); });
  el('feedbackPrevPageBtn').addEventListener('click', () => { if (feedbackPage > 0) { feedbackPage--; loadFeedback(); } });
  el('feedbackNextPageBtn').addEventListener('click', () => { feedbackPage++; loadFeedback(); });
})();
