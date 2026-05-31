/* ══════════════════════════════════════════════════════
   FocusBlock — app.js
   Main coordinator, screen router, home, focus app,
   blocks list, zen mode, and init.
   ══════════════════════════════════════════════════════ */

/* ---- init flag ---- */
let _restoredDay = false;

/* ====================== SCREEN ROUTER ====================== */
const SCREENS = ['home','overview','flow','planner','agenda','app','progress'];
const NAV_MAP = { app:'today', overview:'overview', agenda:'agenda', progress:'progress' };
let _prevScreen = 'app'; // last-shown screen — used so the planner can return to where you came from
function showScreen(id){
  // remember which non-planner/flow screen the user was on, so backFromPlanner can return
  const current = SCREENS.find(s => { const el = document.getElementById(s); return el && !el.classList.contains('out'); });
  if(current && current !== id && current !== 'planner' && current !== 'flow') _prevScreen = current;
  SCREENS.forEach(s => {
    const el = document.getElementById(s);
    if(!el) return;
    if(s === id){ el.style.display = 'flex'; requestAnimationFrame(() => el.classList.remove('out')); }
    else { el.classList.add('out'); el.style.display = 'none'; }
  });
  document.body.classList.toggle('nav-on', id !== 'flow');
  setActiveNav(NAV_MAP[id] || null);
  window.scrollTo(0, 0);
}
window.fbPrevScreen = () => _prevScreen;

function setActiveNav(navId){
  document.querySelectorAll('.nav-tab, .botnav-tab').forEach(t => {
    t.classList.toggle('on', !!navId && t.dataset.nav === navId);
  });
}

function goHome(){
  exitZen(); stopTimer();
  document.body.classList.remove('ph-focus','ph-short','ph-long');
  renderHome(); showScreen('home');
}
function goApp(){ applyPhaseClass(); showScreen('app'); renderApp(); }
/* Vandaag — always lands on a ready-to-focus timer */
function goToday(){
  if(!blocks.length){
    blocks.push({id:nid++, subject:'', mins:S.focus, note:'', tasks:[], done:false, status:null});
    curBlock = 0; curPhase = 'focus';
    timeLeft = S.focus * 60; totalTime = S.focus * 60;
    saveData();
  }
  goApp();
}
function goOverview(){ renderOverview(); showScreen('overview'); }
function goProgress(from){ progReturn = (from && from !== 'nav') ? from : 'home'; renderProgress(); showScreen('progress'); }

/* ====================== APPLY: THEME / LANG / BODY ====================== */
function applyBodyClass(){
  const b = document.body;
  THEMES.forEach(t => { if(t.cls) b.classList.remove(t.cls); });
  b.classList.remove('lt');
  const cls = themeCls(S.theme); if(cls) b.classList.add(cls);
  if(S.light) b.classList.add('lt');
  // ambient
  const atmos = document.getElementById('atmos');
  atmos.style.background = (S.ambient && S.ambient !== 'none') ? (AMBIENTS[S.ambient] || '') : '';
  atmos.style.opacity = (S.ambient && S.ambient !== 'none') ? '1' : '0';
  // bg photo
  const bp = document.getElementById('bgPhoto');
  if(S.bgPhoto){ bp.style.backgroundImage = 'url(' + S.bgPhoto + ')'; bp.classList.add('on'); b.classList.add('has-bg'); }
  else { bp.style.backgroundImage = ''; bp.classList.remove('on'); b.classList.remove('has-bg'); }
}

function applyAnimLevel(){
  document.body.classList.remove('anim-minimal','anim-expressive');
  if(S.animLevel === 'minimal') document.body.classList.add('anim-minimal');
  else if(S.animLevel === 'expressive') document.body.classList.add('anim-expressive');
}

/* ====================== LANGUAGE (live) ====================== */
function applyLang(){
  document.documentElement.lang = S.lang;
  renderNavLabels();
  // Refresh auth-area (login button / account chip tooltip) zodat het meteen
  // de nieuwe taal toont.
  if(typeof window.fbRefreshAuthUI === 'function') window.fbRefreshAuthUI();
  // Only re-render screens that are actually shown. Screens hide via the
  // `out` class (inline style.display stays ""), so check the class — not
  // style.display — to avoid rendering uninitialised screens during init.
  const shown = id => { const el = document.getElementById(id); return el && !el.classList.contains('out'); };
  if(shown('home')) renderHome();
  if(shown('overview')) renderOverview();
  if(shown('flow') && flowSteps.length) renderFlowStep();
  if(shown('planner')) renderPlanner();
  if(shown('agenda')) renderAgenda();
  if(shown('app') && blocks.length) renderApp();
  if(shown('progress')) renderProgress();
  if(document.getElementById('settingsOv').classList.contains('open')) renderSettings();
}

/* ====================== HOME ====================== */
function renderHome(){
  document.getElementById('homeTitle').innerHTML = userName ? Tf('home_title', {name:esc(userName)}) : T('home_title_new');
  document.getElementById('homeGreet').textContent = userName ? Tf('home_greet', {name:userName}) : T('home_greet_new');
  document.getElementById('homeSub').textContent = T('home_sub');
  document.getElementById('homeFootNote').textContent = T('home_foot');
  // Rotating motivational message (cycles daily)
  const motKeys = ['mot_1','mot_2','mot_3','mot_4','mot_5'];
  const motIdx = new Date().getDate() % motKeys.length;
  const motEl = document.getElementById('homeMotiv');
  if(motEl) motEl.textContent = T(motKeys[motIdx]);
  document.getElementById('homeStreakNum').textContent = streak;
  document.getElementById('homeStreak').style.display = streak > 0 ? 'flex' : 'none';

  // prog chip — show if user has any history
  const progBtn = document.getElementById('homeProgBtn');
  if(progBtn){
    const hasProg = streak > 0 || lifetimeBlocks > 0;
    progBtn.style.display = hasProg ? 'flex' : 'none';
    // Update chip label: streak if active, else session count, else static label
    const lblEl = progBtn.querySelector('.pc-label');
    if(lblEl){
      if(streak > 0) lblEl.textContent = streak + (streak === 1 ? ' dag' : ' dagen') + ' 🔥';
      else if(lifetimeBlocks > 0) lblEl.textContent = lifetimeBlocks + ' sessies';
      else lblEl.textContent = T('prog_open');
    }
  }

  // cards: Snelle blokken, Dagplanning, Agenda, (Doorgaan met last plan)
  const cards = [
    {m:'blocks', t:'card_blocks_t', d:'card_blocks_d', tag:'card_blocks_tag'},
    {m:'day',    t:'card_day_t',    d:'card_day_d',    tag:'card_day_tag'},
    {m:'agenda', t:'agenda_title',  d:'agenda_plan_d', tag:''},
  ];
  if(lastPlan && lastPlan.blocks && lastPlan.blocks.length) cards.push({m:'last', t:'card_last_t', d:'card_last_d', tag:'card_last_tag'});

  const wrap = document.getElementById('startCards'); wrap.innerHTML = '';
  // Hero/sub variants: Quick Blocks is the front door (hero), the rest are subordinate.
  const BOLT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M13 2 L4 14 h7 l-1 8 9-12 h-7 l1-8 z" stroke-linejoin="round"/></svg>';
  const SUB_ICONS = {
    day:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>',
    agenda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 12 L12 6"/><path d="M12 12 L16 14"/></svg>',
    last:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  };

  // ─── Build the layout: Hero first, then "Of plan vooruit" divider, then subs ───
  const hero = cards.find(c => c.m === 'blocks');
  const subs = cards.filter(c => c.m !== 'blocks');

  // 1. Hero
  if (hero) {
    const tag = T(hero.tag);
    const heroEl = document.createElement('button');
    heroEl.type = 'button';
    heroEl.className = 'start-card hero press';
    heroEl.innerHTML = `
      <span class="sc-bolt">${BOLT_SVG}</span>
      ${tag ? `<span class="sc-tag">⚡ ${esc(tag)}</span>` : ''}
      <span class="sc-title">${esc(T(hero.t))}</span>
      <span class="sc-desc">${esc(T(hero.d))}</span>
      <span class="sc-cta">${esc(T('begin') || 'Start')} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" width="14" height="14"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>`;
    heroEl.onclick = () => startMode(hero.m);
    wrap.appendChild(heroEl);
  }

  // 2. Section divider
  const divider = document.createElement('div');
  divider.className = 'sec-divider';
  divider.innerHTML = `<span>${esc(T('home_divider_plan') || 'Of plan vooruit')}</span>`;
  wrap.appendChild(divider);

  // 3. Sub cards
  subs.forEach(c => {
    const tag = T(c.tag);
    const el = document.createElement('button');
    el.type = 'button';
    if (c.m === 'last') {
      el.className = 'start-card sub resume press';
      el.innerHTML = `
        <span class="sc-icon">${SUB_ICONS.last}</span>
        <span class="sc-body">
          <span class="sc-title">${esc(T(c.t))}</span>
          <span class="sc-desc">${esc(T(c.d))}</span>
        </span>
        <span class="sc-go">→</span>`;
    } else {
      el.className = 'start-card sub press';
      el.innerHTML = `
        <span class="sc-icon">${SUB_ICONS[c.m] || ''}</span>
        ${tag ? `<span class="sc-tag">${esc(tag)}</span>` : ''}
        <span class="sc-title">${esc(T(c.t))}</span>
        <span class="sc-desc">${esc(T(c.d))}</span>`;
    }
    el.onclick = () => startMode(c.m);
    wrap.appendChild(el);
  });

  // 4. "Straks op het programma" hook — inserted BEFORE the hero
  renderNextupHook();

  renderHomeSocial();
  renderHomeValueProps();
  renderHomeSubjectNudge();
}

// Nudge naar vakken-toevoegen: alleen tonen als de gebruiker minder dan 2
// vakken heeft maar wel al activiteit (zodat een nieuwe user geen direct
// in-your-face prompt krijgt — die heeft de onboarding al gehad).
function renderHomeSubjectNudge(){
  let host = document.getElementById('homeSubjNudge');
  if(!host){
    const wrap = document.querySelector('.home-wrap');
    if(!wrap) return;
    host = document.createElement('div');
    host.id = 'homeSubjNudge';
    host.className = 'home-subj-nudge fade-in';
    const social = document.getElementById('homeSocial');
    if(social && social.parentNode) social.parentNode.insertBefore(host, social.nextSibling);
    else wrap.appendChild(host);
  }
  const enoughSubjects = subjects.length >= 2;
  const dismissed     = sessionStorage.getItem('fb_subjNudgeDismissed') === '1';
  const hasActivity   = lifetimeBlocks > 0 || (blocks && blocks.length > 0);
  if(enoughSubjects || dismissed || !hasActivity){ host.style.display = 'none'; host.innerHTML = ''; return; }
  host.style.display = '';
  host.innerHTML = `
    <button class="subj-nudge-close" aria-label="✕" onclick="dismissSubjNudge()">✕</button>
    <div class="subj-nudge-icon">📚</div>
    <div class="subj-nudge-body">
      <div class="subj-nudge-title">${esc(T('home_subj_nudge_t'))}</div>
      <div class="subj-nudge-desc">${esc(T('home_subj_nudge_d'))}</div>
    </div>
    <button class="subj-nudge-cta" onclick="openSettings('subjects')">${esc(T('home_subj_nudge_btn'))} →</button>`;
}
function dismissSubjNudge(){
  sessionStorage.setItem('fb_subjNudgeDismissed', '1');
  const el = document.getElementById('homeSubjNudge'); if(el){ el.style.display = 'none'; el.innerHTML = ''; }
}
window.dismissSubjNudge = dismissSubjNudge;

/* ---- avatar helper (uses fbAvatarHTML from auth.js when available) ---- */
function _socAv(f, size){
  return (typeof window.fbAvatarHTML === 'function')
    ? window.fbAvatarHTML(f.username, f.avatar_url, size)
    : `<span class="fb-av fb-av-init" style="width:${size}px;height:${size}px">${esc((f.username||'?')[0].toUpperCase())}</span>`;
}

/* ---- count + correctly-pluralised "block" noun, e.g. "<b>1</b> blok" ---- */
function _nBlk(n){
  return `<b>${n}</b> ${n === 1 ? T('n_block') : T('n_blocks')}`;
}

/* ---- "Straks op het programma" hook: next exam or scheduled block ---- */
function renderNextupHook(){
  let host = document.getElementById('homeNextupHook');
  if(!host){
    const wrap = document.querySelector('.home-wrap');
    if(!wrap) return;
    const cards = document.getElementById('startCards');
    host = document.createElement('button');
    host.id = 'homeNextupHook';
    host.type = 'button';
    host.className = 'home-hook fade-in press';
    if(cards && cards.parentNode) cards.parentNode.insertBefore(host, cards);
    else wrap.appendChild(host);
  }

  // Pick the most relevant "next" piece of info
  let label = '', title = '', onClick = null;

  // 1. Upcoming exam (within ~14 days) is the most motivating
  const today = new Date(); today.setHours(0,0,0,0);
  let nextExam = null;
  try {
    if(typeof examDates !== 'undefined' && Array.isArray(examDates)){
      const sorted = examDates.filter(e => {
        const d = new Date(e.date); d.setHours(0,0,0,0);
        return d >= today;
      }).sort((a,b) => a.date.localeCompare(b.date));
      nextExam = sorted[0] || null;
    }
  } catch(e){}

  // 2. Today's planned blocks (from lastPlan or current blocks)
  let plannedToday = 0;
  try {
    if(typeof blocks !== 'undefined' && Array.isArray(blocks)){
      plannedToday = blocks.filter(b => !b.isPause).length;
    }
  } catch(e){}

  if(nextExam){
    const d = new Date(nextExam.date); d.setHours(0,0,0,0);
    const days = Math.round((d - today) / 86400000);
    let when = '';
    if(days === 0) when = T('nextup_today') || 'vandaag';
    else if(days === 1) when = T('nextup_tomorrow') || 'morgen';
    else when = (T('nextup_in_days') || 'over <b>{n} dagen</b>').replace('{n}', days);
    label = T('nextup_label');
    title = T('nextup_exam').replace('{subj}', esc(nextExam.subject || nextExam.title || 'Examen')).replace('{when}', when);
    if(plannedToday > 0){
      title += ' · ' + T('nextup_today_blocks').replace('{blk}', _nBlk(plannedToday));
    }
    onClick = () => { if(typeof goAgenda === 'function') goAgenda(); };
  } else if(plannedToday > 0){
    label = T('nextup_label_today');
    title = T('nextup_today_only').replace('{blk}', _nBlk(plannedToday));
    onClick = () => startMode('day');
  } else {
    // Hide if nothing useful to show
    host.style.display = 'none';
    return;
  }

  host.style.display = '';
  host.innerHTML = `
    <span class="hh-rail"></span>
    <span class="hh-body">
      <span class="hh-label">${esc(label)}</span>
      <span class="hh-title">${title}</span>
    </span>
    <span class="hh-go">→</span>`;
  host.onclick = onClick;
}
window.renderNextupHook = renderNextupHook;

/* ---- Home value band: marketing pillars for newcomers / logged-out visitors ----
   Sells the product (Plan · Focus · Together) to people without an established
   habit. Established users (streak or history) get a clean, focused home. */
