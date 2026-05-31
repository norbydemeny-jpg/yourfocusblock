// ══════════════════════════════════════════════════════
// status.js — Live status (studying / break / offline)
// Beheert eigen status + realtime vriend-statussen + homepage widget
// ══════════════════════════════════════════════════════

import { supabase } from './supabaseClient.js';

let _myId        = null;
let _channel     = null;
let _friendIds   = [];
let _profiles    = {};   // id → username
let _statusMap   = {};   // id → status
let _myLastStatus = null; // laatst expliciet gezette eigen status (voor heartbeat)

// Een 'studying'/'break'/'online'-status is alleen geldig als hij recent
// vernieuwd is. Een actieve gebruiker klopt elke ~60s aan (heartbeat hieronder),
// dus alles ouder dan deze drempel = de tab is dicht/gecrasht → toon offline.
// Zo verdwijnen 'spook'-sessies (browser geforceerd afgesloten zonder pagehide).
const STALE_MS = 150 * 1000; // 2,5 min (2 gemiste heartbeats speling)
function _effectiveStatus(status, updatedAt) {
  if (!status || status === 'offline') return 'offline';
  if (!updatedAt) return status; // geen tijdstempel bekend → niet wegfilteren
  const age = Date.now() - new Date(updatedAt).getTime();
  return (age > STALE_MS) ? 'offline' : status;
}

// ── Auth helper ────────────────────────────────────────
function getCurrentUserId() {
  if (typeof window.fbUserId === 'function') {
    return window.fbUserId();
  }
  return null;
}

// Bound een hangende write af zodat de fire-and-forget heartbeat geen oneindig
// groeiende stapel pending upserts opbouwt bij een trage/dode verbinding.
function _raceTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ]);
}

// ── Eigen status upserten ──────────────────────────────
async function updateMyStatus(status) {
  if (!_myId) return;
  _myLastStatus = status; // onthouden zodat de heartbeat exact dit kan herbevestigen
  try {
    await _raceTimeout(supabase.from('user_status').upsert(
      { user_id: _myId, status, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    ), 5000);
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
    supabase.from('user_status').select('user_id, status, updated_at').in('user_id', _friendIds)
  ]);

  _profiles = {};
  (profRes.data || []).forEach(p => { _profiles[p.id] = { username: p.username, avatar_url: p.avatar_url || '' }; });

  _statusMap = {};
  (statRes.data || []).forEach(r => { _statusMap[r.user_id] = _effectiveStatus(r.status, r.updated_at); });

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

// ── Mijn huidige status afleiden uit de timer-toestand ─
//   timer.js zet 'running' + 'ph-focus/ph-short/ph-long' op <body>; status.js
//   is een module en kan curPhase/running niet direct lezen, dus gebruiken we
//   die body-classes als brug. Zo zetten we na terugkeer naar het tabblad de
//   juiste status terug (i.p.v. 'offline' te blijven).
function _myActiveStatus() {
  const b = document.body;
  if (b.classList.contains('running')) {
    return b.classList.contains('ph-focus') ? 'studying' : 'break';
  }
  return 'online';
}

// ── Lichtgewicht status-poll: alleen user_status opnieuw ophalen voor de
//    bekende vriend-IDs. Backup voor als de realtime-subscription stilvalt.
async function _refreshStatuses() {
  if (!_myId || _friendIds.length === 0) return;
  try {
    const { data } = await supabase
      .from('user_status')
      .select('user_id, status, updated_at')
      .in('user_id', _friendIds);
    if (!data) return;
    const next = {};
    data.forEach(r => { next[r.user_id] = _effectiveStatus(r.status, r.updated_at); });
    // Alleen hertekenen als er echt iets veranderde (voorkomt animatie-hikjes).
    const changed = _friendIds.some(id => (next[id] || 'offline') !== (_statusMap[id] || 'offline'));
    _statusMap = next;
    if (changed) {
      renderWidget(_buildFriendList());
      if (document.getElementById('friendsOv')?.classList.contains('open')) {
        window.renderFriendsModal?.();
      }
    }
  } catch { /* stil falen — volgende poll probeert opnieuw */ }
}

// ── Actieve-vrienden widget — homepage + app ───────────
//   Geen hardcoded NL strings meer: alle labels via Tf()/T() zodat ze in
//   alle 5 talen kloppen (EN/NL/FR/ES/RO).
function renderWidget(friends) {
  // Studying / break = "active right now"; online = "available"
  const studying = friends.filter(f => f.status === 'studying');
  const onBreak  = friends.filter(f => f.status === 'break');
  const online   = friends.filter(f => f.status === 'online');
  const active   = [...studying, ...onBreak, ...online];

  const tfSafe = (key, vars, fallback) => {
    if (typeof Tf === 'function') {
      const out = Tf(key, vars || {});
      if (out && out !== key) return out;
    }
    return fallback;
  };
  const tSafe = (key, fallback) => (typeof T === 'function' ? (T(key) || fallback) : fallback);

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
      let label;
      if (studying.length === 1) {
        label = tfSafe('afw_focus_one_home', { name: _esc(studying[0].username) }, `${_esc(studying[0].username)} is focusing`);
      } else if (studying.length > 1) {
        label = tfSafe('afw_focus_many_home', { n: studying.length }, `${studying.length} friends focusing`);
      } else {
        label = onBreak.length === 1
          ? tSafe('afw_break_home_one', '1 friend on a break')
          : tfSafe('afw_break_home_many', { n: onBreak.length }, `${onBreak.length} friends on a break`);
      }
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
          <div class="afw-prominent-empty">
            <span>${tSafe('afw_be_first', '💪 You\'re leading the way')}</span>
          </div>`;
      } else {
        appWidget.innerHTML = '';
      }
    } else {
      let label;
      if (studying.length > 0) {
        label = studying.length === 1
          ? tfSafe('afw_studying_too_one', { name: _esc(studying[0].username) }, `${_esc(studying[0].username)} is focusing too`)
          : tfSafe('afw_studying_too_many', { n: studying.length }, `${studying.length} friends focusing`);
      } else if (onBreak.length > 0) {
        label = onBreak.length === 1
          ? tSafe('afw_break_one', '1 friend on a break')
          : tfSafe('afw_break_many', { n: onBreak.length }, `${onBreak.length} friends on a break`);
      } else {
        label = online.length === 1
          ? tSafe('afw_online_one', '1 friend online')
          : tfSafe('afw_online_many', { n: online.length }, `${online.length} friends online`);
      }
      appWidget.innerHTML = `
        <div class="afw-prominent-bar${studying.length ? ' afw-live' : ''}">
          <span class="afw-dot${studying.length ? '' : ' afw-dot-quiet'}"></span>
          <span class="afw-prominent-label">${label}</span>
          <div class="afw-prominent-avatars">
            ${active.slice(0, 4).map(f => avBtn(f, 44)).join('')}
            ${active.length > 4 ? `<div class="afw-avatar afw-more afw-prominent-more">+${active.length - 4}</div>` : ''}
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
// fbUserId removed to avoid conflict with auth.js
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
    await _raceTimeout(supabase.from('user_status').upsert(
      { user_id: _myId, status: 'offline', updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    ), 4000);
  } catch {}
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    _goOffline();
  } else if (_myId) {
    // Terug in beeld: we stonden op 'offline'. Zet de juiste status terug en
    // her-synchroniseer vrienden + realtime. Dit verhelpt het 'ik moest
    // refreshen'-probleem — terugkeren naar het tabblad re-synct alles.
    updateMyStatus(_myActiveStatus());
    loadFriendsAndSubscribe().catch(() => {});
  }
});
window.addEventListener('pagehide', () => _goOffline());
// Sommige mobiele browsers vuren geen visibilitychange bij app-resume → ook
// op window-focus opnieuw synchroniseren.
window.addEventListener('focus', () => {
  if (_myId && !document.hidden) {
    updateMyStatus(_myActiveStatus());
    _refreshStatuses();
  }
});

