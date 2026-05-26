/* ══════════════════════════════════════════════════════
   FocusBlock — progress.js
   Progress page rendering: lifetime stats, week chart,
   subject breakdown, village, companion.
   ══════════════════════════════════════════════════════ */

function backFromProgress(){
  // Always go back to timer if there's an active session, else start screen
  if(blocks.length){ showScreen('app'); renderApp(); }
  else goHome();
}

/* ══════════════════════════════════════════════════════
   STATISTIEKEN & VRIENDEN
   ══════════════════════════════════════════════════════ */
let _statsRange = 'week'; // 'today' | 'week'
function statsSetRange(r){ _statsRange = r; renderProgress(); }

function _stWeekStart(){
  const d = new Date(); const ws = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
  return ws.getFullYear() + '-' + String(ws.getMonth()+1).padStart(2,'0') + '-' + String(ws.getDate()).padStart(2,'0');
}
function _stFmtH(mins){ mins = Math.round(mins || 0); if(!mins) return '0m'; const h = Math.floor(mins/60), m = mins%60, hu = T('hours_short'); return h ? (m ? `${h}${hu} ${m}m` : `${h}${hu}`) : `${m}m`; }
function _stTodayMins(){ const t = todayStr(); const h = history.find(x => x.date === t); const live = blocks.length ? (completedMins + currentSessionMins) : 0; return Math.max(h ? h.mins : 0, live); }
function _stWeekMins(){ const ws = _stWeekStart(), t = todayStr(); let m = 0; history.forEach(h => { if(h.date >= ws && h.date !== t) m += h.mins || 0; }); return m + _stTodayMins(); }

function _stSubjects(range){
  const ws = _stWeekStart(), t = todayStr();
  const mins = {}, sess = {};
  const add = (n, m, c) => { if(!n || n === '__pause__') return; mins[n] = (mins[n]||0) + m; sess[n] = (sess[n]||0) + (c||0); };
  const estCount = (n, m, cnt) => (cnt && cnt[n] != null) ? cnt[n] : Math.max(1, Math.round(m / (S.focus || 50)));
  history.forEach(h => {
    if(h.date === t) return;
    if(range === 'today') return;
    if(h.date < ws) return;
    const subs = h.subjects || {}, cnt = h.subjectsCount || {};
    for(const n in subs) add(n, subs[n], estCount(n, subs[n], cnt));
  });
  // today (live blocks if active, else finalized history)
  if(blocks.length){
    blocks.filter(b => b.done && !b.isPause).forEach(b => add(b.subject || T('phase_focus'), b.mins, 1));
  } else {
    const h = history.find(x => x.date === t);
    if(h){ const subs = h.subjects || {}, cnt = h.subjectsCount || {}; for(const n in subs) add(n, subs[n], estCount(n, subs[n], cnt)); }
  }
  return Object.keys(mins).map(n => ({ name:n, mins:mins[n], sessions:sess[n] })).sort((a,b) => b.mins - a.mins);
}

function _stStatusMeta(s){
  if(s === 'studying') return { cls:'st-studying', label:T('status_studying') };
  if(s === 'break')    return { cls:'st-break',    label:T('status_break') };
  if(s === 'online')   return { cls:'st-online',   label:T('status_online') };
  return { cls:'st-offline', label:T('status_offline') };
}