function renderHomeValueProps(){
  let host = document.getElementById('homeValueBand');
  if(!host){
    const social = document.getElementById('homeSocial');
    const wrap = document.querySelector('.home-wrap');
    if(!social && !wrap) return;
    host = document.createElement('div');
    host.id = 'homeValueBand';
    host.className = 'home-value fade-in';
    if(social && social.parentNode) social.parentNode.insertBefore(host, social);
    else wrap.appendChild(host);
  }
  // Only "sell" to newcomers — established users keep a clean home.
  const established = (streak >= 2) || (typeof lifetimeBlocks !== 'undefined' && lifetimeBlocks >= 5);
  if(established){ host.style.display = 'none'; host.innerHTML = ''; return; }

  const ICONS = {
    plan:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>',
    focus:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/></svg>',
    together: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  };
  const cell = (ic, t, d) => `
    <div class="hv-cell">
      <span class="hv-ic">${ic}</span>
      <span class="hv-t">${esc(t)}</span>
      <span class="hv-d">${esc(d)}</span>
    </div>`;
  host.style.display = '';
  host.innerHTML = `
    <div class="hv-head">${esc(T('home_vp_head'))}</div>
    <div class="hv-grid">
      ${cell(ICONS.plan,     T('home_vp_plan_t'),     T('home_vp_plan_d'))}
      ${cell(ICONS.focus,    T('home_vp_focus_t'),    T('home_vp_focus_d'))}
      ${cell(ICONS.together, T('home_vp_together_t'), T('home_vp_together_d'))}
    </div>`;
}
window.renderHomeValueProps = renderHomeValueProps;

/* ---- Home social: who is studying / friends / motivation ---- */
function renderHomeSocial(){
  const host = document.getElementById('homeSocial');
  if(!host) return;
  const loggedIn = (typeof window.fbUserId === 'function') && window.fbUserId();

  if(!loggedIn){
    host.innerHTML = `
      <button class="home-join" onclick="openAuthModal()">
        <span class="hj-stack"><i></i><i></i><i></i></span>
        <span class="hj-body">
          <span class="hj-t">${esc(T('home_join_t'))}</span>
          <span class="hj-d">${esc(T('home_join_d'))}</span>
        </span>
        <span class="hj-cta">${esc(T('home_join_cta'))} →</span>
      </button>`;
    return;
  }

  const all = (typeof window.getFriendList === 'function') ? (window.getFriendList() || []) : [];

  if(!all.length){
    host.innerHTML = `
      <button class="home-social" onclick="openFriendsModal()">
        <span class="hs-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
        <span class="hs-main"><span class="hs-title">${esc(T('home_social_add_t'))}</span><span class="hs-sub">${esc(T('home_social_add_d'))}</span></span>
        <span class="hs-link">${esc(T('home_social_view'))} →</span>
      </button>`;
    return;
  }

  // Sorteer: studying > break > online > offline (zo motiveert het meest:
  // wie nu studeert staat vooraan, en wie offline is is grijs zichtbaar).
  const order = { studying:0, break:1, online:2, offline:3 };
  const sorted = [...all].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

  const studying = sorted.filter(f => f.status === 'studying');
  const onBreak  = sorted.filter(f => f.status === 'break');
  const offline  = sorted.filter(f => f.status === 'offline' || !f.status);

  // Subtekst: motiverende status-samenvatting.
  let title, sub;
  if(studying.length){
    title = studying.length === 1
      ? Tf('home_social_one', {name: esc(studying[0].username)}) || `${esc(studying[0].username)} is aan het focussen`
      : Tf('home_social_many', {n: studying.length}) || `${studying.length} vrienden zijn aan het focussen`;
    sub = offline.length ? Tf('home_social_offline_n', {n: offline.length}) || `${offline.length} offline · jouw beurt om er ook bij te zijn` : '';
  } else if(onBreak.length){
    title = T('home_social_break') || `${onBreak.length} vriend${onBreak.length>1?'en':''} ${onBreak.length>1?'hebben':'heeft'} pauze`;
    sub = T('home_social_break_sub') || 'Goed moment om zelf te starten.';
  } else {
    title = T('home_social_none') || 'Niemand studeert nu';
    sub = T('home_social_be_first') || 'Wees de eerste — ga jij vandaag focussen?';
  }

  // Build the new "friends-card" widget: avatar pills with status dots + names.
  const liveCountTxt = studying.length || sorted.length;
  let headerTitle;
  if(studying.length){
    headerTitle = `<span class="fc-count">${studying.length}</span> ${esc((T('home_social_studying_now') || 'vrienden studeren nu'))}`;
  } else if(onBreak.length){
    headerTitle = `<span class="fc-count">${onBreak.length}</span> ${esc((T('home_social_on_break') || 'op pauze'))}`;
  } else {
    headerTitle = esc(T('home_social_none') || 'Niemand studeert nu');
  }

  // Top 6 friends (prototype shows ~5–6 pills + add tile)
  const shown = sorted.slice(0, 6);

  host.innerHTML = `
    <div class="friends-card ${studying.length ? 'has-live' : ''}">
      <div class="fc-head">
        <span class="fc-live-dot"><i></i></span>
        <span class="fc-title">${headerTitle}</span>
        <button class="fc-all press" onclick="openFriendsModal()">${esc((T('home_social_view') || 'Alles'))} →</button>
      </div>
      <div class="fc-pills">
        ${shown.map(f => `
          <button class="fc-pill press" title="${esc(f.username)} — ${esc(_statusLbl(f.status))}" onclick="openFriendsModal()">
            <span class="fc-av-wrap">
              ${_fcAv(f, 50)}
              <span class="fc-status ${esc(f.status || 'offline')}"></span>
            </span>
            <span class="fc-name">${esc(f.username || '?')}</span>
          </button>`).join('')}
        <button class="fc-pill add press" title="${esc((T('home_social_invite') || 'Vriend toevoegen'))}" onclick="openFriendsModal()">
          <span class="fc-av-wrap"><span class="fc-av">＋</span></span>
          <span class="fc-name">${esc((T('home_social_invite_short') || 'Nodig uit'))}</span>
        </button>
      </div>
      ${sub ? `<div class="fc-sub">${sub}</div>` : ''}
    </div>`;
}

/* avatar helper specifically for the friends-card pills (larger circles, colored backgrounds) */
function _fcAv(f, size){
  if(typeof window.fbAvatarHTML === 'function'){
    return window.fbAvatarHTML(f.username, f.avatar_url, size);
  }
  // Fallback: colored initial circle
  const initial = (f.username || '?')[0].toUpperCase();
  const colors = ['#fb7185','#67e8f9','#c084fc','#fcd34d','#6ee7b7','#f0a868','#a78bfa'];
  const hash = (f.username || '').split('').reduce((a,c) => a + c.charCodeAt(0), 0);
  const bg = colors[hash % colors.length];
  return `<span class="fb-av fb-av-init" style="background:${bg};width:${size}px;height:${size}px;font-size:${Math.round(size*0.42)}px;color:#fff;">${esc(initial)}</span>`;
}

function _statusLbl(s){
  if(s === 'studying') return T('status_studying') || 'studeert';
  if(s === 'break')    return T('status_break')    || 'pauze';
  if(s === 'online')   return T('status_online')   || 'online';
  return T('status_offline') || 'offline';
}
window.renderHomeSocial = renderHomeSocial;

/* ====================== GLOBAL NAV LABELS ====================== */
function renderNavLabels(){
  const set = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
  set('navTodayLbl', T('nav_today'));    set('botTodayLbl', T('nav_today'));
  set('navOverviewLbl', T('nav_overview')); set('botOverviewLbl', T('nav_overview'));
  set('navAgendaLbl', T('agenda_title')); set('botAgendaLbl', T('agenda_title'));
  set('navStatsLbl', T('nav_stats'));     set('botStatsLbl', T('nav_stats_short'));
  set('navStatsLblShort', T('nav_stats_short'));
  set('botQuickLbl', T('nav_quick_short') || T('card_blocks_t') || 'Snel');
  const pb = document.getElementById('navPlanBtn'); if(pb) pb.textContent = '＋ ' + T('card_plan_t');
  const qb = document.getElementById('navQuickBtn'); if(qb) qb.textContent = '⚡ ' + T('card_blocks_t');
}

/* ====================== DAGOVERZICHT (overview dashboard) ====================== */
function _hd(m){ // localized duration "4u 15m" / "4h 15m"
  m = Math.max(0, Math.round(m));
  const h = Math.floor(m/60), mn = m%60;
  const hu = T('hours_short');
  if(h && mn) return `${h}${hu} ${mn}m`;
  if(h) return `${h}${hu} 00m`;
  return `${mn}m`;
}
function _weekFocusMins(){
  const now = new Date();
  const ws = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7)); // Monday
  const wsStr = ws.getFullYear() + '-' + String(ws.getMonth()+1).padStart(2,'0') + '-' + String(ws.getDate()).padStart(2,'0');
  let mins = 0;
  history.forEach(h => { if(h.date >= wsStr && h.date !== todayStr()) mins += (h.mins || 0); });
  return mins;
}
function renderOverview(){
  const wrap = document.getElementById('ovWrap');
  if(!wrap) return;

  const todayMins = completedMins + currentSessionMins;
  const focusBlocks = blocks.filter(b => !b.isPause);
  const doneFocus = focusBlocks.filter(b => b.done).length;
  const totalFocus = focusBlocks.length;
  const blockPct = totalFocus ? Math.round((doneFocus/totalFocus)*100) : 0;

  const goalH = S.weeklyGoal || 15;
  const weekMins = _weekFocusMins() + todayMins;
  const weekPct = Math.min(100, Math.round((weekMins/(goalH*60))*100));

  const dailyTarget = Math.max(60, Math.round(goalH*60/5));
  const ringFrac = Math.min(1, todayMins/dailyTarget);
  const C = 2*Math.PI*82;
  const off = C*(1-ringFrac);

  let cheer;
  if(todayMins === 0) cheer = T('ov_cheer_start');
  else if(todayMins < 60) cheer = T('ov_cheer_good');
  else if(ringFrac >= 1) cheer = T('ov_cheer_goal') + ' 🎉';
  else cheer = T('ov_cheer_busy') + ' 🔥';

  const d = new Date();
  const dateStr = d.toLocaleDateString(S.lang === 'en' ? 'en-US' : S.lang, {weekday:'long', day:'numeric', month:'long'});

  // tip (rotates daily)
  const tipKeys = ['tip_sleep','tip_pomodoro','tip_plan','tip_break','tip_phone'];
  const tipTxt = T(tipKeys[d.getDate() % tipKeys.length]);

  // timeline
  let tlHtml = '';
  if(blocks.length){
    let mins = _parseTime(plannerStartTime);
    if(mins == null) mins = d.getHours()*60 + d.getMinutes();
    let focusNum = 0;
    blocks.forEach((b, i) => {
      const isPause = !!b.isPause;
      if(!isPause) focusNum++;
      const hh = String(Math.floor(mins/60)%24).padStart(2,'0');
      const mm = String(mins%60).padStart(2,'0');
      const cls = `ov-tl-block${isPause ? ' is-pause' : ''}${b.done ? ' is-done' : ''}${(i===curBlock && !b.done) ? ' is-cur' : ''}`;
      const badge = isPause ? '☕' : focusNum;
      const name = isPause ? T('dpl_type_pause') : (b.subject || T('phase_focus'));
      const meta = `${b.mins} min · ${isPause ? T('break_word') : T('phase_focus')}`;
      tlHtml += `
        <div class="${cls}">
          <div class="ov-tl-rail"><div class="ov-tl-dot"></div><div class="ov-tl-line"></div></div>
          <button class="ov-tl-card" onclick="ovOpenBlock(${i})">
            <div class="ov-tl-badge">${badge}</div>
            <div class="ov-tl-info"><div class="ov-tl-name">${esc(name)}</div><div class="ov-tl-meta">${esc(meta)}</div></div>
            <div class="ov-tl-time">${hh}:${mm}</div>
            <div class="ov-tl-check">${b.done ? '✓' : ''}</div>
          </button>
        </div>`;
      mins += b.mins;
    });
    tlHtml += `<button class="ov-add-block" onclick="ovAddBlock()">${esc(T('add_session'))}</button>`;
  } else {
    tlHtml = `
      <div class="ov-empty">
        <div class="ov-empty-title">${esc(T('ov_empty_t'))}</div>
        <div class="ov-empty-sub">${esc(T('ov_empty_d'))}</div>
        <button class="ov-plan-btn" onclick="startMode('day')">${esc(T('card_plan_t'))}</button>
      </div>`;
  }

  wrap.innerHTML = `
    <div class="ov-left fade-in">
      <div>
        <div class="ov-head-title">${esc(T('nav_overview'))}</div>
        <div class="ov-head-date">${esc(dateStr)}</div>
      </div>
      <div class="ov-ring-card">
        <div class="ov-ring-lbl">${esc(T('ov_total_today'))}</div>
        <div class="ov-ring-wrap">
          <svg viewBox="0 0 190 190"><circle class="ov-ring-bg" cx="95" cy="95" r="82" stroke-width="12"/><circle class="ov-ring-fg" cx="95" cy="95" r="82" stroke-width="12" stroke-dasharray="${C}" stroke-dashoffset="${C}" id="ovRingFg"/></svg>
          <div class="ov-ring-center"><div class="ov-ring-big">${_hd(todayMins)}</div><div class="ov-ring-cheer">${esc(cheer)}</div></div>
        </div>
      </div>
      <div class="ov-card">
        <div class="ov-card-head"><span class="ov-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 2v10l7 4"/></svg></span><span class="ov-card-title">${esc(T('ov_progress'))}</span></div>
        <div class="ov-card-row"><span class="ov-card-val">${doneFocus} / ${totalFocus} <em>${esc(T('ov_blocks_planned'))}</em></span><span class="ov-card-pct">${blockPct}%</span></div>
        <div class="ov-bar"><div class="ov-bar-fill" style="width:0%" data-w="${blockPct}"></div></div>
      </div>
      <div class="ov-card">
        <div class="ov-card-head"><span class="ov-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span><span class="ov-card-title">${esc(T('ov_week_goal'))}</span></div>
        <div class="ov-card-row"><span class="ov-card-val">${_hd(weekMins)} <em>${esc(T('ov_of'))} ${goalH}${esc(T('hours_short'))}</em></span><span class="ov-card-pct">${weekPct}%</span></div>
        <div class="ov-bar"><div class="ov-bar-fill" style="width:0%" data-w="${weekPct}"></div></div>
      </div>
      <div class="ov-card ov-tip-card">
        <span class="ov-tip-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg></span>
        <div><div class="ov-tip-title">${esc(T('ov_tips_today'))}</div><div class="ov-tip-text">${esc(tipTxt)}</div></div>
      </div>
    </div>

    <div class="ov-right fade-in">
      <div class="ov-right-head">
        <div class="ov-right-title">${esc(T('ov_today'))}</div>
        <div class="ov-right-actions">
          <button class="ov-quick-btn" onclick="startMode('blocks')">⚡ ${esc(T('card_blocks_t'))}</button>
          <button class="ov-plan-btn" onclick="startMode('day')">＋ ${esc(T('card_plan_t'))}</button>
        </div>
      </div>
      <div class="ov-timeline">${tlHtml}</div>
      <div class="ov-social" id="ovSocial"></div>
    </div>`;

  // animate bars + ring
  requestAnimationFrame(() => {
    const fg = document.getElementById('ovRingFg'); if(fg) fg.setAttribute('stroke-dashoffset', off);
    wrap.querySelectorAll('.ov-bar-fill').forEach(el => { el.style.width = (el.dataset.w||0) + '%'; });
  });

  renderOverviewSocial();
}

