// ══════════════════════════════════════════════════════
// friends.js — Vriendensysteem via Supabase friendships
// Kolommen: requester_id, receiver_id, status
// ══════════════════════════════════════════════════════

import { supabase } from './supabaseClient.js';

let _friendsTab = 'list';
let _searchResults = [];
let _searchQuery   = '';
let _friendsExpanded = false;
const FRIENDS_PREVIEW_COUNT = 5;

// In-memory cache zodat de modal nooit terug naar 'Laden...' gaat als we
// eerder al data hadden. Wordt gerefresht in de achtergrond.
let _friendsCache  = null; // {friends, requests, ts}
let _userIdCache   = null;

// ── Auth helper ────────────────────────────────────────
function getCurrentUserId() {
  if (typeof window.fbUserId === 'function') {
    return window.fbUserId();
  }
  return null;
}

// Cache will be cleared/refreshed in the consolidated auth state listener at the end of the file.

async function _refreshFriendsCacheSilent(){
  try {
    const [friends, requests] = await Promise.all([getFriends(), getIncomingRequests()]);
    _friendsCache = { friends, requests, ts: Date.now() };
    // Re-render als modal open is.
    if (document.getElementById('friendsOv')?.classList.contains('open')) {
      renderFriendsModal();
    }
  } catch { /* stille fail — cache blijft staan */ }
}

// ══════════════════════════════════════════════════════
// BACKEND — Supabase queries
// ══════════════════════════════════════════════════════

async function searchUsers(query) {
  const userId = getCurrentUserId();
  if (!userId || query.trim().length < 2) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .ilike('username', `%${query.trim()}%`)
    .neq('id', userId)
    .limit(8);
  if (error) {
    console.error('[Friends] searchUsers database error:', error.message);
  }
  return data || [];
}

async function getExistingRelation(targetId) {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const { data } = await supabase
    .from('friendships')
    .select('id, status, requester_id, receiver_id')
    .or(`and(requester_id.eq.${userId},receiver_id.eq.${targetId}),and(requester_id.eq.${targetId},receiver_id.eq.${userId})`);
  return data?.[0] ?? null;
}

async function sendFriendRequest(targetUserId) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error(T('fr_not_logged_in'));
  const existing = await getExistingRelation(targetUserId);
  if (existing) {
    if (existing.status === 'accepted') throw new Error(T('fr_already_friends'));
    throw new Error(T('fr_pending'));
  }
  const { error } = await supabase.from('friendships').insert({
    requester_id: userId,
    receiver_id:  targetUserId,
    status:       'pending'
  });
  if (error) throw error;
}

async function getIncomingRequests() {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { data: reqs } = await supabase
    .from('friendships')
    .select('id, requester_id, created_at')
    .eq('receiver_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (!reqs || reqs.length === 0) return [];
  const senderIds = reqs.map(r => r.requester_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', senderIds);
  const pm = {};
  (profiles || []).forEach(p => { pm[p.id] = p; });
  return reqs.map(r => ({
    id:         r.id,
    sender_id:  r.requester_id,
    username:   pm[r.requester_id]?.username || '?',
    avatar_url: pm[r.requester_id]?.avatar_url || '',
    created_at: r.created_at
  }));
}

async function acceptRequest(friendshipId) {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);
  if (error) throw error;
}

async function declineRequest(friendshipId) {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);
  if (error) throw error;
}

async function getFriends() {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { data: fships, error: fErr } = await supabase
    .from('friendships')
    .select('id, requester_id, receiver_id')
    .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq('status', 'accepted');
  if (fErr) { console.error('[Friends] friendships query failed:', fErr.message); throw fErr; }
  if (!fships || fships.length === 0) return [];
  const otherIds = fships.map(f =>
    f.requester_id === userId ? f.receiver_id : f.requester_id
  );
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', otherIds);
  if (pErr) console.warn('[Friends] profiles query warn:', pErr.message);
  const pm = {};
  (profiles || []).forEach(p => { pm[p.id] = p; });
  return fships.map(f => {
    const otherId = f.requester_id === userId ? f.receiver_id : f.requester_id;
    return { id: f.id, friend_id: otherId, username: pm[otherId]?.username || '?', avatar_url: pm[otherId]?.avatar_url || '' };
  });
}

