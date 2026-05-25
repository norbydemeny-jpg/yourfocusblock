// ══════════════════════════════════════════════════════
// friends.js — Vriendensysteem via Supabase friendships
// Kolommen: requester_id, receiver_id, status
// ══════════════════════════════════════════════════════

import { supabase } from './supabaseClient.js';

let _friendsTab = 'list';
let _searchResults = [];
let _searchQuery   = '';

// ── Auth helper ────────────────────────────────────────
async function getCurrentUserId() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch { return null; }
}

// ══════════════════════════════════════════════════════
// BACKEND — Supabase queries
// ══════════════════════════════════════════════════════

async function searchUsers(query) {
  const userId = await getCurrentUserId();
  if (!userId || query.trim().length < 2) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, username')
    .ilike('username', `%${query.trim()}%`)
    .neq('id', userId)
    .limit(8);
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
  if (!userId) throw new Error('Niet ingelogd');
  const existing = await getExistingRelation(targetUserId);
  if (existing) {
    if (existing.status === 'accepted') throw new Error('Jullie zijn al vrienden');
    throw new Error('Er is al een openstaand verzoek');
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
    .select('id, username')
    .in('id', senderIds);
  const pm = {};
  (profiles || []).forEach(p => { pm[p.id] = p; });
  return reqs.map(r => ({
    id:         r.id,
    sender_id:  r.requester_id,
    username:   pm[r.requester_id]?.username || '?',
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
  const { data: fships } = await supabase
    .from('friendships')
    .select('id, requester_id, receiver_id')
    .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq('status', 'accepted');
  if (!fships || fships.length === 0) return [];
  const otherIds = fships.map(f =>
    f.requester_id === userId ? f.receiver_id : f.requester_id
  );
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', otherIds);
  const pm = {};
  (profiles || []).forEach(p => { pm[p.id] = p; });
  return fships.map(f => {
    const otherId = f.requester_id === userId ? f.receiver_id : f.requester_id;
    return { id: f.id, friend_id: otherId, username: pm[otherId]?.username || '?' };
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

async function renderFriendsModal() {
  const body = document.getElementById('friendsModalBody');
  if (!body) return;
  const userId = await getCurrentUserId();
  if (!userId) {
    body.innerHTML = `<p style="text-align:center;color:var(--muted);padding:2rem 0">Log in om vrienden te gebruiken.</p>`;
    return;
  }

  const [friends, requests] = await Promise.all([getFriends(), getIncomingRequests()]);
  const reqCount = requests.length;

  // Statussen ophalen + toevoegen aan vriendenlijst
  const friendIds   = friends.map(f => f.friend_id);
  const statusMap   = await _getStatuses(friendIds);
  const statusOrder = { studying: 0, break: 1, offline: 2 };

  const friendsWithStatus = friends
    .map(f => ({ ...f, status: statusMap[f.friend_id] || 'offline' }))
    .sort((a, b) => (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2));

  body.innerHTML = `
    <div class="fr-tabs">
      <button class="fr-tab ${_friendsTab === 'list'     ? 'on' : ''}" onclick="switchFriendsTab('list')">
        Vrienden${friends.length ? ` <span class="fr-badge">${friends.length}</span>` : ''}
      </button>
      <button class="fr-tab ${_friendsTab === 'requests' ? 'on' : ''}" onclick="switchFriendsTab('requests')">
        Verzoeken${reqCount ? ` <span class="fr-badge fr-badge-alert">${reqCount}</span>` : ''}
      </button>
      <button class="fr-tab ${_friendsTab === 'search'   ? 'on' : ''}" onclick="switchFriendsTab('search')">Zoeken</button>
    </div>
    <div id="frContent"></div>
    <div class="fr-lb-link">
      <button class="fr-lb-link-btn" onclick="closeFriendsModal();openLeaderboard()">🏆 Ranglijst bekijken</button>
    </div>`;

  const content = document.getElementById('frContent');
  if (_friendsTab === 'list')          renderFriendsList(content, friendsWithStatus);
  else if (_friendsTab === 'requests') renderRequests(content, requests);
  else                                 renderSearch(content);
}

// ── Status helpers ─────────────────────────────────────
function _statusDot(status) {
  return `<span class="status-dot ${status || 'offline'}"></span>`;
}

function _statusTxt(status) {
  const labels = { studying: 'Aan het leren', break: 'Op pauze', offline: 'Offline' };
  return `<span class="fr-status-txt ${status || 'offline'}">${labels[status] || 'Offline'}</span>`;
}

// ── Vriendenlijst ──────────────────────────────────────
function renderFriendsList(container, friends) {
  if (!friends.length) {
    container.innerHTML = `
      <div class="fr-empty">
        <div class="fr-empty-icon">👥</div>
        <div class="fr-empty-txt">Nog geen vrienden.</div>
        <div class="fr-empty-sub">Zoek iemand op gebruikersnaam.</div>
        <button class="btn-ghost" style="margin-top:1rem" onclick="switchFriendsTab('search')">Zoeken</button>
      </div>`;
    return;
  }
  container.innerHTML = `<div class="fr-list">
    ${friends.map(f => `
      <div class="fr-card">
        <div class="fr-avatar-wrap">
          <div class="fr-card-avatar">${f.username[0].toUpperCase()}</div>
          ${_statusDot(f.status)}
        </div>
        <div class="fr-card-info">
          <div class="fr-card-name">${escHtml(f.username)}</div>
          <div class="fr-card-status-row">${_statusTxt(f.status)}</div>
        </div>
        <button class="fr-remove-btn" onclick="handleRemoveFriend('${f.id}','${escHtml(f.username)}')" title="Verwijderen">✕</button>
      </div>`).join('')}
  </div>`;
}

// ── Verzoeken ──────────────────────────────────────────
function renderRequests(container, requests) {
  if (!requests.length) {
    container.innerHTML = `
      <div class="fr-empty">
        <div class="fr-empty-icon">📭</div>
        <div class="fr-empty-txt">Geen openstaande verzoeken.</div>
      </div>`;
    return;
  }
  container.innerHTML = `<div class="fr-list">
    ${requests.map(r => `
      <div class="fr-card">
        <div class="fr-avatar-wrap">
          <div class="fr-card-avatar">${r.username[0].toUpperCase()}</div>
        </div>
        <div class="fr-card-info">
          <div class="fr-card-name">${escHtml(r.username)}</div>
          <div class="fr-card-status-row"><span class="fr-status-txt offline">Wil bevriend zijn</span></div>
        </div>
        <div class="fr-req-btns">
          <button class="fr-accept-btn" onclick="handleAccept('${r.id}')">✓</button>
          <button class="fr-decline-btn" onclick="handleDecline('${r.id}')">✕</button>
        </div>
      </div>`).join('')}
  </div>`;
}

// ── Zoeken ─────────────────────────────────────────────
function renderSearch(container) {
  container.innerHTML = `
    <div class="fr-search-wrap">
      <input type="text" id="frSearchInput" class="txt-input" placeholder="Gebruikersnaam zoeken…"
        value="${escHtml(_searchQuery)}" oninput="handleFrSearch(this.value)" autocomplete="off" />
    </div>
    <div id="frSearchResults"></div>`;
  setTimeout(() => document.getElementById('frSearchInput')?.focus(), 50);
  if (_searchQuery) renderSearchResults(document.getElementById('frSearchResults'), _searchResults);
}

function renderSearchResults(container, results) {
  if (!container) return;
  if (!results.length && _searchQuery.length >= 2) {
    container.innerHTML = `<div class="fr-empty"><div class="fr-empty-txt">Geen gebruikers gevonden.</div></div>`;
    return;
  }
  if (!results.length) { container.innerHTML = ''; return; }
  container.innerHTML = `<div class="fr-list" style="margin-top:1rem">
    ${results.map(u => `
      <div class="fr-card">
        <div class="fr-avatar-wrap">
          <div class="fr-card-avatar">${u.username[0].toUpperCase()}</div>
        </div>
        <div class="fr-card-info">
          <div class="fr-card-name">${escHtml(u.username)}</div>
        </div>
        <button class="fr-add-btn" onclick="handleSendRequest('${u.id}','${escHtml(u.username)}',this)">+ Voeg toe</button>
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
    if (btn) { btn.textContent = '✓ Verzonden'; btn.classList.add('fr-sent'); }
    toast(`Vriendschapsverzoek verzonden aan ${username}!`);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '+ Voeg toe'; }
    toast(e.message);
  }
}

async function handleAccept(friendshipId) {
  try {
    await acceptRequest(friendshipId);
    toast('Vriendschapsverzoek geaccepteerd!');
    renderFriendsModal();
    window.reloadFriendStatuses?.(); // refresh homepage widget
  } catch (e) { toast('Fout: ' + e.message); }
}

async function handleDecline(friendshipId) {
  try {
    await declineRequest(friendshipId);
    renderFriendsModal();
  } catch (e) { toast('Fout: ' + e.message); }
}

async function handleRemoveFriend(friendshipId, username) {
  if (!confirm(`${username} verwijderen als vriend?`)) return;
  try {
    await removeFriend(friendshipId);
    toast(`${username} verwijderd.`);
    renderFriendsModal();
    window.reloadFriendStatuses?.(); // refresh homepage widget
  } catch (e) { toast('Fout: ' + e.message); }
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

supabase.auth.onAuthStateChange(async (event, session) => {
  await updateFriendsUI(session?.user?.id ?? null);
});

(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  await updateFriendsUI(session?.user?.id ?? null);
})();

// ── Expose aan window ───────────────────────────────────
window.openFriendsModal   = openFriendsModal;
window.closeFriendsModal  = closeFriendsModal;
window.switchFriendsTab   = switchFriendsTab;
window.renderFriendsModal = renderFriendsModal;
window.handleFrSearch     = handleFrSearch;
window.handleSendRequest  = handleSendRequest;
window.handleAccept       = handleAccept;
window.handleDecline      = handleDecline;
window.handleRemoveFriend = handleRemoveFriend;