function _parseTime(t){
  if(!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h,m] = t.split(':').map(Number);
  return h*60 + m;
}

function renderOverviewSocial(){
  const host = document.getElementById('ovSocial');
  if(!host) return;
  const friends = (typeof window.getActiveFriends === 'function') ? window.getActiveFriends() : [];
  if(!friends || !friends.length){
    host.innerHTML = `<div class="ov-social-title">${esc(T('ov_together'))}</div><div class="ov-social-empty">${esc(T('ov_no_friends_active'))}</div>`;
    return;
  }
  const shown = friends.slice(0, 5);
  const more = friends.length - shown.length;
  host.innerHTML = `
    <div class="ov-social-title">${esc(T('ov_together'))}</div>
    <div class="ov-social-row">
      <div class="ov-social-avatars">
        ${shown.map(f => `<span title="${esc(f.username)}">${_socAv(f, 38)}</span>`).join('')}
        ${more > 0 ? `<div class="av more">+${more}</div>` : ''}
      </div>
      <div class="ov-social-txt">${friends.length} ${esc(friends.length === 1 ? T('ov_friend_online') : T('ov_friends_online'))}</div>
    </div>`;
}

function ovOpenBlock(i){
  const b = blocks[i];
  if(!b) return;
  if(!b.isPause){ curBlock = i; curPhase = 'focus'; if(!running){ timeLeft = b.mins*60; totalTime = b.mins*60; } }
  goApp();
}
function ovAddBlock(){
  blocks.push({id:nid++, subject:'', mins:S.focus, note:'', tasks:[], done:false, status:null});
  saveData(); renderOverview();
}

/* ====================== FOCUS APP RENDER ====================== */
function curB(){ return blocks[curBlock] || null; }