async function removeFriend(friendshipId) {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);
  if (error) throw error;
}

// ── Statussen ophalen voor vriendenlijst ───────────────
async function _getStatuses(friendIds) {
  if (!friendIds.length) return {};
  // Gebruik cache van status.js als beschikbaar (sneller)
  const cache = window.getStatusCache?.();
  if (cache && Object.keys(cache).length > 0) return cache;
  // Anders direct uit Supabase
  const { data } = await supabase
    .from('user_status')
    .select('user_id, status')
    .in('user_id', friendIds);
  const map = {};
  (data || []).forEach(r => { map[r.user_id] = r.status; });
  return map;
}

// ══════════════════════════════════════════════════════
// UI — Modal rendering
// ══════════════════════════════════════════════════════

function openFriendsModal() {
  renderFriendsModal();
  document.getElementById('friendsOv').classList.add('open');
}

function closeFriendsModal() {
  document.getElementById('friendsOv').classList.remove('open');
}

function switchFriendsTab(tab) {
  _friendsTab = tab;
  renderFriendsModal();
}

// Run an async fn with a hard timeout so the modal never hangs forever on
// a broken RLS policy or stalled network. Throws a tagged error on timeout.
function _withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout:${label}`)), ms))
  ]);
}

async function renderFriendsModal() {
  const body = document.getElementById('friendsModalBody');
  if (!body) return;

  // Localize the modal title
  const titleEl = document.querySelector('#friendsOv .modal-title');
  if (titleEl) titleEl.textContent = T('fr_title');

  // Heb ik cached data? Render direct, ververs daarna stilletjes.
  // Zo zien gebruikers nooit "Laden..." na de eerste keer dat ze hebben geladen.
  const haveCache = _friendsCache && _friendsCache.friends;
  if (!haveCache) {
    body.innerHTML = `<div style="text-align:center;padding:2rem 0;color:var(--muted)">${T('fr_loading')}</div>`;
  }

  try {
    const userId = await _withTimeout(getCurrentUserId(), 5000, 'session');
    if (!userId) {
      _friendsCache = null;
      body.innerHTML = `<p style="text-align:center;color:var(--muted);padding:2rem 0">${T('fr_login_msg')}</p>`;
      return;
    }

    let friends, requests;
    if (haveCache) {
      // Toon meteen cache, ververs in achtergrond zonder loading-state.
      friends  = _friendsCache.friends;
      requests = _friendsCache.requests;
      _refreshFriendsCacheSilent();
    } else {
      [friends, requests] = await _withTimeout(
        Promise.all([getFriends(), getIncomingRequests()]),
        10000,
        'friends'
      );
      _friendsCache = { friends, requests, ts: Date.now() };
    }
    const reqCount = requests.length;

    const friendIds = friends.map(f => f.friend_id);
    let statusMap = {};
    try { statusMap = await _getStatuses(friendIds); } catch {}

    const statusOrder = { studying: 0, break: 1, online: 2, offline: 3 };
    const friendsWithStatus = friends
      .map(f => ({ ...f, status: statusMap[f.friend_id] || 'offline' }))
      .sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3));

    body.innerHTML = `
      <div class="fr-tabs">
        <button class="fr-tab ${_friendsTab === 'list'     ? 'on' : ''}" onclick="switchFriendsTab('list')">
          ${T('fr_tab_list')}${friends.length ? ` <span class="fr-badge">${friends.length}</span>` : ''}
        </button>
        <button class="fr-tab ${_friendsTab === 'requests' ? 'on' : ''}" onclick="switchFriendsTab('requests')">
          ${T('fr_tab_requests')}${reqCount ? ` <span class="fr-badge fr-badge-alert">${reqCount}</span>` : ''}
        </button>
        <button class="fr-tab ${_friendsTab === 'search'   ? 'on' : ''}" onclick="switchFriendsTab('search')">${T('fr_tab_search')}</button>
      </div>
      <div id="frContent"></div>
      <div class="fr-lb-link">
        <button class="fr-lb-link-btn" onclick="closeFriendsModal();openLeaderboard()">${T('fr_open_lb')}</button>
      </div>`;

    const content = document.getElementById('frContent');
    if (_friendsTab === 'list')          renderFriendsList(content, friendsWithStatus);
    else if (_friendsTab === 'requests') renderRequests(content, requests);
    else                                 renderSearch(content);

  } catch (e) {
    const msg = String(e?.message || '');
    const detail = /^timeout:/.test(msg)
      ? (T('fr_timeout') || 'De server reageert niet. Check je verbinding.')
      : (msg.includes('row-level security') || msg.includes('permission denied'))
        ? (T('fr_rls_hint') || 'Database-toegang geweigerd. Controleer je RLS-policies in Supabase.')
        : (T('fr_load_err') || 'Kon vrienden niet laden.');
    body.innerHTML = `
      <p style="text-align:center;color:var(--muted);padding:1.5rem 0 0.5rem">${detail}</p>
      <p style="text-align:center;color:var(--muted);font-size:0.8rem;opacity:0.7;margin:0">${escHtml(msg).slice(0,160)}</p>
      <div style="text-align:center;margin-top:1rem"><button class="btn-ghost" onclick="renderFriendsModal()">${T('fr_retry') || 'Opnieuw'}</button></div>`;
    console.error('[Friends] renderFriendsModal error:', e);
  }
}

// ── Avatar helper ──────────────────────────────────────
function _frAv(o, size){
  return (typeof window.fbAvatarHTML === 'function')
    ? window.fbAvatarHTML(o.username, o.avatar_url, size || 44)
    : `<div class="fr-card-avatar">${(o.username||'?')[0].toUpperCase()}</div>`;
}

// ── Status helpers ─────────────────────────────────────
function _statusDot(status) {
  return `<span class="status-dot ${status || 'offline'}"></span>`;
}

function _statusTxt(status) {
  const labels = { studying: T('status_studying'), break: T('status_break'), online: T('status_online'), offline: T('status_offline') };
  return `<span class="fr-status-txt ${status || 'offline'}">${labels[status] || T('status_offline')}</span>`;
}

// ── Vriendenlijst ──────────────────────────────────────
function renderFriendsList(container, friends) {
  if (!friends.length) {
    container.innerHTML = `
      <div class="fr-empty">
        <div class="fr-empty-icon">👥</div>
        <div class="fr-empty-txt">${T('fr_no_friends')}</div>
        <div class="fr-empty-sub">${T('fr_search_hint')}</div>
        <button class="btn-ghost" style="margin-top:1rem" onclick="switchFriendsTab('search')">${T('fr_tab_search')}</button>
      </div>`;
    // still render the week-section even when empty, in case there's solo history
    _renderWeekSection(container);
    return;
  }

  const showAll = _friendsExpanded || friends.length <= FRIENDS_PREVIEW_COUNT;
  const visible = showAll ? friends : friends.slice(0, FRIENDS_PREVIEW_COUNT);
  const more = friends.length - visible.length;

  container.innerHTML = `
    <div id="frWeekSection"></div>
    <div class="fr-list">
      ${visible.map(f => `
        <div class="fr-card" data-fid="${escHtml(f.friend_id || '')}" data-fname="${escHtml(f.username)}" data-favatar="${escHtml(f.avatar_url || '')}">
          <div class="fr-avatar-wrap fr-clickable">
            ${_frAv(f, 46)}
            ${_statusDot(f.status)}
          </div>
          <div class="fr-card-info fr-clickable">
            <div class="fr-card-name">${escHtml(f.username)}</div>
            <div class="fr-card-status-row">${_statusTxt(f.status)}</div>
          </div>
          <button class="fr-remove-btn" onclick="handleRemoveFriend('${f.id}','${escHtml(f.username)}')" title="${T('fr_remove')}">✕</button>
        </div>`).join('')}
    </div>
    ${more > 0 || _friendsExpanded && friends.length > FRIENDS_PREVIEW_COUNT
      ? `<button class="fr-view-all-btn" onclick="toggleFriendsExpanded()">${
          _friendsExpanded ? T('fr_show_less') : Tf('fr_view_all', {n: more})
        }</button>`
      : ''}
  `;
  // wire click → openFriendStats
  container.querySelectorAll('.fr-card .fr-clickable').forEach(el => {
    el.onclick = () => {
      const card = el.closest('.fr-card');
      if (!card) return;
      openFriendStats(card.dataset.fid, card.dataset.fname, card.dataset.favatar);
    };
  });
  _renderWeekSection(container.querySelector('#frWeekSection') || container, friends);
}

function toggleFriendsExpanded() {
  _friendsExpanded = !_friendsExpanded;
  renderFriendsModal();
}

// ── "Vrienden van deze week" — top 3 by week minutes ────
async function _renderWeekSection(host, friendsList) {
  if (!host) return;
  let data;
  try { data = (typeof window.fbLoadLeaderboard === 'function') ? await window.fbLoadLeaderboard() : null; } catch { data = null; }
  if (!data) { host.innerHTML = ''; return; }
  const me = data.userId;
  const entries = data.allIds
    .filter(id => id !== me)
    .map(id => ({ id, username: data.pm[id]?.username || '?', avatar: data.pm[id]?.avatar_url || '', mins: data.weekMins[id] || 0 }))
    .filter(e => e.mins > 0)
    .sort((a, b) => b.mins - a.mins)
    .slice(0, 3);
  if (!entries.length) { host.innerHTML = ''; return; }
  host.innerHTML = `
    <div class="fr-week-section">
      <div class="fr-week-title">🔥 ${T('fr_week_active')}</div>
      <div class="fr-week-row">
        ${entries.map(e => `
          <button class="fr-week-chip" onclick="openFriendStats('${e.id}','${escHtml(e.username)}','${escHtml(e.avatar)}')">
            ${_frAv({username: e.username, avatar_url: e.avatar}, 36)}
            <span class="fr-week-name">${escHtml(e.username)}</span>
            <span class="fr-week-mins">${_fmtMins(e.mins)}</span>
          </button>
        `).join('')}
      </div>
    </div>`;
}

// ── Verzoeken ──────────────────────────────────────────
function renderRequests(container, requests) {
  if (!requests.length) {
    container.innerHTML = `
      <div class="fr-empty">
        <div class="fr-empty-icon">📭</div>
        <div class="fr-empty-txt">${T('fr_no_requests')}</div>
      </div>`;
    return;
  }
  container.innerHTML = `<div class="fr-list">
    ${requests.map(r => `
      <div class="fr-card">
        <div class="fr-avatar-wrap">${_frAv(r, 46)}</div>
        <div class="fr-card-info">
          <div class="fr-card-name">${escHtml(r.username)}</div>
          <div class="fr-card-status-row"><span class="fr-status-txt offline">${T('fr_wants_friend')}</span></div>
        </div>
        <div class="fr-req-btns">
          <button class="fr-accept-btn" onclick="handleAccept('${r.id}')">✓</button>
          <button class="fr-decline-btn" onclick="handleDecline('${r.id}')">✕</button>
        </div>
      </div>`).join('')}
  </div>`;
}

function renderSearch(container) {
  if (document.getElementById('frSearchInput')) {
    return;
  }
  container.innerHTML = `
    <div class="fr-search-wrap">
      <input type="text" id="frSearchInput" class="txt-input" placeholder="${T('fr_search_ph')}"
        value="${escHtml(_searchQuery)}" oninput="handleFrSearch(this.value)" autocomplete="off" />
    </div>
    <div id="frSearchResults"></div>`;
  document.getElementById('frSearchInput')?.focus();
  if (_searchQuery) renderSearchResults(document.getElementById('frSearchResults'), _searchResults);
}

function renderSearchResults(container, results) {
  if (!container) return;
  if (!results.length && _searchQuery.length >= 2) {
    container.innerHTML = `<div class="fr-empty"><div class="fr-empty-txt">${T('fr_no_users')}</div></div>`;
    return;
  }
  if (!results.length) { container.innerHTML = ''; return; }
  container.innerHTML = `<div class="fr-list" style="margin-top:1rem">
    ${results.map(u => `
      <div class="fr-card">
        <div class="fr-avatar-wrap">${_frAv(u, 46)}</div>
        <div class="fr-card-info">
          <div class="fr-card-name">${escHtml(u.username)}</div>
        </div>
        <button class="fr-add-btn" onclick="handleSendRequest('${u.id}','${escHtml(u.username)}',this)">${T('fr_add')}</button>
      </div>`).join('')}
  </div>`;
}

// ── Handlers ───────────────────────────────────────────
let _searchT = null;
async function handleFrSearch(val) {
  _searchQuery = val;
  const resultsEl = document.getElementById('frSearchResults');
  if (val.trim().length < 2) { _searchResults = []; if (resultsEl) resultsEl.innerHTML = ''; return; }
  if (_searchT) clearTimeout(_searchT);
  _searchT = setTimeout(async () => {
    _searchResults = await searchUsers(val);
    renderSearchResults(document.getElementById('frSearchResults'), _searchResults);
  }, 300);
}

async function handleSendRequest(targetId, username, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    await sendFriendRequest(targetId);
    if (btn) { btn.textContent = T('fr_sent'); btn.classList.add('fr-sent'); }
    toast(Tf('fr_request_sent', {name: username}));
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = T('fr_add'); }
    toast(e.message);
  }
}

async function handleAccept(friendshipId) {
  try {
    await acceptRequest(friendshipId);
    toast(T('fr_accepted'));
    _friendsCache = null;        // cache invalideren — er is een nieuwe vriend
    renderFriendsModal();
    window.reloadFriendStatuses?.();
  } catch (e) { toast(Tf('fr_err', {msg: e.message})); }
}

async function handleDecline(friendshipId) {
  try {
    await declineRequest(friendshipId);
    _friendsCache = null;
    renderFriendsModal();
  } catch (e) { toast(Tf('fr_err', {msg: e.message})); }
}

async function handleRemoveFriend(friendshipId, username) {
  if (!confirm(Tf('fr_remove_confirm', {name: username}))) return;
  try {
    await removeFriend(friendshipId);
    toast(Tf('fr_removed', {name: username}));
    _friendsCache = null;
    renderFriendsModal();
    window.reloadFriendStatuses?.();
  } catch (e) { toast(Tf('fr_err', {msg: e.message})); }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toast(msg) { if (typeof window.banner === 'function') window.banner(msg); }

// ── Vrienden-knop tonen/verbergen op basis van auth ────
async function updateFriendsUI(userId) {
  document.querySelectorAll('.friends-area').forEach(area => {
    if (userId) {
      area.innerHTML = `
        <button class="icon-btn" onclick="openFriendsModal()" title="Vrienden" style="position:relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </button>`;
      getIncomingRequests().then(reqs => {
        if (reqs.length > 0) {
          area.querySelector('button')?.insertAdjacentHTML('beforeend',
            '<span class="fr-notif-dot"></span>');
        }
      });
    } else {
      area.innerHTML = '';
    }
  });
}

