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
    supabase.from('profiles').select('id, username, avatar_url').in('id', _friendIds),
    supabase.from('user_status').select('user_id, status').in('user_id', _friendIds)
  ]);

  _profiles = {};
  (profRes.data || []).forEach(p => { _profiles[p.id] = { username: p.username, avatar_url: p.avatar_url || '' }; });

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
    username:   _profiles[id]?.username || '?',
    avatar_url: _profiles[id]?.avatar_url || '',
    status:     _statusMap[id] || 'offline'
  }));
}
function _av(f, size){ return (typeof window.fbAvatarHTML === 'function') ? window.fbAvatarHTML(f.username, f.avatar_url, size||28) : `<div class="afw-avatar">${(f.username||'?')[0].toUpperCase()}</div>`; }

// ── Actieve-vrienden widget — homepage + app ───────────
function renderWidget(friends) {
  // Studying / break = "active right now"; online = "available"
  const studying = friends.filter(f => f.status === 'studying');
  const onBreak  = friends.filter(f => f.status === 'break');
  const online   = friends.filter(f => f.status === 'online');
  const active   = [...studying, ...onBreak, ...online];

  const avBtn = (f, size) => {
    const sz = size || 30;
    const cls = `afw-pill afw-${f.status || 'offline'}`;
    return `<button class="${cls}" data-fid="${f.id}" data-fname="${_esc(f.username)}" data-favatar="${_esc(f.avatar_url||'')}" title="${_esc(f.username)} — ${f.status}"><span class="afw-av-wrap">${_av(f, sz)}<span class="afw-status-dot afw-${f.status||'offline'}"></span></span></button>`;
  };

  // ── Homepage-versie (volledig) ──
  const widget = document.getElementById('activeFriendsWidget');
  if (widget) {
    if (studying.length === 0 && onBreak.length === 0) {
      widget.style.display = 'none';
      widget.innerHTML = '';
    } else {
      const label = studying.length === 1
        ? `<strong>${_esc(studying[0].username)}</strong> is aan het focussen`
        : studying.length > 1
        ? `<strong>${studying.length} vrienden</strong> zijn nu aan het focussen`
        : `<strong>${onBreak.length}</strong> ${onBreak.length === 1 ? 'vriend heeft' : 'vrienden hebben'} pauze`;
      widget.style.display = 'block';
      widget.innerHTML = `
        <div class="afw-inner">
          <span class="afw-dot"></span>
          <div class="afw-text">${label}</div>
          <div class="afw-avatars">
            ${active.slice(0, 5).map(f => avBtn(f, 30)).join('')}
            ${active.length > 5 ? `<div class="afw-avatar afw-more">+${active.length - 5}</div>` : ''}
          </div>
        </div>`;
      _wireAfwClicks(widget);
    }
  }

  // ── App-versie (compact, in rechterkolom op Vandaag) ──
  const appWidget = document.getElementById('activeFriendsApp');
  if (appWidget) {
    if (active.length === 0) {
      // Subtle motivational empty state — only render if user has friends
      if (friends.length > 0) {
        appWidget.innerHTML = `
          <div class="afw-app-bar afw-empty">
            <span class="afw-app-label">💪 Jij bent als eerste begonnen</span>
          </div>`;
      } else {
        appWidget.innerHTML = '';
      }
    } else {
      const label = studying.length > 0
        ? (studying.length === 1
            ? `${_esc(studying[0].username)} leert ook`
            : `${studying.length} vrienden leren`)
        : (onBreak.length > 0
            ? `${onBreak.length} ${onBreak.length === 1 ? 'vriend heeft pauze' : 'vrienden hebben pauze'}`
            : `${online.length} ${online.length === 1 ? 'vriend online' : 'vrienden online'}`);
      appWidget.innerHTML = `
        <div class="afw-app-bar">
          <span class="afw-dot${studying.length ? '' : ' afw-dot-quiet'}"></span>
          <span class="afw-app-label">${label}</span>
          <div class="afw-avatars">
            ${active.slice(0, 4).map(f => avBtn(f, 28)).join('')}
            ${active.length > 4 ? `<div class="afw-avatar afw-more">+${active.length - 4}</div>` : ''}
          </div>
        </div>`;
      _wireAfwClicks(appWidget);
    }
  }

  // Homepage + dashboard live social views
  refreshSocialViews();
}

function _wireAfwClicks(host) {
  host.querySelectorAll('.afw-pill').forEach(btn => {
    btn.onclick = () => {
      if (typeof window.openFriendStats === 'function') {
        window.openFriendStats(btn.dataset.fid, btn.dataset.fname, btn.dataset.favatar);
      }
    };
  });
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Expose status cache voor friends.js ───────────────
function getStatusCache() { return _statusMap; }

// ── Vriendenlijsten voor homepage / dashboard ─────────
function getActiveFriends() { return _buildFriendList().filter(f => f.status === 'studying'); }
function getFriendList()    { return _buildFriendList(); }
function fbUserId()         { return _myId; }
function refreshSocialViews() {
  if (typeof window.renderOverviewSocial === 'function' &&
      document.getElementById('overview')?.style.display !== 'none') {
    window.renderOverviewSocial();
  }
  if (typeof window.renderHomeSocial === 'function' &&
      document.getElementById('home')?.style.display !== 'none') {
    window.renderHomeSocial();
  }
}

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
window.getActiveFriends       = getActiveFriends;
window.getFriendList          = getFriendList;
window.fbUserId               = fbUserId;
window.reloadFriendStatuses   = loadFriendsAndSubscribe;