function renderProgress(){
  const bb = document.getElementById('progBackBtn'); if(bb) bb.innerHTML = '← ' + esc(T('prog_back'));
  const host = document.getElementById('progBody');

  const today = _stTodayMins(), week = _stWeekMins();
  const goalH = S.weeklyGoal || 15;
  const weekPct = Math.min(100, Math.round(week / (goalH * 60) * 100));
  const rangeLbl = (_statsRange === 'today' ? T('nav_today') : T('prog_week')).toLowerCase();

  const subs = _stSubjects(_statsRange);
  const maxS = Math.max(...subs.map(s => s.mins), 1);

  host.innerHTML = `
    <div class="stats-head">
      <h1 class="stats-title">${esc(T('nav_stats'))}</h1>
      <div class="stats-toggle">
        <button class="${_statsRange === 'today' ? 'on' : ''}" onclick="statsSetRange('today')">${esc(T('nav_today'))}</button>
        <button class="${_statsRange === 'week' ? 'on' : ''}" onclick="statsSetRange('week')">${esc(T('prog_week'))}</button>
      </div>
    </div>

    <div class="stats-cards">
      <div class="stats-card"><div class="sc-top"><span class="sc-lbl">${esc(T('nav_today'))}</span><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div><div class="sc-big">${_stFmtH(today)}</div><div class="sc-sub">${esc(T('stats_total_focus'))}</div></div>
      <div class="stats-card"><div class="sc-top"><span class="sc-lbl">${esc(T('prog_week'))}</span><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="7"/><line x1="18" y1="20" x2="18" y2="10"/></svg></div><div class="sc-big">${_stFmtH(week)}</div><div class="sc-sub">${esc(T('stats_total_focus'))}</div></div>
      <div class="stats-card"><div class="sc-top"><span class="sc-lbl">${esc(T('stats_weekgoal'))}</span><svg viewBox="0 0 36 36" class="sc-ring"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--bg4)" stroke-width="4"/><circle cx="18" cy="18" r="15" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${2*Math.PI*15}" stroke-dashoffset="${2*Math.PI*15*(1-weekPct/100)}" transform="rotate(-90 18 18)"/></svg></div><div class="sc-big">${weekPct}%</div><div class="sc-sub">${esc(Tf('stats_goal_of',{h:goalH}))}</div></div>
      <div class="stats-card"><div class="sc-top"><span class="sc-lbl">${esc(T('stats_together_week'))}</span><span class="sc-emoji">👥</span></div><div class="sc-big" id="statsTogether">—</div><div class="sc-sub">${esc(T('stats_total_focus'))}</div></div>
    </div>

    <div class="stats-two">
      <div class="stats-panel">
        <div class="sp-head"><span>${esc(T('stats_top_friends'))} ${esc(rangeLbl)}</span><button class="sp-link" onclick="openLeaderboard()">${esc(T('stats_view_all'))}</button></div>
        <div id="statsLbList" class="stats-lb"><div class="stats-loading">…</div></div>
      </div>
      <div class="stats-panel">
        <div class="sp-head"><span>${esc(T('stats_friends_active'))}</span><button class="sp-link" onclick="openFriendsModal()">${esc(T('stats_view_friends'))}</button></div>
        <div id="statsActiveList" class="stats-active"><div class="stats-loading">…</div></div>
      </div>
    </div>

    <div class="stats-panel">
      <div class="sp-head"><span>${esc(T('stats_per_subject'))} ${esc(rangeLbl)}</span></div>
      <div class="ssub-headrow"><span>${esc(T('stats_subject'))}</span><span></span><span class="ssub-c">${esc(T('stats_sessions'))}</span><span class="ssub-t">${esc(T('stats_total_time'))}</span></div>
      ${subs.length ? subs.map(s => { const w = Math.round(s.mins/maxS*100); const col = colorFor(s.name); return `<div class="ssub-row"><span class="ssub-name"><span class="ssub-dot" style="background:${col}"></span>${esc(s.name)}</span><span class="ssub-bar"><span class="ssub-fill" data-w="${w}" style="width:0%;background:${col}"></span></span><span class="ssub-c">${s.sessions}</span><span class="ssub-t">${_stFmtH(s.mins)}</span></div>`; }).join('') : `<div class="stats-empty">${esc(T('no_subj_data'))}</div>`}
      <div class="ssub-foot">${esc(T('stats_rounded'))}</div>
    </div>

    ${renderVillage()}
    ${renderCompanionProg()}`;

  setTimeout(() => { document.querySelectorAll('.ssub-fill').forEach(b => { b.style.width = b.dataset.w + '%'; }); }, 80);
  _fillStatsFriends();
}