async function handleFriendsAuthStateChange(event, session) {
  const userId = session?.user?.id ?? null;
  _userIdCache = userId;

  if (event === 'SIGNED_OUT') {
    _friendsCache = null;
  } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
    _refreshFriendsCacheSilent();
  }

  await updateFriendsUI(userId);
}

(async () => {
  await window.fbAuthReady;
  _userIdCache = window.fbUserId();
  await updateFriendsUI(_userIdCache);
  // Register the auth listener after page load initialization to avoid race conditions
  supabase.auth.onAuthStateChange(handleFriendsAuthStateChange);
})();

// ══════════════════════════════════════════════════════
// FRIEND STATS — popup met sessies + vakken per vriend
// ══════════════════════════════════════════════════════
async function _loadFriendStats(friendId) {
  // Week start (maandag)
  const now = new Date();
  const wkStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = wkStart.getDay();
  wkStart.setDate(wkStart.getDate() - (dow === 0 ? 6 : dow - 1));

  // Vandaag start
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const { data: sess } = await supabase
    .from('study_sessions')
    .select('minutes, subject, completed_at, block_type')
    .eq('user_id', friendId)
    .eq('block_type', 'focus')
    .order('completed_at', { ascending: false });

  const rows = sess || [];
  let totalMins = 0, weekMins = 0, todayMins = 0;
  const perSubject = {};
  rows.forEach(r => {
    const m = r.minutes || 0;
    totalMins += m;
    const dt = new Date(r.completed_at);
    if (dt >= wkStart) weekMins += m;
    if (dt >= dayStart) todayMins += m;
    const key = (r.subject || '—').trim() || '—';
    if (!perSubject[key]) perSubject[key] = { mins: 0, sessions: 0 };
    perSubject[key].mins += m;
    perSubject[key].sessions += 1;
  });
  const subjects = Object.entries(perSubject)
    .map(([name, v]) => ({ name, mins: v.mins, sessions: v.sessions }))
    .sort((a, b) => b.mins - a.mins);
  return { totalMins, weekMins, todayMins, sessionsCount: rows.length, subjects };
}