function renderApp(){
  const app = document.getElementById('app');
  app.classList.remove('lay-ring','lay-minimal','lay-card');
  app.classList.add('lay-' + (S.timerLayout || 'ring'));
  document.getElementById('appStreakNum').textContent = streak;
  const planDayBtn = document.getElementById('btnPlanDay');
  if(planDayBtn) planDayBtn.textContent = '＋ ' + T('card_plan_t');
  renderDayBar();
  document.getElementById('ptabFocus').textContent = T('ptab_focus');
  document.getElementById('ptabShort').textContent = T('ptab_short');
  document.getElementById('ptabLong').textContent = T('ptab_long');
  document.querySelectorAll('.ptab').forEach(t => t.classList.toggle('on', t.dataset.ph === curPhase));
  renderMission();
  sizeRing(); drawRing();
  updateTimeText();
  updateEndsPill();
  updatePlayBtn();
  document.getElementById('btnRestart').textContent = T('restart');
  document.getElementById('btnSkip').textContent = (curPhase === 'pause-block') ? T('skip_btn') : T('skip_btn');
  document.getElementById('btnSkip').style.display = (curPhase === 'focus' || curPhase === 'pause-block') ? '' : 'none';
  document.getElementById('mobPlanLbl').textContent = T('card_plan_t').split(' ')[0] || 'Plan';
  document.getElementById('mobZenLbl').textContent = T('ptab_focus');
  document.getElementById('mobProgLbl').textContent = T('prog_title').split(' ').pop();
  document.getElementById('mobSetLbl').textContent = T('set_title');
  document.getElementById('zenExitBtn').innerHTML = '✕ ' + esc(T('cancel'));
  updateMotiv();
  renderCompanionStage();
  document.getElementById('rcHeadTitle').textContent = T('today_sessions');
  // calculate estimated end time
  const endEl = document.getElementById('rcEndtime');
  if(endEl){
    const undoneBlocks = blocks.filter(b => !b.done && !b.skipped);
    if(undoneBlocks.length){
      let remainMins = 0;
      const undoneFocus = undoneBlocks.filter(b => !b.isPause);
      undoneBlocks.forEach((b, i) => {
        remainMins += b.mins;
        if(!b.isPause && i < undoneBlocks.length-1){
          const next = undoneBlocks[i+1];
          if(next && !next.isPause){
            const focusDone = sessComp + (undoneFocus.indexOf(b));
            remainMins += (focusDone > 0 && (focusDone+1) % S.longAfter === 0) ? S.long : S.short;
          }
        }
      });
      if(running) remainMins = Math.max(0, remainMins - Math.floor((totalTime-timeLeft)/60));
      const now = new Date();
      const endMins = now.getHours()*60 + now.getMinutes() + Math.ceil(remainMins);
      const eh = Math.floor(endMins/60)%24, em = endMins%60;
      const endStr = String(eh).padStart(2,'0') + ':' + String(em).padStart(2,'0');
      endEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg><span>${esc(T('ready_at'))}</span><span class="rc-endtime-val">${endStr}</span>`;
    } else {
      endEl.innerHTML = '';
    }
  }
  document.getElementById('addBlockBtn').textContent = T('add_session');
  // Quick-add labels: 25 focus / 50 focus / short break / long break
  const qaSet = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
  qaSet('qa25', '＋ ' + T('dpl_add_focus_25'));
  qaSet('qa50', '＋ ' + T('dpl_add_focus_50'));
  qaSet('qaShort', '＋ ' + T('ptab_short'));
  qaSet('qaLong', '＋ ' + T('ptab_long'));
  const qal = document.getElementById('quickAddLabel'); if(qal) qal.textContent = T('quick_add_lbl');
  renderBuildStrip();
  renderBlocks();
  renderZenStrip();
}

function renderZenStrip(){
  const znEl = document.getElementById('zenNextup');
  if(znEl) znEl.textContent = '';
  const strip = document.getElementById('zenStrip');
  if(!strip) return;
  strip.innerHTML = '';
  const visible = [];
  blocks.forEach((b, i) => { if(!b.isPause) visible.push({b, i}); });
  const curFocusPos = visible.findIndex(v => v.i === curBlock);
  const start = Math.max(0, curFocusPos - 1);
  const end = Math.min(visible.length, start + 5);
  const slice = visible.slice(start, end);
  slice.forEach((v, si) => {
    const prevBlock = v.i > 0 ? blocks[v.i-1] : null;
    if(prevBlock && prevBlock.isPause && si > 0){
      const pd = document.createElement('div');
      pd.className = 'zs-block zs-pause' + (prevBlock.done ? ' zs-done' : '');
      pd.innerHTML = `<div class="zs-dot"></div><span class="zs-label">⏸</span><span class="zs-mins">${prevBlock.mins}m</span>`;
      strip.appendChild(pd);
      const sep = document.createElement('div'); sep.className = 'zs-sep'; strip.appendChild(sep);
    }
    const b = v.b; const i = v.i;
    let state = 'zs-future';
    if(b.done || b.skipped) state = 'zs-done';
    else if(i === curBlock) state = 'zs-cur';
    else if(si === slice.findIndex(x => !x.b.done && !x.b.skipped && x.i !== curBlock) && i > curBlock) state = 'zs-next';
    const el = document.createElement('div');
    el.className = 'zs-block ' + state;
    const label = b.subject || T('phase_focus');
    const checkmark = b.done ? '✓ ' : '';
    el.innerHTML = `<div class="zs-dot"></div><span class="zs-label">${checkmark}${esc(label)}</span><span class="zs-mins">${b.mins}m</span>`;
    strip.appendChild(el);
    if(si < slice.length-1){ const sep = document.createElement('div'); sep.className = 'zs-sep'; strip.appendChild(sep); }
  });
  if(end < visible.length){
    const more = visible.length - end;
    const sep = document.createElement('div'); sep.className = 'zs-sep'; strip.appendChild(sep);
    const el = document.createElement('div');
    el.className = 'zs-block zs-future';
    el.innerHTML = `<span class="zs-label">+${more}</span>`;
    strip.appendChild(el);
  }
}

function renderBuildStrip(){
  const acc = getCSS('--accent');
  const idx = villageStageIdx(houseProgress);
  const next = VILLAGE_STAGES[idx+1];
  const stageEl = document.getElementById('rcBuildStage');
  const fillEl = document.getElementById('rcBuildFill');
  const pctEl = document.getElementById('rcBuildPct');
  const miniEl = document.getElementById('rcBuildMini');
  if(!stageEl) return;
  miniEl.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 21 L12 21 L12 10 L7.5 6 L3 10 Z" fill="${acc}" opacity="0.85"/><path d="M12 21 L21 21 L21 13 L16.5 9 L12 13 Z" fill="${acc}" opacity="0.5"/></svg>`;
  let pct, label;
  if(next){
    const prev = VILLAGE_STAGES[idx].at;
    pct = Math.round(((houseProgress-prev)/(next.at-prev))*100);
    const rem = next.at - houseProgress;
    label = T(next.k) + ' · ' + rem + '×';
  } else { pct = 100; label = T('vs_village'); }
  stageEl.textContent = label;
  pctEl.textContent = pct + '%';
  setTimeout(() => { fillEl.style.width = pct + '%'; }, 60);
}

function renderDayBar(){
  const host = document.getElementById('dbBlocks'); host.innerHTML = '';
  blocks.forEach((b, i) => {
    const d = document.createElement('div');
    if(b.isPause){
      d.className = 'db-block' + (b.done ? ' done' : '');
      d.style.background = 'rgba(129,140,248,0.5)';
      d.style.width = '10px';
    } else {
      d.className = 'db-block' + (b.done ? ' done' : (i === curBlock && curPhase === 'focus' ? ' cur' : ''));
    }
    host.appendChild(d);
  });
  const total = completedMins + currentSessionMins;
  document.getElementById('dbInfo').innerHTML = `<strong>${sessComp}</strong> ${esc(T('done'))} · <strong>${fmtDur(total)}</strong>`;
}

function renderMission(){
  const lblEl = document.getElementById('missionLbl');
  const nameEl = document.getElementById('missionName');
  const noteEl = document.getElementById('missionNote');
  const lblWrap = lblEl ? lblEl.parentElement : null;
  const taskPanel = document.getElementById('taskSidePanel');

  function renderSideTasks(b){
    if(!taskPanel) return;
    const tasks = (b && b.tasks && b.tasks.length) ? b.tasks.filter(t => t.text && t.text.trim()) : [];
    if(!tasks.length){ taskPanel.innerHTML = ''; return; }
    taskPanel.innerHTML = `<div class="tsp-title">${esc(T('tasks_lbl'))}</div>`;
    tasks.forEach(t => {
      const el = document.createElement('button');
      el.className = 'tsp-item' + (t.done ? ' tsp-done' : '');
      el.innerHTML = `<div class="tsp-check">${t.done ? '✓' : ''}</div><span class="tsp-text">${esc(t.text)}</span>`;
      el.onclick = () => {
        t.done = !t.done;
        el.classList.toggle('tsp-done', t.done);
        el.querySelector('.tsp-check').textContent = t.done ? '✓' : '';
        saveData();
      };
      taskPanel.appendChild(el);
    });
  }

  if(curPhase === 'focus'){
    const b = curB();
    if(b && b.isPause){
      lblEl.textContent = T('break_word');
      if(lblWrap) lblWrap.classList.add('as-flag');
      nameEl.textContent = T('phase_long') + ' 😌';
      noteEl.textContent = b.note || T('break_recover');
      noteEl.style.display = '';
      if(taskPanel) taskPanel.innerHTML = '';
      return;
    }
    lblEl.textContent = Tf('sess_of', {a:Math.min(curBlock+1, blocks.filter(b=>!b.isPause).length), b:blocks.filter(b=>!b.isPause).length});
    if(lblWrap) lblWrap.classList.remove('as-flag');
    nameEl.textContent = (b && b.subject) ? b.subject : T('phase_focus');
    noteEl.textContent = (b && b.note) ? b.note : '';
    noteEl.style.display = (b && b.note) ? '' : 'none';
    renderSideTasks(b);
  } else if(curPhase === 'pause-block'){
    const b = curB();
    lblEl.textContent = T('break_word');
    if(lblWrap) lblWrap.classList.add('as-flag');
    nameEl.textContent = T('phase_long') + ' 😌';
    noteEl.textContent = b && b.note ? b.note : T('break_recover');
    noteEl.style.display = '';
    if(taskPanel) taskPanel.innerHTML = '';
  } else {
    lblEl.textContent = curPhase === 'short' ? T('phase_short') : T('phase_long');
    if(lblWrap) lblWrap.classList.add('as-flag');
    nameEl.textContent = curPhase === 'short' ? T('break_short_msg') : T('break_long_msg');
    noteEl.textContent = curPhase === 'long' ? Tf('sess_of', {a:Math.min(curBlock+1, blocks.length), b:blocks.length}) : '';
    noteEl.style.display = noteEl.textContent ? '' : 'none';
    if(taskPanel) taskPanel.innerHTML = '';
  }
}

/* ---- ring sizing (responsive) ---- */
function sizeRing(){
  const wrap = document.getElementById('ringWrap');
  const stage = document.getElementById('stage');
  if(!wrap || !stage) return;
  const zen = document.body.classList.contains('zen');
  // Mobiel (en als fallback): ring lekker groot; daar mag de stage bewust scrollen.
  const avail = Math.min(stage.clientWidth || 360, (window.innerHeight || 700) * 0.46);
  let size = Math.max(200, Math.min(360, avail - 40));

  // Desktop, niet-zen: bereken de ring uit de ECHTE vrije ruimte zodat missie +
  // ring + eindtijd + start/stop samen ALTIJD passen — geen scroll, de play-knop
  // valt nooit onder de vouw (ook niet op fullscreen). We kunnen niet op
  // scrollHeight steunen (justify-content:center maakt scrollHeight==clientHeight
  // zodra de inhoud past), dus tellen we zelf alle flow-broertjes op: hun hoogte +
  // verticale marges + de flex-gaps + de stage-padding. Companion en vriendenbalk
  // staan absoluut en tellen dus niet mee. De rest is voor de ring.
  if(window.innerWidth >= 821 && !zen){
    const cs = getComputedStyle(stage);
    const gap = parseFloat(cs.gap) || 0;
    let used = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    let items = 0;
    [...stage.children].forEach(c => {
      const s = getComputedStyle(c);
      if(s.display === 'none' || s.position === 'absolute') return;
      items++;
      const my = parseFloat(s.marginTop) + parseFloat(s.marginBottom);
      used += (c === wrap) ? my : (c.offsetHeight + my); // ring telt enkel z'n marges
    });
    used += gap * Math.max(0, items - 1);
    const free = stage.clientHeight - used - 3;      // 3px speling tegen afronding
    const maxW = (stage.clientWidth || 360) - 72;    // nooit breder dan de stage
    size = Math.max(168, Math.min(360, Math.min(maxW, free)));
  }

  if(zen) size = Math.max(240, Math.min(420, Math.min(stage.clientWidth - 40, window.innerHeight * 0.55)));
  wrap.style.width = size + 'px'; wrap.style.height = size + 'px';
  const svg = document.getElementById('ringSvg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  const sw = Math.max(8, Math.round(size * 0.035));
  const r = (size - sw) / 2 - 2;
  const cx = size / 2;
  ['ringBg','ringFg'].forEach(id => { const c = document.getElementById(id); c.setAttribute('cx',cx); c.setAttribute('cy',cx); c.setAttribute('r',r); c.setAttribute('stroke-width',sw); });
  const circ = 2 * Math.PI * r;
  const fg = document.getElementById('ringFg');
  fg.setAttribute('stroke-dasharray', circ);
  fg._circ = circ;
  document.getElementById('tTime').style.fontSize = Math.round(size * 0.2) + 'px';
}

function drawRing(){
  const fg = document.getElementById('ringFg');
  const circ = fg._circ || (2 * Math.PI * 140);
  const frac = totalTime > 0 ? (timeLeft / totalTime) : 0;
  fg.setAttribute('stroke-dashoffset', circ * (1 - frac));
}

function updateTimeText(){
  const t = fmt(timeLeft);
  document.getElementById('tTime').textContent = t;
  document.getElementById('minimalTime').textContent = t;
  const sub = document.getElementById('tSub');
  if(curPhase === 'focus'){
    const b = curB();
    if(b && b.isPause){ sub.textContent = T('break_word'); }
    else { sub.textContent = (b && b.subject) ? b.subject : T('phase_focus'); }
  }
  else if(curPhase === 'pause-block'){ sub.textContent = T('break_word'); }
  else sub.textContent = curPhase === 'short' ? T('phase_short') : T('phase_long');
  const near = running && timeLeft <= 30 && timeLeft > 0;
  document.getElementById('app').classList.toggle('near-end', near);
  document.getElementById('ringWrap').classList.toggle('near-end', near);
}

function updateEndsPill(){
  document.getElementById('epLbl').textContent = T('ends_at');
  const end = new Date(Date.now() + timeLeft * 1000);
  document.getElementById('epVal').textContent = fmtClock(end);
  const note = document.getElementById('epNote');
  note.textContent = running ? (curPhase === 'focus' ? T('ep_focus') : T('ep_break')) : T('ep_start');
}

function updatePlayBtn(){
  const btn = document.getElementById('playBtn');
  btn.textContent = running ? '❚❚' : '▶';
  btn.classList.toggle('idle', !running);
}

/* ====================== BLOCK LIST (planning) ====================== */
let editingBlock = null;

function renderBlocks(){
  const host = document.getElementById('blocksList'); if(!host) return;
  host.innerHTML = '';
  let focusIdx = 0;
  blocks.forEach((b, i) => {
    if(!b.isPause) focusIdx++;
    const item = document.createElement('div');
    item.dataset.idx = i;
    item.className = 'block-item' + (b.isPause ? ' pause-block' : '') + (i === curBlock && !b.done ? ' cur' : '') + (b.done ? ' done' : '') + (b.skipped ? ' skipped' : '');
    const dragHandle = `<div class="bi-drag" title="${esc(T('drag_to_move'))}">⠿</div>`;
    const taskCount = b.tasks ? b.tasks.length : 0;
    const doneTasks = b.tasks ? b.tasks.filter(t => t.done).length : 0;
    if(b.isPause){
      item.innerHTML = `
        <div class="bi-head">
          ${dragHandle}
          <div class="bi-num bi-num-pause" aria-label="${esc(T('break_word'))}">☕</div>
          <div class="bi-body" data-edit="${i}">
            <div class="bi-name">${esc(T('break_word'))}</div>
            <div class="bi-meta">${b.mins} min${b.note ? ' · ' + esc((b.note||'').substring(0,30)) : ''}</div>
          </div>
          ${blocks.length > 1 ? `<button class="bi-del-quick" title="${esc(T('del_lbl'))}" aria-label="${esc(T('del_lbl'))}">✕</button>` : ''}
        </div>
        <div class="bi-edit" id="biEdit${i}">
          <div style="display:flex;gap:8px;align-items:center;"><span style="font-size:12px;color:var(--muted)">${esc(T('br_edit_lbl'))}</span><input class="bi-mins" type="number" min="2" max="60" step="1" value="${b.mins}" style="width:80px;"></div>
          <div class="bi-pause-presets">
            ${[5, 10, 15, 25].map(p => `<button type="button" class="bi-pause-preset${b.mins === p ? ' on' : ''}" data-p="${p}">${p}m</button>`).join('')}
          </div>
          <textarea class="bi-note" placeholder="${esc(T('br_note_ph'))}">${esc(b.note || '')}</textarea>
          <div style="display:flex;gap:8px;"><button type="button" class="btn-primary bi-save" style="flex:1;">${esc(T('save'))}</button></div>
        </div>`;
      item.querySelector('.bi-body').onclick = (e) => { if(e.target.closest('.bi-drag,.bi-del-quick')) return; toggleEdit(i); };
      if(blocks.length > 1) item.querySelector('.bi-del-quick').onclick = (e) => { e.stopPropagation(); deleteBlock(i); };
      const minsInp = item.querySelector('.bi-mins');
      if(minsInp){
        minsInp.oninput = (e) => {
          b.mins = Math.max(2, Math.min(60, +e.target.value || 2));
          item.querySelectorAll('.bi-pause-preset').forEach(p => p.classList.toggle('on', +p.dataset.p === b.mins));
          if(i === curBlock && !running){ timeLeft = b.mins * 60; totalTime = b.mins * 60; drawRing && drawRing(); updateTimeText && updateTimeText(); updateEndsPill && updateEndsPill(); }
          saveData();
        };
      }
      item.querySelectorAll('.bi-pause-preset').forEach(btn => {
        btn.onclick = () => {
          b.mins = +btn.dataset.p;
          if(minsInp) minsInp.value = b.mins;
          item.querySelectorAll('.bi-pause-preset').forEach(p => p.classList.toggle('on', +p.dataset.p === b.mins));
          if(i === curBlock && !running){ timeLeft = b.mins * 60; totalTime = b.mins * 60; drawRing && drawRing(); updateTimeText && updateTimeText(); updateEndsPill && updateEndsPill(); }
          saveData(); renderBlocks(); openEdit(i);
        };
      });
      const noteEl = item.querySelector('.bi-note');
      if(noteEl) noteEl.oninput = (e) => { b.note = e.target.value; };
      const saveBtn = item.querySelector('.bi-save');
      if(saveBtn) saveBtn.onclick = () => { editingBlock = null; saveData(); renderApp(); };
      if(editingBlock === i){ const ed = item.querySelector('#biEdit' + i); if(ed) ed.classList.add('open'); }
    } else {
      const meta = `${b.mins} min${taskCount ? ` · ${doneTasks}/${taskCount} ✓` : ''}${b.skipped ? ' · ' + esc(T('skip')) : ''}`;
      item.innerHTML = `
        <div class="bi-head">
          ${dragHandle}
          <div class="bi-num">${b.done ? '✓' : focusIdx}</div>
          <div class="bi-body" data-edit="${i}">
            <div class="bi-name">${esc(b.subject || T('phase_focus'))}</div>
            <div class="bi-meta">${meta}</div>
          </div>
          ${blocks.length > 1 ? `<button class="bi-del-quick" title="${esc(T('del_lbl'))}" aria-label="${esc(T('del_lbl'))}">✕</button>` : ''}
        </div>
        <div class="bi-edit" id="biEdit${i}">
          <div class="bb-subj-chips" id="biChips${i}">${subjects.map(s => `<button type="button" class="bb-subj-chip${b.subject === s.name ? ' on' : ''}" data-name="${esc(s.name)}" style="--chip-col:${s.color}">${esc(s.name)}</button>`).join('')}<button type="button" class="bb-subj-chip bb-subj-new${(!subjects.some(s => s.name === b.subject) && b.subject) || b._editCustom ? ' on' : ''}">${esc(T('add_subj_btn'))}</button></div>
          ${(!subjects.some(s => s.name === b.subject) && b.subject) || b._editCustom ? `<input class="bi-custom" placeholder="${esc(T('subj_ph'))}" value="${esc(b.subject)}">` : `<input class="bi-custom hidden" placeholder="${esc(T('subj_ph'))}">`}
          <div style="display:flex;gap:8px;align-items:center;"><span style="font-size:12px;color:var(--muted)">${esc(T('minutes'))}</span><input class="bi-mins" type="number" min="5" max="180" step="5" value="${b.mins}" style="width:80px;"></div>
          <textarea class="bi-note" placeholder="${esc(T('note_ph'))}">${esc(b.note || '')}</textarea>
          <div class="bi-tasklist" id="biTasks${i}"></div>
          <button class="bb-add-task bi-addtask">${esc(T('add_task'))}</button>
          <div style="display:flex;gap:8px;"><button type="button" class="btn-primary bi-save" style="flex:1;">${esc(T('save'))}</button></div>
        </div>`;
      item.querySelector('.bi-body').onclick = (e) => { if(e.target.closest('.bi-drag,.bi-del-quick')) return; toggleEdit(i); };
      if(blocks.length > 1) item.querySelector('.bi-del-quick').onclick = (e) => { e.stopPropagation(); deleteBlock(i); };
      wireBlockEdit(item, b, i);
    }
    host.appendChild(item);
  });
  // smooth pointer drag (mouse + touch)
  attachPointerDrag(host,
    () => [...host.querySelectorAll('.block-item')],
    (el) => parseInt(el.dataset.idx),
    (from, to) => {
      const moved = blocks.splice(from, 1)[0];
      const insertAt = to > from ? to-1 : to;
      blocks.splice(insertAt, 0, moved);
      if(curBlock === from) curBlock = insertAt;
      else if(from < insertAt && curBlock > from && curBlock <= insertAt) curBlock--;
      else if(from > insertAt && curBlock < from && curBlock >= insertAt) curBlock++;
      saveData(); renderApp();
    }
  );
}

function wireBlockEdit(item, b, i){
  const chipsHost = item.querySelector('#biChips' + i);
  if(chipsHost){
    const custInp = item.querySelector('.bi-custom');
    chipsHost.querySelectorAll('.bb-subj-chip:not(.bb-subj-new)').forEach(chip => {
      chip.onclick = () => {
        b.subject = chip.dataset.name; b._editCustom = false;
        chipsHost.querySelectorAll('.bb-subj-chip').forEach(c => c.classList.remove('on'));
        chip.classList.add('on');
        if(custInp){ custInp.classList.add('hidden'); custInp.value = ''; }
      };
    });
    const newChip = chipsHost.querySelector('.bb-subj-new');
    if(newChip && custInp){
      newChip.onclick = () => {
        chipsHost.querySelectorAll('.bb-subj-chip').forEach(c => c.classList.remove('on'));
        newChip.classList.add('on');
        custInp.classList.remove('hidden');
        b._editCustom = true; b.subject = '';
        setTimeout(() => custInp.focus(), 30);
      };
    }
    if(custInp){ custInp.oninput = () => { b.subject = custInp.value; }; custInp.onkeydown = (e) => { if(e.key === 'Enter'){ e.preventDefault(); custInp.blur(); } }; }
  }
  item.querySelector('.bi-mins').oninput = (e) => {
    b.mins = Math.max(5, Math.min(180, +e.target.value || 5));
    if(i === curBlock && !running && curPhase === 'focus'){
      timeLeft = b.mins * 60;
      totalTime = b.mins * 60;
      drawRing(); updateTimeText(); updateEndsPill();
    }
    saveData();
  };
  item.querySelector('.bi-note').oninput = (e) => { b.note = e.target.value; };
  const tl = item.querySelector('#biTasks' + i);
  if(!b.tasks) b.tasks = [];
  b.tasks.forEach((t, ti) => {
    const row = document.createElement('div'); row.className = 'bi-task' + (t.done ? ' checked' : '');
    row.innerHTML = `<input type="checkbox" ${t.done ? 'checked' : ''}><input class="bi-tedit" value="${esc(t.text || '')}" placeholder="${esc(T('task_ph'))}" style="flex:1;background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:5px 8px;font-size:12px;outline:none;"><button class="bb-x" style="width:22px;">✕</button>`;
    row.querySelector('input[type=checkbox]').onchange = (e) => { t.done = e.target.checked; row.classList.toggle('checked', t.done); saveData(); renderDayBar(); };
    row.querySelector('.bi-tedit').oninput = (e) => { t.text = e.target.value; };
    row.querySelector('.bb-x').onclick = () => { b.tasks.splice(ti, 1); renderBlocks(); openEdit(i); };
    tl.appendChild(row);
  });
  item.querySelector('.bi-addtask').onclick = () => { b.tasks.push({text:'', done:false}); renderBlocks(); openEdit(i); };
  item.querySelector('.bi-save').onclick = () => {
    if(b.subject){
      const name = b.subject.trim();
      const isNew = !subjects.some(s => s.name.toLowerCase() === name.toLowerCase());
      addSubject(name);
      if(isNew && name) banner(Tf('subj_added', {name: name}));
    }
    editingBlock = null; saveData(); renderApp();
  };
  if(editingBlock === i){ const ed = item.querySelector('#biEdit' + i); if(ed) ed.classList.add('open'); }
}

function toggleEdit(i){ editingBlock = (editingBlock === i) ? null : i; renderBlocks(); }
function openEdit(i){ editingBlock = i; const ed = document.getElementById('biEdit' + i); if(ed) ed.classList.add('open'); }

// Close edit block when clicking outside
document.addEventListener('click', (e) => {
  if(editingBlock !== null && !e.target.closest('.block-item') && !e.target.closest('.modal-ov')) {
    const b = blocks[editingBlock];
    if(b && b.subject){
      const name = b.subject.trim();
      if(name && !subjects.some(s => s.name.toLowerCase() === name.toLowerCase())){ addSubject(name); }
    }
    editingBlock = null; saveData(); renderApp();
  }
});

function moveBlock(i, dir){
  const j = i + dir; if(j < 0 || j >= blocks.length) return;
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  if(curBlock === i) curBlock = j; else if(curBlock === j) curBlock = i;
  saveData(); renderApp();
}

function addQuickBlock(mins){
  blocks.push({id:nid++, subject:'', mins, note:'', tasks:[], done:false, status:null});
  // Altijd een pauze toevoegen na een focus-blok — Pomodoro-flow en zorgt dat
  // "klaar om" eerlijk klopt. Korte focus → 5 min, langere → S.short (default 10).
  const brMins = mins < 30 ? 5 : ((S && S.short) ? S.short : 10);
  blocks.push({id:nid++, isPause:true, mins: brMins, note:'', tasks:[], done:false});
  // Sync ring to this block if this was the first add and timer isn't running
  if(!running && blocks.length === 2){ timeLeft = mins * 60; totalTime = mins * 60; }
  // Check of we de lange-pauze prompt moeten tonen (na 4 focus zonder lange pauze)
  maybeSuggestLongBreak();
  saveData(); renderApp();
}

function addQuickPause(kind){
  const mins = kind === 'long' ? (S.long || 25) : (S.short || 10);
  const pb = {id:nid++, isPause:true, mins, note:'', tasks:[], done:false};
  // If timer is active or we're halfway through, insert right after the current block
  if (running && curBlock !== null && curBlock < blocks.length - 1) {
    blocks.splice(curBlock + 1, 0, pb);
  } else {
    blocks.push(pb);
  }
  saveData(); renderApp();
}

function checkPauseSuggestion(){
  let streak = 0;
  for(let i = blocks.length-1; i >= 0; i--){
    if(blocks[i].isPause) break;
    streak++;
  }
  if(streak > 0 && streak % 3 === 0){
    const b = document.createElement('div');
    b.className = 'pause-suggest';
    const suggestTxt = Tf('pause_streak_q', {n: streak}) || `${streak} blokken zonder pauze — pauze inlassen?`;
    const addTxt = T('pause_add') || '＋ Pauze';
    b.innerHTML = `<span>💡 ${esc(suggestTxt)}</span><button onclick="addQuickPause();this.closest('.pause-suggest').remove()">${esc(addTxt)}</button><button onclick="this.closest('.pause-suggest').remove()">✕</button>`;
    const host = document.getElementById('blocksList');
    if(host){ host.before(b); setTimeout(() => b.remove && b.isConnected && b.remove(), 8000); }
  }
}

// ── Lange-pauze prompt ─────────────────────────────────────────────
// Toont een keuze-modaal na elke 4 focus-blokken zonder lange pauze (>=15m).
// Onthoudt per "batch" of de prompt al getoond is zodat we niet spammen.
let _lbPromptedAt = -1;
function maybeSuggestLongBreak(){
  const focusBlocks = blocks.filter(b => !b.isPause);
  const focusCount  = focusBlocks.length;
  if(focusCount < 4 || focusCount % 4 !== 0) return;
  if(_lbPromptedAt === focusCount) return; // al getoond voor deze batch
  // Heeft de gebruiker recent al een lange pauze (>=15m) ingelast? Dan niet vragen.
  const recentLong = blocks.slice(-8).some(b => b.isPause && (b.mins || 0) >= 15);
  if(recentLong) return;
  _lbPromptedAt = focusCount;
  openLongBreakModal();
}

function openLongBreakModal(){
  // Verwijder eventueel bestaande modaal eerst
  document.getElementById('lbPromptOv')?.remove();
  const ov = document.createElement('div');
  ov.id = 'lbPromptOv';
  ov.className = 'modal-ov open';
  ov.innerHTML = `
    <div class="modal-card" style="max-width:380px;">
      <div class="modal-head">
        <div class="modal-title">☕ ${esc(T('lb_long_break_title') || 'Tijd voor een langere pauze?')}</div>
        <button class="modal-x" onclick="closeLongBreakModal()">✕</button>
      </div>
      <div class="modal-body" style="text-align:center;padding:1.2rem 1.4rem 1.4rem;">
        <p style="color:var(--muted);margin:0 0 1rem;font-size:14px;line-height:1.5;">
          ${esc(T('lb_long_break_body') || 'Je hebt 4 focus-blokken op rij gepland. Een langere pauze helpt je echt resetten.')}
        </p>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:0.8rem;">
          ${[15, 20, 25, 30].map(m => `<button class="ctrl-btn lb-dur-btn" type="button" onclick="confirmLongBreak(${m})">${m}m</button>`).join('')}
        </div>
        <button class="btn-ghost" type="button" style="width:100%;" onclick="closeLongBreakModal()">${esc(T('lb_long_break_skip') || 'Nee, laat maar')}</button>
      </div>
    </div>`;
  ov.onclick = (e) => { if(e.target === ov) closeLongBreakModal(); };
  document.body.appendChild(ov);
}
function closeLongBreakModal(){ document.getElementById('lbPromptOv')?.remove(); }
function confirmLongBreak(mins){
  const pb = {id:nid++, isPause:true, mins, note: T('lb_long_break_note') || 'Lange pauze', tasks:[], done:false};
  if (curBlock !== null && curBlock < blocks.length) {
    // Insert after current block since the user just finished one
    blocks.splice(curBlock + 1, 0, pb);
  } else {
    blocks.push(pb);
  }
  closeLongBreakModal();
  saveData(); renderApp();
  banner(Tf('lb_long_break_added', {n: mins}) || `Pauze van ${mins} min toegevoegd`);
}
window.closeLongBreakModal = closeLongBreakModal;
window.confirmLongBreak    = confirmLongBreak;

// ── Quick-Add popup ─────────────────────────────────────────────────
// Eén gepolijste modaal voor snel focus-blokken of pauzes toevoegen, met
// een duur-slider, een aantal-slider en (voor focus) vak-chips + live preview.
let _qa = { type:'focus', mins:25, count:1, subject:'' };

function qaCfg(type){
  if(type === 'short') return { min:3,  max:20, step:1, def:(S && S.short) ? S.short : 10 };
  if(type === 'long')  return { min:15, max:45, step:5, def:(S && S.long)  ? S.long  : 25 };
  return { min:5, max:90, step:5, def:25 }; // focus
}

function openQuickAdd(type, mins){
  document.getElementById('qaPopOv')?.remove();
  const t = (type === 'short' || type === 'long' || type === 'focus') ? type : 'focus';
  const cfg = qaCfg(t);
  _qa = { type:t, mins: mins ? mins : cfg.def, count:1, subject:'' };
  const ov = document.createElement('div');
  ov.id = 'qaPopOv';
  ov.className = 'modal-ov open';
  ov.innerHTML = `
    <div class="modal-card qa-pop">
      <div class="modal-head">
        <div class="modal-title">⚡ ${esc(T('qa_pop_title') || 'Quick add')}</div>
        <button class="modal-x" onclick="closeQuickAdd()">✕</button>
      </div>
      <div class="modal-body qa-body" id="qaBody"></div>
    </div>`;
  ov.onclick = (e) => { if(e.target === ov) closeQuickAdd(); };
  document.body.appendChild(ov);
  qaRenderBody();
}
function closeQuickAdd(){ document.getElementById('qaPopOv')?.remove(); }

function qaSetType(t){
  if(_qa.type === t) return;
  _qa.type = t;
  _qa.mins = qaCfg(t).def;
  if(t !== 'focus') _qa.subject = '';
  qaRenderBody();
}
function qaSetSubject(name){
  _qa.subject = (_qa.subject === name) ? '' : name;
  qaRenderBody();
}
function qaSlide(key, val){
  _qa[key] = parseInt(val, 10) || (key === 'count' ? 1 : qaCfg(_qa.type).def);
  qaSyncText();
}
// Werk alleen de tekst/preview bij (niet de hele body) zodat slepen vloeiend blijft.
function qaSyncText(){
  const mv = document.getElementById('qaMinsVal'); if(mv) mv.textContent = _qa.mins + 'm';
  const cv = document.getElementById('qaCountVal'); if(cv) cv.textContent = _qa.count;
  const pv = document.getElementById('qaPreview'); if(pv) pv.innerHTML = qaPreviewHTML();
  const ab = document.getElementById('qaAddBtn'); if(ab) ab.textContent = Tf('qa_add_n', {n:_qa.count}) || ('＋ Add ' + _qa.count);
}
function qaPreviewHTML(){
  const u = (typeof T==='function' && T('min_short')) ? T('min_short') : 'min';
  const typeLbl = _qa.type === 'focus'
    ? (T('dpl_type_focus') || 'Focus')
    : (_qa.type === 'long' ? (T('ptab_long') || T('dpl_type_pause') || 'Break') : (T('ptab_short') || T('dpl_type_pause') || 'Break'));
  let line = `<strong>${_qa.count} × ${_qa.mins} ${esc(u)}</strong> ${esc(typeLbl.toLowerCase())}`;
  if(_qa.type === 'focus') line += ` · ${esc(T('qa_incl_breaks') || 'breaks included')}`;
  return line;
}
function qaRenderBody(){
  const body = document.getElementById('qaBody');
  if(!body) return;
  const cfg = qaCfg(_qa.type);
  if(_qa.mins < cfg.min) _qa.mins = cfg.min;
  if(_qa.mins > cfg.max) _qa.mins = cfg.max;
  const types = [
    { id:'focus', lbl: T('dpl_type_focus') || 'Focus',  emo:'🎯' },
    { id:'short', lbl: T('ptab_short') || 'Short',       emo:'☕' },
    { id:'long',  lbl: T('ptab_long')  || 'Long',        emo:'🌙' }
  ];
  const typeToggle = `<div class="qa-seg">${types.map(t =>
    `<button type="button" class="qa-seg-btn${_qa.type===t.id?' on':''}" onclick="qaSetType('${t.id}')"><span>${t.emo}</span>${esc(t.lbl)}</button>`
  ).join('')}</div>`;

  const durBlock = `
    <div class="qa-field">
      <div class="qa-field-head"><span>${esc(T('qa_dur') || 'Duration')}</span><span class="qa-val" id="qaMinsVal">${_qa.mins}m</span></div>
      <input type="range" class="qa-slider" id="qaMins" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${_qa.mins}" oninput="qaSlide('mins',this.value)">
    </div>`;

  const countBlock = `
    <div class="qa-field">
      <div class="qa-field-head"><span>${esc(T('qa_amount') || 'How many')}</span><span class="qa-val" id="qaCountVal">${_qa.count}</span></div>
      <input type="range" class="qa-slider" id="qaCount" min="1" max="8" step="1" value="${_qa.count}" oninput="qaSlide('count',this.value)">
    </div>`;

  let subjBlock = '';
  if(_qa.type === 'focus' && typeof subjects !== 'undefined' && subjects.length){
    const chips = [`<button type="button" class="qa-chip${_qa.subject===''?' on':''}" onclick="qaSetSubject('')">${esc(T('qa_subj_none') || 'None')}</button>`]
      .concat(subjects.map(s => {
        const c = (typeof colorFor==='function') ? colorFor(s.name) : 'var(--accent)';
        return `<button type="button" class="qa-chip${_qa.subject===s.name?' on':''}" onclick="qaSetSubject(${JSON.stringify(s.name).replace(/"/g,'&quot;')})"><span class="qa-chip-dot" style="background:${c}"></span>${esc(s.name)}</button>`;
      })).join('');
    subjBlock = `<div class="qa-field"><div class="qa-field-head"><span>${esc(T('qa_subj_opt') || 'Subject (optional)')}</span></div><div class="qa-chips">${chips}</div></div>`;
  }

  body.innerHTML = `
    ${typeToggle}
    ${durBlock}
    ${countBlock}
    ${subjBlock}
    <div class="qa-preview" id="qaPreview">${qaPreviewHTML()}</div>
    <button class="qa-add" id="qaAddBtn" type="button" onclick="confirmQuickAdd()">${esc(Tf('qa_add_n', {n:_qa.count}) || ('＋ Add ' + _qa.count))}</button>`;
}
function confirmQuickAdd(){
  const wasEmpty = !running && blocks.length === 0;
  const n = Math.max(1, Math.min(8, _qa.count));
  if(_qa.type === 'focus'){
    const brMins = _qa.mins < 30 ? 5 : ((S && S.short) ? S.short : 10);
    for(let i = 0; i < n; i++){
      blocks.push({id:nid++, subject:_qa.subject || '', mins:_qa.mins, note:'', tasks:[], done:false, status:null});
      blocks.push({id:nid++, isPause:true, mins:brMins, note:'', tasks:[], done:false});
    }
    maybeSuggestLongBreak();
  } else {
    for(let i = 0; i < n; i++){
      blocks.push({id:nid++, isPause:true, mins:_qa.mins, note:'', tasks:[], done:false});
    }
  }
  if(wasEmpty && blocks.length){ const m = blocks[0].mins; timeLeft = m * 60; totalTime = m * 60; }
  closeQuickAdd();
  saveData(); renderApp();
  banner(Tf('qa_added_n', {n}) || (n + ' blocks added'));
}
window.openQuickAdd    = openQuickAdd;
window.closeQuickAdd   = closeQuickAdd;
window.qaSetType       = qaSetType;
window.qaSetSubject    = qaSetSubject;
window.qaSlide         = qaSlide;
window.confirmQuickAdd = confirmQuickAdd;

function addBlock(){
  blocks.push({id:nid++, subject:'', mins:S.focus, note:'', tasks:[], done:false, status:null});
  checkPauseSuggestion();
  saveData(); renderApp(); openEdit(blocks.length - 1);
}

function deleteBlock(i){
  blocks.splice(i, 1);
  if (i < curBlock) curBlock--;
  if (curBlock >= blocks.length) curBlock = Math.max(0, blocks.length - 1);
  editingBlock = null;
  if(!blocks.length){
    saveData();
    goHome();
    return;
  }
  // Resync timer to the current block when not running
  if(!running){
    const cb = blocks[curBlock];
    if(cb && curPhase === 'focus' && !cb.isPause){
      timeLeft = cb.mins * 60; totalTime = cb.mins * 60;
    }
  }
  saveData(); renderApp();
}

/* ====================== PLANNING COLLAPSE / MOBILE SHEET ====================== */
let collapsed = false;
function toggleCollapse(){
  collapsed = !collapsed;
  document.getElementById('appBody').classList.toggle('collapsed', collapsed);
  setTimeout(sizeRing, 360);
}
function openPlanning(){ document.getElementById('rightCol').classList.add('open'); }
function closePlanning(){ document.getElementById('rightCol').classList.remove('open'); }

/* ====================== ZEN MODE ====================== */
function enterZen(){
  document.body.classList.add('zen');
  setTimeout(sizeRing, 50);
  const el = document.documentElement;
  if(el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}
function exitZen(){
  document.body.classList.remove('zen');
  setTimeout(sizeRing, 50);
  if(document.fullscreenElement || document.webkitFullscreenElement){
    if(document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
}

// keep zen state in sync if user presses Escape
document.addEventListener('fullscreenchange', () => {
  if(!document.fullscreenElement && document.body.classList.contains('zen')){
    document.body.classList.remove('zen');
    setTimeout(sizeRing, 50);
  }
});
document.addEventListener('webkitfullscreenchange', () => {
  if(!document.webkitFullscreenElement && document.body.classList.contains('zen')){
    document.body.classList.remove('zen');
    setTimeout(sizeRing, 50);
  }
});

/* ====================== INIT ====================== */
async function init(){
  // detect default language from browser if first run
  let local = loadLocal();
  if(!local){
    const idbData = await idbGet();
    if(idbData) local = idbData;
  }
  if(local){ applyLoaded(local); }
  else {
    const nav = (navigator.language || 'en').slice(0, 2);
    if(LANGS.some(l => l.id === nav)) S.lang = nav;
  }
  applyBodyClass(); applyAnimLevel(); applyLang();

  // global event listeners
  window.addEventListener('resize', () => {
    if(document.getElementById('app').style.display !== 'none') sizeRing();
  });

  // single merged visibilitychange listener (handles both wake lock re-acquire and timer sync)
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden && running){
      // re-acquire wake lock (browsers release it when tab hides)
      acquireWakeLock();
      // recalculate from wall-clock in case browser throttled the interval
      timeLeft = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000));
      if(iv){ clearInterval(iv); iv = null; }
      iv = setInterval(tick, 250);
      drawRing(); updateTimeText();
      if(timeLeft <= 0) phaseComplete();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if(running){ e.preventDefault(); e.returnValue = T('leave_warn'); return T('leave_warn'); }
  });

  // routing — after onboarding, the first screen the user sees is Vandaag (timer).
  // If a day was restored, drop straight onto it; otherwise prime a ready focus block.
  if(!onboarded){ startOnboard(); }
  else if(_restoredDay && blocks.length){ goApp(); banner(Tf('sess_of', {a:Math.min(curBlock+1, blocks.length), b:blocks.length})); }
  else { goToday(); }
}

/* ══════════════════════════════════════════════════════
   FRIEND INVITE
   ══════════════════════════════════════════════════════ */
const INVITE_KEY = 'fb_invite_shown';
const APP_URL = typeof window !== 'undefined' ? window.location.href.split('?')[0].split('#')[0] : 'https://focusblock.app';

function checkInvitePopup(){
  if(lifetimeBlocks >= 3 && !localStorage.getItem(INVITE_KEY)){
    localStorage.setItem(INVITE_KEY, '1');
    setTimeout(() => showInvite(), 1400);
  }
}

function showInvite(){
  const ov = document.getElementById('inviteOv');
  if(!ov) return;
  document.getElementById('inviteTitle').textContent = T('invite_title');
  document.getElementById('inviteSub').textContent = Tf('invite_sub', {n: lifetimeBlocks});
  document.getElementById('inviteUrl').textContent = APP_URL;
  document.getElementById('inviteCopyBtn').textContent = T('invite_copy');
  document.getElementById('inviteShareBtn').textContent = T('invite_share');
  document.getElementById('inviteDismissBtn').textContent = T('invite_dismiss');
  ov.classList.add('open');
}

function copyInviteLink(){
  navigator.clipboard.writeText(APP_URL).then(() => {
    const btn = document.getElementById('inviteCopyBtn');
    btn.textContent = T('invite_copied');
    setTimeout(() => { btn.textContent = T('invite_copy'); }, 2000);
  }).catch(() => {
    banner(T('invite_copy') + ': ' + APP_URL);
  });
}

function shareInvite(){
  if(navigator.share){
    navigator.share({ title:'FocusBlock', text: T('invite_sub').replace('{n}', lifetimeBlocks), url: APP_URL }).catch(() => {});
  } else {
    copyInviteLink();
  }
}

function closeInvite(){
  const ov = document.getElementById('inviteOv');
  if(ov) ov.classList.remove('open');
}

/* ══════════════════════════════════════════════════════
   AGENDA
   ══════════════════════════════════════════════════════ */

function goAgenda(){
  if(!agendaViewDate) agendaViewDate = new Date();
  renderAgenda();
  showScreen('agenda');
}

function backFromAgenda(){
  if(blocks.length){ showScreen('app'); renderApp(); }
  else { showScreen('home'); renderHome(); }
}

/* ══════════════════════════════════════════════════════
   AGENDA — week + month planner (screenshot-style)
   ══════════════════════════════════════════════════════ */
let _agendaView = 'week'; // 'week' | 'month'

function agendaSetView(v){ _agendaView = v; renderAgenda(); }
function agendaGoToday(){ agendaViewDate = new Date(); renderAgenda(); }
function agendaNav(dir){
  if(!agendaViewDate) agendaViewDate = new Date();
  const isMobile = window.innerWidth <= 760;
  if(_agendaView === 'week') {
    // Op mobiel verschuiven we per dag, op desktop per week.
    agendaViewDate.setDate(agendaViewDate.getDate() + dir*(isMobile ? 1 : 7));
  } else {
    agendaViewDate.setMonth(agendaViewDate.getMonth() + dir);
  }
  renderAgenda();
}
function agendaShiftDay(dir){
  if(!agendaViewDate) agendaViewDate = new Date();
  agendaViewDate.setDate(agendaViewDate.getDate() + dir);
  renderAgenda();
}
function agendaFocusDay(dateStr){
  // Schakelt enkel de focus-dag op de mobiele dag-view zonder een modal te openen.
  agendaViewDate = new Date(dateStr + 'T12:00:00');
  renderAgenda();
}
window.agendaFocusDay = agendaFocusDay;
window.agendaShiftDay = agendaShiftDay;
function agendaNavMonth(dir){
  if(!agendaViewDate) agendaViewDate = new Date();
  agendaViewDate.setMonth(agendaViewDate.getMonth() + dir);
  renderAgenda();
}
function agendaOpenDay(dateStr){
  agendaViewDate = new Date(dateStr + 'T12:00:00');
  renderAgenda();
  openAgendaDayOptions(dateStr);
}

function openAgendaDayOptions(dateStr) {
  let modal = document.getElementById('agendaDayOptionsOv');
  if(!modal){
    modal = document.createElement('div');
    modal.className = 'modal-ov';
    modal.id = 'agendaDayOptionsOv';
    document.body.appendChild(modal);
  }

  const d = new Date(dateStr + 'T12:00:00');
  const lang = S.lang === 'en' ? 'en-US' : S.lang;
  const dateFmt = d.toLocaleDateString(lang, {weekday:'long', day:'numeric', month:'long'});

  const planExists = !!dayPlans[dateStr] || (dateStr === todayStr() && blocks.length > 0);

  // Header-info: weekdag + dag-badge + samenvatting van wat er gepland staat.
  const weekday  = d.toLocaleDateString(lang, {weekday:'long'});
  const dayNum   = d.getDate();
  const monShort = d.toLocaleDateString(lang, {month:'short'}).replace('.','');
  const planMins = _agDayItems(dateStr)
    .filter(it => it.kind === 'focus' || it.kind === 'pause')
    .reduce((s,it) => s + (it.endMin - it.startMin), 0);
  const subLine  = planExists ? fmtDur(planMins) : T('agdo_empty');

  const _ic = {
    edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    plan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/></svg>',
    trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    exam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 2.7 2.5 6 2.5s6-1 6-2.5v-5"/></svg>'
  };
  const _chev = '<svg class="agdo-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  const _row = (variant, icon, label, desc, onclick) =>
    `<button class="agdo-action ${variant}" onclick="${onclick}">
       <span class="agdo-ic">${icon}</span>
       <span class="agdo-actxt"><span class="agdo-aclbl">${esc(label)}</span><span class="agdo-acdesc">${esc(desc)}</span></span>
       ${_chev}
     </button>`;

  const actions = planExists
    ? _row('agdo-primary', _ic.edit, T('agenda_edit_this') || T('agenda_edit_day'), T('agdo_edit_desc'), `closeAgendaDayOptions(); editDayPlan('${dateStr}')`)
      + _row('', _ic.exam, T('agenda_add_exam_here'), T('agdo_exam_desc'), `closeAgendaDayOptions(); openExamModal(null, '${dateStr}')`)
      + `<div class="agdo-sep"></div>`
      + _row('agdo-danger', _ic.trash, T('agenda_remove_plan'), T('agdo_remove_desc'), `closeAgendaDayOptions(); _confirmDeletePlan('${dateStr}')`)
    : _row('agdo-primary', _ic.plan, T('agenda_plan_this') || T('agenda_plan_day'), T('agdo_plan_desc'), `closeAgendaDayOptions(); planFromAgenda('${dateStr}')`)
      + _row('', _ic.exam, T('agenda_add_exam_here'), T('agdo_exam_desc'), `closeAgendaDayOptions(); openExamModal(null, '${dateStr}')`);

  modal.innerHTML = `
    <div class="modal agdo-modal" role="dialog" aria-label="${esc(dateFmt)}">
      <div class="agdo-head">
        <div class="agdo-daybadge"><span class="agdo-daybadge-num">${dayNum}</span><span class="agdo-daybadge-mon">${esc(monShort)}</span></div>
        <div class="agdo-headtxt">
          <div class="agdo-title">${esc(weekday)}</div>
          <div class="agdo-sub">${esc(subLine)}</div>
        </div>
        <button class="agdo-x" onclick="closeAgendaDayOptions()" aria-label="✕">✕</button>
      </div>
      <div class="agdo-actions">${actions}</div>
    </div>
  `;
  modal.classList.add('open');
}

function closeAgendaDayOptions(){
  const modal = document.getElementById('agendaDayOptionsOv');
  if(modal) modal.classList.remove('open');
}

function _confirmDeletePlan(dateStr) {
  const msg = S.lang === 'nl' 
    ? 'Weet je zeker dat je het studieplan voor deze dag wilt verwijderen?' 
    : (S.lang === 'fr' 
      ? 'Êtes-vous sûr de vouloir supprimer le plan d’étude pour ce jour?' 
      : (S.lang === 'es' 
        ? '¿Estás seguro de que quieres eliminar el plan de estudio para este día?' 
        : (S.lang === 'ro' 
          ? 'Sigur dorești să ștergi planul de studiu pentru această zi?' 
          : 'Are you sure you want to delete the study plan for this day?')));
  const yes = S.lang === 'nl' ? 'Verwijderen' : (S.lang === 'fr' ? 'Supprimer' : (S.lang === 'es' ? 'Eliminar' : (S.lang === 'ro' ? 'Șterge' : 'Delete')));
  const no = S.lang === 'nl' ? 'Annuleren' : (S.lang === 'fr' ? 'Annuler' : (S.lang === 'es' ? 'Cancelar' : (S.lang === 'ro' ? 'Anulează' : 'Cancel')));
  showConfirm('🗑️', T('agenda_remove_plan'), msg, no, yes, () => {
    if(dateStr === todayStr() || dateStr === studyDayStr()){
      blocks = [];
      curBlock = 0;
      curPhase = 'focus';
      timeLeft = 0;
      totalTime = 0;
      running = false;
      if(iv){ clearInterval(iv); iv = null; }
    }
    deleteDayPlan(dateStr);
  });
}

function _agIsoDate(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function _agWeekStart(date){ const d = new Date(date); const off = (d.getDay()+6)%7; d.setDate(d.getDate()-off); d.setHours(0,0,0,0); return d; }
function _agWeekNumber(date){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dn = (d.getUTCDay()+6)%7; d.setUTCDate(d.getUTCDate()-dn+3);
  const ft = new Date(Date.UTC(d.getUTCFullYear(),0,4));
  return 1 + Math.round(((d - ft)/86400000 - 3 + (ft.getUTCDay()+6)%7)/7);
}
function _getDayPlan(dateStr){
  const p = dayPlans[dateStr]; if(!p) return null;
  return Array.isArray(p) ? { startTime:'09:00', blocks:p } : p;
}

function _agDayItems(dateStr){
  const items = [];
  // exams with a time get placed on the grid
  examDates.filter(e => e.date === dateStr).forEach(e => {
    if(e.time && /^\d{1,2}:\d{2}$/.test(e.time)){
      const [h,m] = e.time.split(':').map(Number);
      const start = (h||0)*60 + (m||0);
      items.push({ kind:'exam', startMin:start, endMin:start+120, name:e.subject, color:e.color||'#a78bfa', id:e.id, note:e.note });
    }
  });
  // active blocks today, else saved dayPlan
  let plan = null, startTime = '09:00';
  if(dateStr === todayStr() && blocks.length){ plan = blocks; startTime = plannerStartTime || '09:00'; }
  else { const dp = _getDayPlan(dateStr); if(dp){ plan = dp.blocks; startTime = dp.startTime || '09:00'; } }
  if(plan){
    const [h,m] = startTime.split(':').map(Number);
    let cur = (h||0)*60 + (m||0);
    plan.forEach((b,i) => {
      const mins = b.mins || 25;
      // Als een blok een eigen startMin heeft (van een drag-to-move actie),
      // gebruik die absolute tijd en herstart de chain vanaf daar. Andere
      // blokken voor dit blok blijven dus ongewijzigd staan.
      if(typeof b.startMin === 'number'){
        cur = b.startMin;
      }
      items.push({
        kind: b.isPause ? 'pause' : 'focus',
        startMin: cur, endMin: cur+mins,
        name: b.isPause ? T('dpl_type_pause') : (b.subject || T('phase_focus')),
        color: b.isPause ? '#818cf8' : colorFor(b.subject || T('phase_focus')),
        blockIdx: i, isToday: (dateStr === todayStr() && blocks.length > 0)
      });
      cur += mins;
    });
  }
  return items;
}

/* ---- Apply a new duration to a block in today's blocks or a saved dayPlan ---- */
function _agCommitBlockMins(dateStr, idx, mins){
  mins = Math.max(5, Math.min(180, mins));
  if(dateStr === todayStr() && blocks.length){
    if(blocks[idx]){
      blocks[idx].mins = mins;
      if(!running && curBlock === idx && curPhase === 'focus' && !blocks[idx].isPause){ totalTime = mins*60; timeLeft = mins*60; }
      saveData();
      // Sync any other currently-visible screen
      if(!document.getElementById('overview').classList.contains('out')) renderOverview();
    }
  } else {
    const dp = _getDayPlan(dateStr);
    if(dp && dp.blocks[idx]){
      dp.blocks[idx].mins = mins;
      dayPlans[dateStr] = dp;
      saveData();
    }
  }
}

/* ---- Wire pointer (mouse + touch) drag handlers on agenda blocks ---- */
function _agWireDrag(){
  // Gebruik dezelfde HOUR_PX / HOURS als renderAgenda zodat de schaal klopt.
  const HOUR_PX = window._agHourPx   || 64;
  const HOURS   = window._agHourSpan || 17;
  const pxPerMin = HOUR_PX / 60;
  // Drempel voor "echte drag" zodat een tap niet per ongeluk een verschuiving wordt.
  const DRAG_THRESHOLD = 6;
  let _justDragged = false;

  document.querySelectorAll('.ag-block').forEach(el => {
    const isExam = el.classList.contains('ag-block-exam');
    const date = el.dataset.date;
    const bidx = el.dataset.bidx;

    if(!isExam && bidx != null){
      el.addEventListener('pointerdown', (e) => {
        if(e.button && e.button !== 0) return;
        const rect = el.getBoundingClientRect();
        const yIn  = e.clientY - rect.top;
        // 3 zones: bovenste 18px = resize-top, onderste 18px = resize-bottom, midden = move.
        const RZ = 18;
        let mode;
        if(yIn < RZ)                       mode = 'resize-top';
        else if(yIn > rect.height - RZ)    mode = 'resize-bottom';
        else                                mode = 'move';
        e.preventDefault(); e.stopPropagation();
        try { el.setPointerCapture(e.pointerId); } catch {}

        const startY = e.clientY;
        const startHeight = el.clientHeight;
        const startTop    = parseFloat(el.style.top) || 0;
        const timeEl = el.querySelector('.agb-time');
        let movedFar = false;
        el.classList.add('ag-block-dragging', 'ag-block-' + mode);

        const snapPx = HOUR_PX / 12; // 5-min raster

        const onMove = (ev) => {
          const dy = ev.clientY - startY;
          if(Math.abs(dy) > DRAG_THRESHOLD) movedFar = true;
          if(mode === 'resize-bottom'){
            const newH = Math.max(22, startHeight + dy);
            el.style.height = newH + 'px';
            const mins = Math.max(5, Math.round((newH / pxPerMin) / 5) * 5);
            if(timeEl) timeEl.textContent = mins + ' min';
          } else if(mode === 'resize-top'){
            // Top resize: top schuift, height verandert tegenovergesteld.
            const snappedDy = Math.round(dy / snapPx) * snapPx;
            const newTop = Math.max(0, startTop + snappedDy);
            const newH   = Math.max(22, startHeight - snappedDy);
            el.style.top = newTop + 'px';
            el.style.height = newH + 'px';
            const mins = Math.max(5, Math.round((newH / pxPerMin) / 5) * 5);
            if(timeEl) timeEl.textContent = mins + ' min';
          } else {
            // Move: schuif top, gesnapt aan 5-min raster.
            const newTop = Math.max(0, Math.min(HOURS*HOUR_PX - startHeight, startTop + Math.round(dy/snapPx)*snapPx));
            el.style.top = newTop + 'px';
          }
        };
        const onUp = (ev) => {
          el.releasePointerCapture?.(ev.pointerId);
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          el.removeEventListener('pointercancel', onUp);
          el.classList.remove('ag-block-dragging', 'ag-block-resize-top', 'ag-block-resize-bottom', 'ag-block-move');
          if(movedFar){
            _justDragged = true;
            setTimeout(() => _justDragged = false, 150);
          }
          if(!movedFar){
            el.style.top = startTop + 'px';
            el.style.height = startHeight + 'px';
            return;
          }
          if(mode === 'resize-bottom'){
            const newH = Math.max(22, parseFloat(el.style.height) || startHeight);
            const mins = Math.max(5, Math.round((newH / pxPerMin) / 5) * 5);
            _agCommitBlockMins(date, +bidx, mins);
          } else if(mode === 'resize-top'){
            const newTop = parseFloat(el.style.top) || 0;
            const newH   = parseFloat(el.style.height) || startHeight;
            const mins = Math.max(5, Math.round((newH / pxPerMin) / 5) * 5);
            const minutesFromStart = Math.round((newTop / HOUR_PX) * 60 / 5) * 5;
            const newStartTotalMin = (window._agHourStartMin || 360) + minutesFromStart;
            _agCommitBlockMins(date, +bidx, mins);
            _agCommitBlockStart(date, +bidx, newStartTotalMin);
          } else {
            const newTop = parseFloat(el.style.top) || 0;
            const minutesFromStart = Math.round((newTop / HOUR_PX) * 60 / 5) * 5;
            const newStartTotalMin = (window._agHourStartMin || 360) + minutesFromStart;
            _agCommitBlockStart(date, +bidx, newStartTotalMin);
          }
          renderAgenda();
          if(typeof banner === 'function') banner('✓');
        };
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onUp);
      });
    }

    // Click → open editor (today → goToday, dayPlan → editDayPlan, exam → open exam modal)
    el.addEventListener('click', (e) => {
      // ignore if a drag just happened (height/top was changed)
      if(_justDragged || el.classList.contains('ag-block-dragging')) return;
      e.stopPropagation();
      if(isExam){
        const examId = el.dataset.examId;
        if(examId) openExamModal(examId);
        return;
      }
      if(date === todayStr()){
        goToday();
        if(bidx != null) curBlock = +bidx;
      } else {
        editDayPlan(date);
      }
    });
  });
}

// Verzet ALLEEN het opgegeven blok naar newStartTotalMin. Andere blokken
// blijven exact staan waar ze stonden — we 'pin'nen hun huidige positie
// door op elk een expliciete startMin te zetten.
function _agCommitBlockStart(dateStr, idx, newStartTotalMin){
  newStartTotalMin = Math.max(0, Math.min(24*60-5, Math.round(newStartTotalMin)));
  const isToday = dateStr === todayStr() && blocks.length;
  const plan = isToday ? blocks : (_getDayPlan(dateStr)?.blocks);
  if(!plan || !plan[idx]) return;

  // Eerst: bereken de huidige effectieve positie van elk blok (zoals ze nu
  // in _agDayItems berekend zou worden) zodat we ze kunnen 'pin'nen.
  const startTime = isToday ? (plannerStartTime || '09:00') : (_getDayPlan(dateStr)?.startTime || '09:00');
  const [sh, sm] = startTime.split(':').map(Number);
  let cur = (sh||0)*60 + (sm||0);
  plan.forEach((b, i) => {
    if(typeof b.startMin === 'number') cur = b.startMin;
    if(i !== idx && typeof b.startMin !== 'number') b.startMin = cur;
    cur += (b.mins || 25);
  });

  // Nu het gesleepte blok op de nieuwe positie zetten.
  plan[idx].startMin = newStartTotalMin;

  if(!isToday){
    const dp = _getDayPlan(dateStr) || { blocks: plan, startTime: '09:00' };
    dayPlans[dateStr] = dp;
  }
  saveData();
}

function _agWeekSummary(weekStartDate){
  let plannedMins = 0, focusCount = 0, pauseCount = 0, examCount = 0;
  for(let i = 0; i < 7; i++){
    const d = new Date(weekStartDate); d.setDate(d.getDate()+i); const ds = _agIsoDate(d);
    examCount += examDates.filter(e => e.date === ds).length;
    let plan = null;
    if(ds === todayStr() && blocks.length) plan = blocks;
    else { const dp = _getDayPlan(ds); if(dp) plan = dp.blocks; }
    if(plan) plan.forEach(b => { if(b.isPause) pauseCount++; else { focusCount++; plannedMins += (b.mins||0); } });
  }
  return { plannedMins, focusCount, pauseCount, examCount };
}

function _agUpcomingExams(){
  const today = todayStr();
  return examDates.filter(e => e.date >= today).sort((a,b) => a.date.localeCompare(b.date)).slice(0,5);
}

function renderAgenda(){
  if(!agendaViewDate) agendaViewDate = new Date();
  const wrap = document.getElementById('agendaWrap');
  if(!wrap) return;

  const today = todayStr();
  const view = _agendaView;
  const focusDate = new Date(agendaViewDate);
  const weekStart = _agWeekStart(focusDate);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6);
  const weekN = _agWeekNumber(focusDate);
  const lang = S.lang === 'en' ? 'en-US' : S.lang;

  const monthLbl = (() => { const s = focusDate.toLocaleDateString(lang, {month:'long', year:'numeric'}); return s.charAt(0).toUpperCase()+s.slice(1); })();
  const fmtRange = () => {
    const a = weekStart.getDate(), b = weekEnd.getDate();
    const mB = weekEnd.toLocaleDateString(lang, {month:'short'}).replace('.','');
    const mA = weekStart.toLocaleDateString(lang, {month:'short'}).replace('.','');
    return (weekStart.getMonth() === weekEnd.getMonth()) ? `${a} – ${b} ${mB}` : `${a} ${mA} – ${b} ${mB}`;
  };

  const dayNamesByLang = {
    en:['MO','TU','WE','TH','FR','SA','SU'], nl:['MA','DI','WO','DO','VR','ZA','ZO'],
    fr:['LU','MA','ME','JE','VE','SA','DI'], es:['LU','MA','MI','JU','VI','SÁ','DO'],
    ro:['LU','MA','MI','JO','VI','SÂ','DU']
  };
  const dn = dayNamesByLang[S.lang] || dayNamesByLang.en;

  // ── Sidebar ──
  const y = focusDate.getFullYear(), mo = focusDate.getMonth();
  const first = new Date(y,mo,1), last = new Date(y,mo+1,0);
  let mini = dn.map(n => `<div class="agm-hdr">${n.slice(0,2)}</div>`).join('');
  const off = (first.getDay()+6)%7;
  for(let i=0;i<off;i++) mini += `<div class="agm-day agm-blank"></div>`;
  for(let d=1; d<=last.getDate(); d++){
    const ds = y+'-'+String(mo+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const cellDate = new Date(y,mo,d);
    const isToday = ds === today;
    const inWeek = cellDate >= weekStart && cellDate <= weekEnd;
    const isPast = ds < today;
    const cls = 'agm-day' + (isToday?' is-today':'') + (inWeek?' in-week':'') + (isPast?' is-past':' is-future');
    const hasExam = examDates.some(e => e.date === ds);
    const hasPlan = !!dayPlans[ds] || (isToday && blocks.length > 0);
    let marks = '';
    if(hasPlan && hasExam) marks = `<span class="agm-marks"><span class="agm-dot plan"></span><span class="agm-dot exam"></span></span>`;
    else if(hasPlan) marks = `<span class="agm-marks"><span class="agm-dot plan"></span></span>`;
    else if(hasExam) marks = `<span class="agm-marks"><span class="agm-dot exam"></span></span>`;
    mini += `<button class="${cls}${hasPlan?' has-plan':''}${hasExam?' has-exam':''}" onclick="agendaOpenDay('${ds}')" title="${ds}">${d}${marks}</button>`;
  }

  const upcoming = _agUpcomingExams();
  const upcomingHtml = upcoming.length ? upcoming.map(e => {
    const d = new Date(e.date+'T12:00:00'), tn = new Date(today+'T12:00:00');
    const diff = Math.round((d - tn)/86400000);
    const dayLbl = diff === 0 ? T('agenda_today') : diff === 1 ? T('agenda_tomorrow') : Tf('agenda_days_left', {n:diff});
    const dayNum = d.getDate();
    const monShort = d.toLocaleDateString(lang,{month:'short'}).replace('.','');
    return `<button class="ag-up-row" onclick="agendaOpenDay('${e.date}')">
      <span class="ag-up-date"><span class="ag-up-num">${dayNum}</span><span class="ag-up-mon">${esc(monShort)}</span></span>
      <span class="ag-up-subj">${esc(e.subject)}</span>
      <span class="ag-up-rel">${esc(dayLbl)}</span>
    </button>`;
  }).join('') : `<div class="ag-up-empty">${esc(T('agenda_no_exams'))}</div>`;

  const sidebarHtml = `
    <aside class="ag-sidebar">
      <div class="ag-mini-card">
        <div class="ag-mini-head">
          <button class="ag-mini-nav" onclick="agendaNavMonth(-1)" aria-label="prev">‹</button>
          <div class="ag-mini-lbl">${esc(monthLbl)}</div>
          <button class="ag-mini-nav" onclick="agendaNavMonth(1)" aria-label="next">›</button>
        </div>
        <div class="ag-mini-grid">${mini}</div>
        <div class="ag-mini-legend">
          <span class="agl"><span class="agl-dot today"></span>${esc(T('ag_legend_today'))}</span>
          <span class="agl"><span class="agl-dot plan"></span>${esc(T('ag_legend_planned'))}</span>
          <span class="agl"><span class="agl-dot exam"></span>${esc(T('ag_legend_exam'))}</span>
        </div>
      </div>
      <button class="ag-plan-day-btn" onclick="planFromAgenda('${_agIsoDate(focusDate)}')">${esc(T('ag_plan_btn_full'))}</button>
      <button class="ag-add-exam-btn" onclick="openExamModal()">${esc(T('agenda_add_exam'))}</button>
      <div class="ag-upcoming">
        <div class="ag-up-title">${esc(T('agenda_upcoming'))}</div>
        ${upcomingHtml}
      </div>
    </aside>`;

  // ── Main view ──
  let mainHtml = '';
  if(view === 'week'){
    const isMobile = (typeof window !== 'undefined' && window.innerWidth <= 760);
    // Op mobiel grotere uren-cellen + alleen 1 dag per scherm zodat blokken
    // de volle breedte krijgen en pauzes makkelijk tapbaar zijn.
    const HOUR_PX = isMobile ? 84 : 64;

    const days = [];
    for(let i = 0; i < 7; i++){ const d = new Date(weekStart); d.setDate(d.getDate()+i); days.push({d, ds:_agIsoDate(d), isToday: _agIsoDate(d) === today}); }

    // Tijdas: standaard 6:00–24:00, maar uitgebreid zodat élk gepland blok of
    // examen bereikbaar is (ook laat op de avond, bv. 23:00). De tijdlijn zit
    // in een eigen scroll-container (zie CSS), dus een ruimere as maakt de
    // pagina zelf niet langer — je scrolt gewoon binnen het rooster.
    const _rangeDays = isMobile ? days.filter(d => d.ds === _agIsoDate(focusDate)) : days;
    let _earliest = 6 * 60, _latest = 24 * 60;
    _rangeDays.forEach(dy => _agDayItems(dy.ds).forEach(it => {
      if(it.startMin < _earliest) _earliest = it.startMin;
      if(it.endMin   > _latest)   _latest   = it.endMin;
    }));
    const HOUR_START = Math.max(0, Math.min(6, Math.floor(_earliest / 60)));
    const HOUR_END   = Math.min(28, Math.max(24, Math.ceil(_latest / 60)));
    const HOURS = HOUR_END - HOUR_START;
    window._agHourPx     = HOUR_PX;
    window._agHourSpan   = HOURS;
    window._agHourStartMin = HOUR_START * 60;
    const startMinTotal = HOUR_START * 60;
    const totalMin = HOURS * 60;

    let hoursHtml = '';
    for(let h = HOUR_START; h <= HOUR_END; h++){ const hl = h % 24; hoursHtml += `<div class="ag-hour-lbl">${String(hl).padStart(2,'0')}:00</div>`; }

    const dayHdrs = days.map((dy,i) => `<div class="ag-day-hdr ${dy.isToday?'is-today':''}"><div class="ag-day-lbl">${dn[i]}</div><div class="ag-day-num">${dy.d.getDate()}</div></div>`).join('');

    const dayCols = days.map(dy => {
      const items = _agDayItems(dy.ds);
      const blocksHtml = items.map(it => {
        const top = Math.max(0, ((it.startMin - startMinTotal)/totalMin) * (HOURS * HOUR_PX));
        const heightPx = Math.max(22, ((it.endMin - it.startMin)/totalMin) * (HOURS * HOUR_PX) - 3);
        const isPause = it.kind === 'pause';
        const isExam  = it.kind === 'exam';
        const startStr = `${String(Math.floor(it.startMin/60)%24).padStart(2,'0')}:${String(it.startMin%60).padStart(2,'0')}`;
        const endStr   = `${String(Math.floor(it.endMin/60)%24).padStart(2,'0')}:${String(it.endMin%60).padStart(2,'0')}`;
        const bg = isPause ? 'rgba(129,140,248,0.18)' : (isExam ? `color-mix(in srgb, ${it.color} 30%, var(--bg2))` : `color-mix(in srgb, ${it.color} 32%, var(--bg2))`);
        const bd = isPause ? '#818cf8' : it.color;
        const idAttr = isExam ? `data-exam-id="${esc(it.id||'')}"` : (it.blockIdx != null ? `data-bidx="${it.blockIdx}"` : '');
        return `<div class="ag-block ag-block-${it.kind}" data-date="${dy.ds}" ${idAttr} style="top:${top}px;height:${heightPx}px;background:${bg};border-left-color:${bd}">
          ${!isExam ? `<div class="ag-block-resize-top"></div>` : ''}
          <div class="agb-name">${esc(it.name)}</div>
          ${isExam ? `<div class="agb-tag">${esc(T('agenda_exam_lbl').toUpperCase())}</div><div class="agb-time">${startStr} – ${endStr}</div>` : `<div class="agb-time">${it.endMin - it.startMin} min</div>`}
          ${!isExam ? `<div class="ag-block-resize" title="${esc(T('agenda_resize_hint'))}"></div>` : ''}
        </div>`;
      }).join('');
      let lines = '';
      for(let h = 1; h < HOURS; h++) lines += `<div class="ag-hr-line" style="top:${h*HOUR_PX}px"></div>`;
      return `<div class="ag-day-col ${dy.isToday?'is-today':''}" data-date="${dy.ds}" style="height:${HOURS*HOUR_PX}px" onclick="agendaOpenDay('${dy.ds}')">${lines}${blocksHtml}</div>`;
    }).join('');

    if (isMobile) {
      // ─── Mobile single-day view ────────────────────────
      // Toon één dag op vol scherm met een swipeable day-tab-row erboven.
      // Geen horizontaal scrollen, blokken nemen de volle breedte.
      const focusDs = _agIsoDate(focusDate);
      const focusDay = days.find(d => d.ds === focusDs) || days[0];
      const dayTabs = days.map((dy, i) => {
        const isFocus = dy.ds === focusDay.ds;
        const isExam = examDates.some(e => e.date === dy.ds);
        const hasPlan = !!dayPlans[dy.ds] || (dy.isToday && blocks.length > 0);
        const dnLbl = dn[i];
        return `<button class="ag-mob-daytab${isFocus?' is-focus':''}${dy.isToday?' is-today':''}" data-ds="${dy.ds}" onclick="agendaFocusDay('${dy.ds}')">
          <span class="agm-tab-lbl">${dnLbl}</span>
          <span class="agm-tab-num">${dy.d.getDate()}</span>
          ${hasPlan || isExam ? `<span class="agm-tab-marks">${hasPlan?'<span class="agm-tab-dot plan"></span>':''}${isExam?'<span class="agm-tab-dot exam"></span>':''}</span>` : ''}
        </button>`;
      }).join('');
      const items = _agDayItems(focusDay.ds);
      const blocksHtml = items.map(it => {
        const top = Math.max(0, ((it.startMin - startMinTotal)/totalMin) * (HOURS * HOUR_PX));
        const heightPx = Math.max(38, ((it.endMin - it.startMin)/totalMin) * (HOURS * HOUR_PX) - 4);
        const isPause = it.kind === 'pause';
        const isExam  = it.kind === 'exam';
        const startStr = `${String(Math.floor(it.startMin/60)%24).padStart(2,'0')}:${String(it.startMin%60).padStart(2,'0')}`;
        const endStr   = `${String(Math.floor(it.endMin/60)%24).padStart(2,'0')}:${String(it.endMin%60).padStart(2,'0')}`;
        const bg = isPause ? 'rgba(129,140,248,0.18)' : (isExam ? `color-mix(in srgb, ${it.color} 30%, var(--bg2))` : `color-mix(in srgb, ${it.color} 32%, var(--bg2))`);
        const bd = isPause ? '#818cf8' : it.color;
        const idAttr = isExam ? `data-exam-id="${esc(it.id||'')}"` : (it.blockIdx != null ? `data-bidx="${it.blockIdx}"` : '');
        return `<div class="ag-block ag-block-${it.kind}" data-date="${focusDay.ds}" ${idAttr} style="top:${top}px;height:${heightPx}px;background:${bg};border-left-color:${bd}">
          ${!isExam ? `<div class="ag-block-resize-top"></div>` : ''}
          <div class="agb-name">${esc(it.name)}</div>
          ${isExam ? `<div class="agb-tag">${esc(T('agenda_exam_lbl').toUpperCase())}</div><div class="agb-time">${startStr} – ${endStr}</div>` : `<div class="agb-time">${startStr} · ${it.endMin - it.startMin} min</div>`}
          ${!isExam ? `<div class="ag-block-resize" title="${esc(T('agenda_resize_hint'))}"></div>` : ''}
        </div>`;
      }).join('');
      let lines = '';
      for(let h = 1; h < HOURS; h++) lines += `<div class="ag-hr-line" style="top:${h*HOUR_PX}px"></div>`;
      const dayFullLbl = focusDay.d.toLocaleDateString(lang, {weekday:'long', day:'numeric', month:'long'});
      mainHtml = `
        <div class="ag-mob">
          <div class="ag-mob-daytabs">${dayTabs}</div>
          <div class="ag-mob-dayhdr">
            <button class="ag-mob-prev" onclick="agendaShiftDay(-1)" aria-label="prev">‹</button>
            <span class="ag-mob-dayttl">${esc(dayFullLbl.charAt(0).toUpperCase() + dayFullLbl.slice(1))}</span>
            <button class="ag-mob-next" onclick="agendaShiftDay(1)" aria-label="next">›</button>
          </div>
          <div class="ag-mob-body" style="height:${HOURS*HOUR_PX}px">
            <div class="ag-time-gutter" style="height:${HOURS*HOUR_PX}px">${hoursHtml}</div>
            <div class="ag-day-col is-today-${focusDay.isToday}" data-date="${focusDay.ds}" style="height:${HOURS*HOUR_PX}px">${lines}${blocksHtml}</div>
          </div>
          <button class="ag-plan-day-btn" style="width:100%;margin-top:12px;" onclick="${focusDay.ds === today ? `goToday()` : `editDayPlan('${focusDay.ds}')`}">
            ＋ ${esc(T('agenda_plan_day') || 'Plan deze dag')}
          </button>
        </div>`;
    } else {
      mainHtml = `
        <div class="ag-week">
          <div class="ag-week-head">
            <div class="ag-hgut"></div>
            ${dayHdrs}
          </div>
          <div class="ag-week-body" style="height:${HOURS*HOUR_PX}px">
            <div class="ag-time-gutter" style="height:${HOURS*HOUR_PX}px">${hoursHtml}</div>
            ${dayCols}
          </div>
        </div>`;
    }
  } else {
    let cells = dn.map(n => `<div class="agmo-hdr">${n.slice(0,2)}</div>`).join('');
    const offset = (first.getDay()+6)%7;
    for(let i = 0; i < offset; i++) cells += `<div class="agmo-day agmo-blank"></div>`;
    for(let d = 1; d <= last.getDate(); d++){
      const ds = y+'-'+String(mo+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
      const isToday = ds === today;
      const items = _agDayItems(ds);
      const dots = items.slice(0,5).map(it => `<span class="agmo-dot" style="background:${it.color}"></span>`).join('');
      cells += `<button class="agmo-day${isToday?' is-today':''}" onclick="agendaOpenDay('${ds}')"><span class="agmo-num">${d}</span>${dots?`<div class="agmo-dots">${dots}</div>`:''}</button>`;
    }
    mainHtml = `<div class="ag-month">${cells}</div>`;
  }

  // Summary
  const summary = _agWeekSummary(weekStart);
  const summaryHtml = `
    <div class="ag-summary">
      <div class="ag-sum-title">${esc(T('prog_week'))}</div>
      <div class="ag-sum-grid">
        <div class="ag-sum-cell"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><div class="ag-sum-lbl">${esc(T('agenda_sum_planned'))}</div><div class="ag-sum-val">${fmtDur(summary.plannedMins)}</div></div>
        <div class="ag-sum-cell"><svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg><div class="ag-sum-lbl">${esc(T('agenda_sum_focus'))}</div><div class="ag-sum-val">${summary.focusCount}</div></div>
        <div class="ag-sum-cell"><svg viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2"><path d="M4 7h12v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V7zM16 9h2a2 2 0 1 1 0 4h-2"/><path d="M4 19h14"/></svg><div class="ag-sum-lbl">${esc(T('agenda_sum_pause'))}</div><div class="ag-sum-val">${summary.pauseCount}</div></div>
        <div class="ag-sum-cell"><svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2"><path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M5 11v5l7 4 7-4v-5"/></svg><div class="ag-sum-lbl">${esc(T('agenda_sum_exams'))}</div><div class="ag-sum-val">${summary.examCount}</div></div>
      </div>
    </div>`;

  wrap.innerHTML = `
    <div class="ag-head">
      <div class="ag-head-left">
        <h1 class="ag-title">${esc(T('agenda_title'))}</h1>
        <div class="ag-sub">${esc(T('agenda_subtitle'))}</div>
      </div>
      <div class="ag-head-right">
        <div class="ag-view-toggle">
          <button class="${view==='month'?'on':''}" onclick="agendaSetView('month')">${esc(T('agenda_month'))}</button>
          <button class="${view==='week'?'on':''}" onclick="agendaSetView('week')">${esc(T('agenda_week'))}</button>
        </div>
        <div class="ag-nav">
          <span class="ag-nav-lbl">${view==='week' ? `${esc(T('agenda_week_n'))} ${weekN} · ${esc(fmtRange())}` : esc(monthLbl)}</span>
          <button class="ag-nav-btn" onclick="agendaNav(-1)" aria-label="prev">‹</button>
          <button class="ag-nav-btn" onclick="agendaNav(1)" aria-label="next">›</button>
        </div>
        <button class="ag-today-btn" onclick="agendaGoToday()">${esc(T('agenda_today_btn'))}</button>
      </div>
    </div>
    <div class="ag-main">
      ${sidebarHtml}
      <div class="ag-right">
        ${mainHtml}
        ${summaryHtml}
      </div>
    </div>`;

  _agWireDrag();
  _agScrollToTime();
}

// Scroll de tijdlijn naar een zinvol startpunt: het eerste geplande blok (zodat
// je meteen je planning ziet), anders de huidige tijd, anders 8:00. Zo opent de
// agenda niet bovenaan een lege nacht en hoef je niet te zoeken naar je blokken.
function _agScrollToTime(){
  setTimeout(() => {
    const body = document.querySelector('#agenda .ag-week-body, #agenda .ag-mob-body');
    if(!body || body.scrollHeight <= body.clientHeight) return;
    const hourPx   = window._agHourPx || 64;
    const startMin = window._agHourStartMin || 0;
    const spanMin  = (window._agHourSpan || 18) * 60;
    // 1) Eerste blok: scrol er net iets boven zodat het volledig zichtbaar is.
    let firstTop = Infinity;
    body.querySelectorAll('.ag-block').forEach(b => { const t = parseFloat(b.style.top) || 0; if(t < firstTop) firstTop = t; });
    if(firstTop !== Infinity){ body.scrollTop = Math.max(0, firstTop - hourPx * 0.75); return; }
    // 2) Geen blokken: huidige tijd als die binnen de as valt, anders 8:00.
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const targetMin = (nowMin >= startMin && nowMin <= startMin + spanMin) ? nowMin : 8 * 60;
    body.scrollTop = Math.max(0, ((targetMin - startMin) / 60) * hourPx - hourPx * 1.5);
  }, 60);
}

function planFromAgenda(dateStr){
  D.bb = []; plannerStartTime = '09:00'; plannerEndTime = ''; plannerMode = 'full';
  _planningForDate = dateStr;
  renderPlanner(); showScreen('planner');
}
function editDayPlan(dateStr){
  const dp = _getDayPlan(dateStr);
  D.bb = (dp?.blocks || []).map(b => ({...b, done:false, tasks:b.tasks||[]}));
  plannerStartTime = dp?.startTime || '09:00';
  plannerMode = 'full';
  _planningForDate = dateStr;
  renderPlanner(); showScreen('planner');
}
function deleteDayPlan(dateStr){ delete dayPlans[dateStr]; saveData(); renderAgenda(); }

/* ---- Exam modal ---- */
let _editingExamId = null;
function openExamModal(examId, defaultDate){
  _editingExamId = examId || null;
  const ex = examId ? examDates.find(e => e.id === examId) : null;
  document.getElementById('examModalTitle').textContent = T('exam_add_t');
  const body = document.getElementById('examModalBody');

  const subjectChips = subjects.length ? subjects.map(s =>
    `<button class="bd-subj-chip${ex && ex.subject === s.name ? ' active' : ''}" onclick="examPickSubj('${s.name.replace(/'/g,"\\'")}');return false;">${esc(s.name)}</button>`
  ).join('') : '';

  const examColors = ['#f87171','#fb923c','#facc15','#4ade80','#60a5fa','#c084fc'];
  const colorPicker = examColors.map(c =>
    `<button class="exam-color-dot${ex && ex.color === c ? ' active' : ''}" style="background:${c}" onclick="examPickColor('${c}');return false;"></button>`
  ).join('');

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem;padding:0 0 1rem">
      <div>
        <div class="bd-field-lbl">${T('exam_subject')}</div>
        ${subjectChips ? `<div class="bd-subj-chips" style="margin-bottom:8px">${subjectChips}</div>` : ''}
        <input class="bd-subj-input" id="examSubjInput" type="text" placeholder="${T('exam_subject')}" value="${esc(ex ? ex.subject : '')}" oninput="examSubjChange(this.value)">
      </div>
      <div>
        <div class="bd-field-lbl">${T('exam_date')}</div>
        <div class="exam-date-presets" id="examDatePresets">
          ${(() => {
            const base = new Date();
            const chips = [
              {lbl: T('agenda_tomorrow'), days: 1},
              {lbl: '+3', days: 3},
              {lbl: '+1 wk', days: 7},
              {lbl: '+2 wk', days: 14},
            ];
            return chips.map(c => {
              const d = new Date(base); d.setDate(d.getDate() + c.days);
              const ds = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
              return `<button class="exam-date-chip" type="button" onclick="examPickDate('${ds}');return false;">${esc(c.lbl)}</button>`;
            }).join('');
          })()}
        </div>
        <input class="bd-subj-input" id="examDateInput" type="date" min="${todayStr()}" value="${ex ? ex.date : (defaultDate || todayStr())}">
      </div>
      <div>
        <div class="bd-field-lbl">${T('exam_time')}</div>
        <input class="bd-subj-input" id="examTimeInput" type="time" value="${ex ? (ex.time||'') : ''}">
      </div>
      <div>
        <div class="bd-field-lbl">${T('exam_note')}</div>
        <input class="bd-subj-input" id="examNoteInput" type="text" placeholder="${T('exam_note')}" value="${esc(ex ? (ex.note||'') : '')}">
      </div>
      <div>
        <div class="bd-field-lbl">${T('color') || 'Kleur'}</div>
        <div class="exam-color-row" id="examColorRow">${colorPicker}</div>
        <input type="hidden" id="examColorVal" value="${ex ? (ex.color||examColors[0]) : examColors[0]}">
      </div>
      <div style="display:flex;gap:10px">
        ${ex ? `<button class="bd-delete" onclick="deleteExam('${ex.id}');closeExamModal()">${T('exam_delete')}</button>` : ''}
        <button class="bd-save" style="flex:1" onclick="saveExamModal()">${T('exam_save')}</button>
      </div>
    </div>`;
  document.getElementById('examOv').classList.add('open');
}
function closeExamModal(){ document.getElementById('examOv').classList.remove('open'); }
function examPickSubj(name){
  document.getElementById('examSubjInput').value = name;
  document.querySelectorAll('#examModalBody .bd-subj-chip').forEach(c => c.classList.toggle('active', c.textContent === name));
}
function examSubjChange(v){
  document.querySelectorAll('#examModalBody .bd-subj-chip').forEach(c => c.classList.toggle('active', c.textContent === v));
}
function examPickDate(ds){
  const inp = document.getElementById('examDateInput');
  if(inp) inp.value = ds;
  document.querySelectorAll('#examDatePresets .exam-date-chip').forEach(c => c.classList.toggle('active', c.dataset.ds === ds));
}
function examPickColor(c){
  document.getElementById('examColorVal').value = c;
  document.querySelectorAll('.exam-color-dot').forEach(d => d.classList.toggle('active', d.style.background === c || d.style.backgroundColor === c));
}
function saveExamModal(){
  const subj = document.getElementById('examSubjInput').value.trim();
  const date = document.getElementById('examDateInput').value;
  if(!subj || !date){ banner(T('fill_fields') || 'Vul vak en datum in.'); return; }
  // auto-add subject if new
  if(subj && !subjects.some(s => s.name.toLowerCase() === subj.toLowerCase())){
    addSubject(subj);
    banner(Tf('subj_added', {name: subj}));
  }
  const ex = {
    id: _editingExamId || ('ex_' + Date.now()),
    subject: subj,
    date,
    time: document.getElementById('examTimeInput').value || '',
    note: document.getElementById('examNoteInput').value.trim(),
    color: document.getElementById('examColorVal').value || '#f87171'
  };
  if(_editingExamId){
    const idx = examDates.findIndex(e => e.id === _editingExamId);
    if(idx >= 0) examDates[idx] = ex; else examDates.push(ex);
  } else {
    examDates.push(ex);
  }
  examDates.sort((a,b) => a.date.localeCompare(b.date));
  saveData();
  closeExamModal();
  renderAgenda();
  banner(T('exam_save') + ' ✓');
}
function deleteExam(id){
  examDates = examDates.filter(e => e.id !== id);
  saveData();
  renderAgenda();
}

// kick off
init();