async function _fillStatsFriends(){
  const lbHost = document.getElementById('statsLbList');
  const activeHost = document.getElementById('statsActiveList');
  const togetherEl = document.getElementById('statsTogether');
  const av = (n,u,s) => (typeof window.fbAvatarHTML === 'function') ? window.fbAvatarHTML(n,u,s) : `<span class="fb-av fb-av-init" style="width:${s}px;height:${s}px">${esc((n||'?')[0].toUpperCase())}</span>`;
  const loggedIn = (typeof window.fbUserId === 'function') && window.fbUserId();

  if(!loggedIn){
    const cta = `<div class="stats-empty"><button class="sp-login" onclick="openAuthModal()">${esc(T('stats_login'))}</button></div>`;
    if(lbHost) lbHost.innerHTML = cta;
    if(activeHost) activeHost.innerHTML = `<div class="stats-empty">${esc(T('home_social_login_d'))}</div>`;
    if(togetherEl) togetherEl.textContent = _stFmtH(_statsRange === 'today' ? _stTodayMins() : _stWeekMins());
    return;
  }

  // Leaderboard (top friends)
  try {
    const data = (typeof window.fbLoadLeaderboard === 'function') ? await window.fbLoadLeaderboard() : null;
    if(data && lbHost){
      const field = _statsRange === 'today' ? data.todayMins : data.weekMins;
      const entries = data.allIds.map(id => ({
        id, username: id === data.userId ? T('stats_you') : (data.pm[id]?.username || '?'),
        avatar: data.pm[id]?.avatar_url || '', mins: field[id] || 0, isMe: id === data.userId
      })).sort((a,b) => b.mins - a.mins || a.username.localeCompare(b.username));
      const together = Object.values(data.weekMins).reduce((s,m) => s + m, 0);
      if(togetherEl) togetherEl.textContent = _stFmtH(together);
      const medals = ['🥇','🥈','🥉'];
      lbHost.innerHTML = entries.slice(0,6).map((e,i) =>
        `<div class="stats-lb-row ${e.isMe ? 'me' : ''}"><span class="slb-rank">${medals[i] ?? (i+1)}</span>${av(e.username, e.avatar, 32)}<span class="slb-name">${esc(e.username)}</span><span class="slb-time">${e.mins ? _stFmtH(e.mins) : '—'}</span></div>`
      ).join('');
    }
  } catch(e){ if(lbHost) lbHost.innerHTML = `<div class="stats-empty">—</div>`; }

  // Active friends — show only those who are actively studying / on break / online
  if(activeHost){
    const all = (typeof window.getFriendList === 'function') ? (window.getFriendList() || []) : [];
    const active = all.filter(f => f.status && f.status !== 'offline');
    if(!all.length){
      activeHost.innerHTML = `<div class="stats-empty">${esc(T('home_social_add_d'))}</div>`;
    } else if(!active.length){
      activeHost.innerHTML = `<div class="stats-empty">${esc(T('home_social_none'))}</div>`;
    } else {
      const order = { studying:0, break:1, online:2 };
      const sorted = [...active].sort((a,b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
      activeHost.innerHTML = sorted.slice(0,6).map(f => { const m = _stStatusMeta(f.status); return `<button class="stats-active-row" data-fid="${esc(f.id)}" data-fname="${esc(f.username)}" data-favatar="${esc(f.avatar_url||'')}">${av(f.username, f.avatar_url, 34)}<span class="sar-name">${esc(f.username)}</span><span class="sar-status ${m.cls}"><span class="sar-dot"></span>${esc(m.label)}</span></button>`).join('');
      activeHost.querySelectorAll('.stats-active-row').forEach(btn => {
        btn.onclick = () => openFriendStats(btn.dataset.fid, btn.dataset.fname, btn.dataset.favatar);
      });
    }
  }
}

function renderVillage(){
  const idx = villageStageIdx(houseProgress);
  const next = VILLAGE_STAGES[idx+1];
  let cap;
  if(next){ const rem = next.at - houseProgress; cap = Tf('village_next', {n:rem, s:rem===1?'':'s', name:T(next.k)}); }
  else cap = T('village_max');
  return `<div class="prog-section"><div class="prog-sec-t">${esc(T('prog_village'))}</div><div class="village-card"><div class="village-scene">${villageSVG(houseProgress)}</div><div style="margin-top:1rem;font-size:13.5px;color:var(--mid);text-align:center;line-height:1.6;">${cap}</div></div></div>`;
}

function renderCompanionProg(){
  if(S.companion === 'none' || S.companionVis === 'off') return '';
  const acc = getCSS('--accent');
  const lvl = Math.min(4, Math.floor(houseProgress / 10));
  const meta = compMeta().find(c => c.id === S.companion);
  const name = S.companionName || T(meta ? meta.k : 'comp_unnamed');
  return `<div class="prog-section"><div class="prog-sec-t">${esc(T('prog_companion'))}</div><div class="companion-prog"><div class="cp-vis">${companionSVG(S.companion, 'done', acc, lvl)}</div><div class="cp-info"><div class="cp-name">${esc(name)}</div><div class="cp-stat">${esc(Tf('comp_lvl',{n:lvl+1}))} · ${esc(Tf('comp_grown',{n:lifetimeBlocks}))}</div></div></div></div>`;
}
