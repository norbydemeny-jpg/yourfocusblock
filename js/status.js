// ══════════════════════════════════════════════════════
// status.js — Live status (studying / break / offline)
// Beheert eigen status + realtime vriend-statussen + homepage widget
// ══════════════════════════════════════════════════════

import { supabase } from './supabaseClient.js';

let _myId      = null;
let _channel   = null;
let _friendIds = [];
let _profiles  = {};   // id → username
let _statusMap = {};   // id → status

// ── Auth helper ────────────────────────────────────────
async function getCurrentUserId() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch { return null; }
}

// ── Eigen status upserten ──────────────────────────────
async function updateMyStatus(status) {
  if (!_myId) return;
  try {
    await supabase.from('user_status').upsert(
      { user_id: _myId, status, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  } catch (e) { console.warn('[Status] upsert failed:', e.message); }
}

// ── Vrienden laden + statussen ophalen + subscriben ───
async function loadFriendsAndSubscribe() {
  if (!_myId) return;

  // 1) Vriend-IDs ophalen
  const { data: fships } = await supabase
    .from('friendships')
    .select('requester_id, receiver_id')
    .or(`requester_id.eq.${_myId},receiver_id.eq.${_myId}`)
    .eq('status', 'accepted');

  _friendIds = (fships || []).map(f =>
    f.requester_id === _myId ? f.receiver_id : f.requester_id
  );

  if (_friendIds.length === 0) {
    renderWidget([]);
    return;
  }

  // 2) Profielen + statussen parallel ophalen
  const [profRes, statRes] = await Promise.all([
    supabase.from('profiles').select('id, username').in('id', _friendIds),
    supabase.from('user_status').select('user_id, status').in('user_id', _friendIds)
  ]);

  _profiles = {};
  (profRes.data || []).forEach(p => { _profiles[p.id] = p.username; });

  _statusMap = {};
  (statRes.data || []).forEach(r => { _statusMap[r.user_id] = r.status; });

  renderWidget(_buildFriendList());

  // 3) Realtime subscription
  if (_channel) supabase.removeChannel(_channel);
  _channel = supabase
    .channel('friend-statuses')
    .on('postgres_changes', {
      event:  '*',
      schema: 'public',
      table:  'user_status',
    }, (payload) => {
      const uid       = payload.new?.user_id || payload.old?.user_id;
      const newStatus = payload.new?.status || 'offline';
      if (uid && _friendIds.includes(uid)) {
        _statusMap[uid] = newStatus;
        renderWidget(_buildFriendList());
        // Refresh vrienden-modal als open
        if (document.getElementById('friendsOv')?.classList.contains('open')) {
          window.renderFriendsModal?.();
        }
      }
    })
    .subscribe();
}

function _buildFriendList() {
  return _friendIds.map(id => ({
    id,
    username: _profiles[id] || '?',
    status:   _statusMap[id] || 'offline'
  }));
}

// ── Homepage actieve-vrienden widget ──────────────────
function renderWidget(friends) {
  const widget = document.getElementById('activeFriendsWidget');
  if (!widget) return;

  const active = friends.filter(f => f.status === 'studying');
  if (active.length === 0) {
    widget.style.display = 'none';
    widget.innerHTML = '';
    return;
  }

  const names = active.map(f => f.username);
  const label = active.length === 1
    ? `<strong>${_esc(names[0])}</strong> is aan het leren`
    : `<strong>${active.length} vrienden</strong> leren nu`;

  widget.style.display = 'block';
  widget.innerHTML = `
    <div class="afw-inner">
      <span class="afw-dot"></span>
      <div class="afw-text">${label}</div>
      <div class="afw-avatars">
        ${active.slice(0, 5).map(f => `
          <div class="afw-avatar" title="${_esc(f.username)}">${f.username[0].toUpperCase()}</div>
        `).join('')}
        ${active.length > 5 ? `<div class="afw-avatar afw-more">+${active.length - 5}</div>` : ''}
      </div>
    </div>`;
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Expose status cache voor friends.js ───────────────
function getStatusCache() { return _statusMap; }

// ── Offline bij pagina sluiten / verbergen ────────────
async function _goOffline() {
  if (!_myId) return;
  try {
    await supabase.from('user_status').upsert(
      { user_id: _myId, status: 'offline', updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  } catch {}
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) _goOffline();
});
window.addEventListener('pagehide', () => _goOffline());

// ── Auth state ─────────────────────────────────────────
supabase.auth.onAuthStateChange(async (event, session) => {
  _myId = session?.user?.id ?? null;

  if (event === 'SIGNED_IN' && _myId) {
    await updateMyStatus('offline'); // begin als offline totdat timer start
    await loadFriendsAndSubscribe();
  } else if (event === 'SIGNED_OUT') {
    _myId = null;
    _friendIds = [];
    _profiles  = {};
    _statusMap = {};
    if (_channel) { supabase.removeChannel(_channel); _channel = null; }
    renderWidget([]);
    // Leaderboard knop verbergen
    document.querySelectorAll('.leaderboard-area').forEach(el => { el.innerHTML = ''; });
  }

  // Leaderboard knop tonen/verbergen
  _updateLbAreas(_myId);
});

function _updateLbAreas(userId) {
  document.querySelectorAll('.leaderboard-area').forEach(area => {
    if (userId) {
      area.innerHTML = `
        <button class="lb-icon-btn" onclick="openLeaderboard()" title="Ranglijst">🏆</button>`;
    } else {
      area.innerHTML = '';
    }
  });
}

// ── Init ──────────────────────────────────────────────
(async () => {
  _myId = await getCurrentUserId();
  if (_myId) {
    await updateMyStatus('offline');
    await loadFriendsAndSubscribe();
  }
  _updateLbAreas(_myId);
})();

// ── Expose aan window ──────────────────────────────────
window.updateMyStatus         = updateMyStatus;
window.getStatusCache         = getStatusCache;
window.reloadFriendStatuses   = loadFriendsAndSubscribe;
