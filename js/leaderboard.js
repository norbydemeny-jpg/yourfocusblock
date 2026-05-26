// ══════════════════════════════════════════════════════
// leaderboard.js — Vrienden ranglijst (vandaag / deze week)
// ══════════════════════════════════════════════════════

import { supabase } from './supabaseClient.js';

let _lbTab = 'today';

// ── Helpers ────────────────────────────────────────────
function getCurrentUserId() {
  if (typeof window.fbUserId === 'function') {
    return window.fbUserId();
  }
  return null;
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _fmt(mins) {
  if (!mins) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}u ${m}m` : `${h}u`;
}

// ── Data laden ─────────────────────────────────────────
async function _loadData() {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  // Vrienden ophalen
  const { data: fships, error: fErr } = await supabase
    .from('friendships')
    .select('requester_id, receiver_id')
    .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq('status', 'accepted');
  if (fErr) console.error('[Leaderboard] friendships err:', fErr.message);

  const allIds = [
    userId,
    ...(fships || []).map(f =>
      f.requester_id === userId ? f.receiver_id : f.requester_id
    )
  ];

  // Datumgrenzen (maandag = start van de week)
  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart  = new Date(todayStart);
  const dow        = weekStart.getDay(); // 0=zo
  weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));

  // Profielen + sessies parallel
  const [profRes, sessRes] = await Promise.all([
    supabase.from('profiles').select('id, username, avatar_url').in('id', allIds),
    supabase.from('study_sessions')
      .select('user_id, minutes, completed_at')
      .in('user_id', allIds)
      .gte('completed_at', weekStart.toISOString())
      .eq('block_type', 'focus')
  ]);

  if (profRes.error) console.error('[Leaderboard] profiles err:', profRes.error.message);
  if (sessRes.error) console.error('[Leaderboard] sessions err:', sessRes.error.message);

  const pm = {};
  (profRes.data || []).forEach(p => { pm[p.id] = { username: p.username, avatar_url: p.avatar_url || '' }; });
  // Als een vriend-profile/sessie door RLS niet leesbaar is, hebben we nog
  // steeds de ID maar geen username → toon dat duidelijk i.p.v. een '?'.
  allIds.forEach(id => {
    if (!pm[id] && id !== userId) pm[id] = { username: T('lb_unknown_friend') || 'Vriend', avatar_url: '' };
  });

  const todayMins = {}, weekMins = {};
  allIds.forEach(id => { todayMins[id] = 0; weekMins[id] = 0; });

  (sessRes.data || []).forEach(s => {
    weekMins[s.user_id]  = (weekMins[s.user_id]  || 0) + s.minutes;
    if (new Date(s.completed_at) >= todayStart) {
      todayMins[s.user_id] = (todayMins[s.user_id] || 0) + s.minutes;
    }
  });

  return { userId, allIds, pm, todayMins, weekMins };
}

// ── Modal openen / sluiten ─────────────────────────────
function openLeaderboard() {
  document.getElementById('leaderboardOv')?.classList.add('open');
  renderLeaderboard();
}

function closeLeaderboard() {
  document.getElementById('leaderboardOv')?.classList.remove('open');
}

function switchLbTab(tab) {
  _lbTab = tab;
  renderLeaderboard();
}

// ── Renderen ────────────────────────────────────────────
async function renderLeaderboard() {
  const body = document.getElementById('leaderboardBody');
  if (!body) return;

  // Localize modal title
  const titleEl = document.querySelector('#leaderboardOv .modal-title');
  if (titleEl) titleEl.textContent = '🏆 ' + T('lb_title');

  const userId = await getCurrentUserId();
  if (!userId) {
    body.innerHTML = `<p style="text-align:center;color:var(--muted);padding:2rem 0">${T('lb_login_msg')}</p>`;
    return;
  }

  body.innerHTML = `<div style="text-align:center;padding:2rem 0;color:var(--muted)">${T('fr_loading')}</div>`;

  const data = await _loadData();
  if (!data) {
    body.innerHTML = `<p style="text-align:center;color:var(--muted);padding:2rem 0">${T('lb_load_err')}</p>`;
    return;
  }

  const { allIds, pm, todayMins, weekMins } = data;
  const minsField = _lbTab === 'today' ? todayMins : weekMins;

  const entries = allIds
    .map(id => ({
      id,
      username: pm[id]?.username || '?',
      avatar:   pm[id]?.avatar_url || '',
      mins:     minsField[id] || 0,
      isMe:     id === userId
    }))
    .sort((a, b) => b.mins - a.mins || a.username.localeCompare(b.username));

  const maxMins = Math.max(...entries.map(e => e.mins), 1);
  const allZero = entries.every(e => e.mins === 0);

  const medals = ['🥇', '🥈', '🥉'];

  body.innerHTML = `
    <div class="lb-tabs">
      <button class="lb-tab ${_lbTab === 'today' ? 'on' : ''}" onclick="switchLbTab('today')">${T('nav_today')}</button>
      <button class="lb-tab ${_lbTab === 'week'  ? 'on' : ''}" onclick="switchLbTab('week')">${T('prog_week')}</button>
    </div>
    <div class="lb-list">
      ${entries.map((e, i) => {
        const pct  = maxMins > 0 ? Math.round((e.mins / maxMins) * 100) : 0;
        const rank = medals[i] ?? `${i + 1}`;
        return `
          <div class="lb-row ${e.isMe ? 'lb-me' : ''} ${e.mins === 0 ? 'lb-zero' : ''}">
            <div class="lb-rank">${rank}</div>
            <div class="lb-avatar-wrap">${(typeof window.fbAvatarHTML==='function') ? window.fbAvatarHTML(e.username, e.avatar, 34) : `<div class="lb-avatar">${e.username[0].toUpperCase()}</div>`}</div>
            <div class="lb-info">
              <div class="lb-name">
                ${_esc(e.username)}
                ${e.isMe ? `<span class="lb-you">${T('stats_you')}</span>` : ''}
              </div>
              <div class="lb-bar-wrap">
                <div class="lb-bar-fill" style="width:${e.mins > 0 ? Math.max(pct, 3) : 0}%"></div>
              </div>
            </div>
            <div class="lb-mins">${_fmt(e.mins)}</div>
          </div>`;
      }).join('')}
    </div>
    ${allZero ? `
      <div class="lb-empty">
        <div class="lb-empty-icon">📚</div>
        <div class="lb-empty-txt">${_lbTab === 'today' ? T('lb_no_sessions_today') : T('lb_no_sessions_week')}</div>
        <div class="lb-empty-sub">${T('lb_who_first')}</div>
      </div>` : ''}`;
}

// ── Auto-refresh elke minuut als modal open is ─────────
setInterval(() => {
  if (document.getElementById('leaderboardOv')?.classList.contains('open')) {
    renderLeaderboard();
  }
}, 60_000);

// ── Expose ────────────────────────────────────────────
window.openLeaderboard  = openLeaderboard;
window.closeLeaderboard = closeLeaderboard;
window.switchLbTab      = switchLbTab;
window.fbLoadLeaderboard = _loadData;   // used by the Stats & friends page