function _fmtMins(mins) {
  if (!mins) return '0m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}u ${m}m` : `${h}u`;
}

function _colorFor(name) {
  if (typeof window.colorFor === 'function') return window.colorFor(name);
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const palette = ['#c8f060','#fb7185','#67e8f9','#fcd34d','#c084fc','#6ee7b7','#f0a868','#38bdf8','#f472b6','#a3e635'];
  return palette[Math.abs(h) % palette.length];
}

async function openFriendStats(friendId, username, avatarUrl) {
  const ov = document.getElementById('friendStatsOv');
  if (!ov) return;
  ov.classList.add('open');
  const titleEl = document.getElementById('friendStatsTitle');
  const body = document.getElementById('friendStatsBody');
  if (titleEl) titleEl.textContent = (typeof Tf === 'function' ? Tf('fs_title', {name: username}) : (username + ' — stats'));
  body.innerHTML = `<div style="text-align:center;padding:2rem 0;color:var(--muted)">${T('fr_loading')}</div>`;

  let stats;
  try {
    stats = await _loadFriendStats(friendId);
  } catch (e) {
    body.innerHTML = `<p style="text-align:center;color:var(--muted);padding:2rem 0">${T('fr_load_err')}</p>`;
    return;
  }

  const maxS = Math.max(...stats.subjects.map(s => s.mins), 1);
  const subjHtml = stats.subjects.length
    ? stats.subjects.map(s => {
        const w = Math.round(s.mins / maxS * 100);
        const col = _colorFor(s.name);
        return `<div class="fs-subj-row">
          <span class="fs-subj-name"><span class="fs-subj-dot" style="background:${col}"></span>${escHtml(s.name)}</span>
          <span class="fs-subj-bar"><span class="fs-subj-fill" style="width:${w}%;background:${col}"></span></span>
          <span class="fs-subj-sess">${s.sessions}×</span>
          <span class="fs-subj-time">${_fmtMins(s.mins)}</span>
        </div>`;
      }).join('')
    : `<div class="fs-empty">${T('fs_no_data')}</div>`;

  body.innerHTML = `
    <div class="fs-head">
      <div class="fs-avatar">${_frAv({username, avatar_url: avatarUrl}, 64)}</div>
      <div class="fs-headinfo">
        <div class="fs-name">${escHtml(username)}</div>
        <div class="fs-sub">${stats.sessionsCount} ${T('fs_sessions')}</div>
      </div>
    </div>
    <div class="fs-grid">
      <div class="fs-cell"><div class="fs-cell-lbl">${T('nav_today')}</div><div class="fs-cell-val">${_fmtMins(stats.todayMins)}</div></div>
      <div class="fs-cell"><div class="fs-cell-lbl">${T('prog_week')}</div><div class="fs-cell-val">${_fmtMins(stats.weekMins)}</div></div>
      <div class="fs-cell"><div class="fs-cell-lbl">${T('fs_total')}</div><div class="fs-cell-val">${_fmtMins(stats.totalMins)}</div></div>
    </div>
    <div class="fs-section-title">${T('fs_per_subject')}</div>
    <div class="fs-subj-list">${subjHtml}</div>
  `;
}

function closeFriendStats() {
  document.getElementById('friendStatsOv')?.classList.remove('open');
}

// ── Expose aan window ───────────────────────────────────
window.openFriendStats        = openFriendStats;
window.closeFriendStats       = closeFriendStats;
window.toggleFriendsExpanded  = toggleFriendsExpanded;
window.openFriendsModal   = openFriendsModal;
window.closeFriendsModal  = closeFriendsModal;
window.switchFriendsTab   = switchFriendsTab;
window.renderFriendsModal = renderFriendsModal;
window.handleFrSearch     = handleFrSearch;
window.handleSendRequest  = handleSendRequest;
window.handleAccept       = handleAccept;
window.handleDecline      = handleDecline;
window.handleRemoveFriend = handleRemoveFriend;