// ── Auth state listener helper ──────────────────────────
async function handleStatusAuthStateChange(event, session) {
  _myId = session?.user?.id ?? null;

  if (event === 'SIGNED_IN' && _myId) {
    await updateMyStatus('online'); // begin als online
    await loadFriendsAndSubscribe();
  } else if (event === 'TOKEN_REFRESHED' && _myId) {
    // Toegangstoken is ververst — herstart de realtime-subscription en
    // herlaad friends/profile data zodat queries niet stilletjes leeg
    // teruggeven met een verlopen token.
    await loadFriendsAndSubscribe();
  } else if (event === 'SIGNED_OUT') {
    _myId = null;
    _friendIds = [];
    _profiles  = {};
    _statusMap = {};
    if (_channel) { supabase.removeChannel(_channel); _channel = null; }
    renderWidget([]);
    document.querySelectorAll('.leaderboard-area').forEach(el => { el.innerHTML = ''; });
  }

  _updateLbAreas(_myId);
}

// ── Heartbeat (elke 60s): zolang de tab zichtbaar is, mijn eigen status
//    opnieuw bevestigen zodat updated_at vers blijft. Vrienden zien me daardoor
//    betrouwbaar als 'studying'/'break'/'online'; sluit/crasht mijn tab, dan
//    stopt de heartbeat en val ik na STALE_MS vanzelf op 'offline' — ook als
//    pagehide/visibilitychange nooit vuurde (geforceerd afsluiten, mobiel).
setInterval(() => {
  if (!_myId || document.hidden) return;
  // Herbevestig de exact laatst gezette status (zodat 'break' tijdens een pauze
  // niet stilletjes naar 'online' degradeert). Nog niets gezet of net offline
  // geweest → leid af uit de timer-toestand.
  const s = (_myLastStatus && _myLastStatus !== 'offline') ? _myLastStatus : _myActiveStatus();
  updateMyStatus(s);
}, 60 * 1000);

// ── Lichtgewicht status-poll (elke 40s): houdt vriend-statussen vers als de
//    realtime-subscription stil zou vallen, zonder zware profiel-queries.
setInterval(() => {
  if (_myId && !document.hidden) _refreshStatuses();
}, 40 * 1000);

// ── Zwaardere volledige refresh (elke 3 min): vrienden + profielen opnieuw
//    laden en realtime opnieuw subscriben — safety-net voor RLS/token edge cases.
setInterval(() => {
  if (_myId && !document.hidden) loadFriendsAndSubscribe().catch(() => {});
}, 3 * 60 * 1000);

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
  await window.fbAuthReady;
  _myId = getCurrentUserId();
  if (_myId) {
    await updateMyStatus('online');
    await loadFriendsAndSubscribe();
  }
  _updateLbAreas(_myId);
  // Register the auth listener after page load initialization to avoid race conditions
  supabase.auth.onAuthStateChange(handleStatusAuthStateChange);
})();

// ── Expose aan window ──────────────────────────────────
window.updateMyStatus         = updateMyStatus;
window.getStatusCache         = getStatusCache;
window.getActiveFriends       = getActiveFriends;
window.getFriendList          = getFriendList;
window.reloadFriendStatuses   = loadFriendsAndSubscribe;
