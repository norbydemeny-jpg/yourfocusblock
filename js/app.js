/* ══════════════════════════════════════════════════════
   FocusBlock — app.js
   Main coordinator, screen router, home, focus app,
   blocks list, zen mode, and init.
   ══════════════════════════════════════════════════════ */

/* ---- init flag ---- */
let _restoredDay = false;

/* ====================== SCREEN ROUTER ====================== */
const SCREENS = ['home','flow','planner','agenda','app','progress'];
function showScreen(id){
  SCREENS.forEach(s => {
    const el = document.getElementById(s);
    if(!el) return;
    if(s === id){ el.style.display = 'flex'; requestAnimationFrame(() => el.classList.remove('out')); }
    else { el.classList.add('out'); el.style.display = 'none'; }
  });
  window.scrollTo(0, 0);
}

function goHome(){
  exitZen(); stopTimer();
  document.body.classList.remove('ph-focus','ph-short','ph-long');
  renderHome(); showScreen('home');
}
function goApp(){ applyPhaseClass(); showScreen('app'); renderApp(); }
function goProgress(from){ progReturn = from || 'home'; renderProgress(); showScreen('progress'); }

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
  if(document.getElementById('home').style.display !== 'none') renderHome();
  if(document.getElementById('flow').style.display !== 'none' && flowSteps.length) renderFlowStep();
  if(document.getElementById('planner').style.display !== 'none') renderPlanner();
  if(document.getElementById('agenda').style.display !== 'none') renderAgenda();
  if(document.getElementById('app').style.display !== 'none' && blocks.length) renderApp();
  if(document.getElementById('progress').style.display !== 'none') renderProgress();
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
  cards.forEach(c => {
    const tag = T(c.tag);
    const el = document.createElement('button');
    el.className = 'start-card'; el.type = 'button';
    el.innerHTML = `${tag ? `<span class="sc-tag">${esc(tag)}</span>` : ''}<span class="sc-title">${esc(T(c.t))}</span><span class="sc-desc">${esc(T(c.d))}</span><span class="sc-arrow">→</span>`;
    el.onclick = () => startMode(c.m);
    wrap.appendChild(el);
  });
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
  const avail = Math.min(stage.clientWidth || 360, (window.innerHeight || 700) * 0.46);
  let size = Math.max(200, Math.min(360, avail - 40));
  if(document.body.classList.contains('zen')) size = Math.max(240, Math.min(420, Math.min(stage.clientWidth - 40, window.innerHeight * 0.55)));
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
          <div class="bi-num">⏸</div>
          <div class="bi-body">
            <div class="bi-name">${esc(T('phase_long'))}</div>
            <div class="bi-meta">${b.mins} min</div>
          </div>
          ${blocks.length > 1 ? `<button class="bi-del-quick" title="${esc(T('del_lbl'))}" aria-label="${esc(T('del_lbl'))}">✕</button>` : ''}
        </div>`;
      if(blocks.length > 1) item.querySelector('.bi-del-quick').onclick = (e) => { e.stopPropagation(); deleteBlock(i); };
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
          <div style="display:flex;gap:8px;"><button class="ctrl-btn bi-save" style="flex:1;">${esc(T('save'))}</button></div>
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
  item.querySelector('.bi-save').onclick = () => { if(b.subject) addSubject(b.subject); editingBlock = null; saveData(); renderApp(); };
  if(editingBlock === i){ const ed = item.querySelector('#biEdit' + i); if(ed) ed.classList.add('open'); }
}

function toggleEdit(i){ editingBlock = (editingBlock === i) ? null : i; renderBlocks(); }
function openEdit(i){ editingBlock = i; const ed = document.getElementById('biEdit' + i); if(ed) ed.classList.add('open'); }

function moveBlock(i, dir){
  const j = i + dir; if(j < 0 || j >= blocks.length) return;
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  if(curBlock === i) curBlock = j; else if(curBlock === j) curBlock = i;
  saveData(); renderApp();
}

function addQuickBlock(mins){
  blocks.push({id:nid++, subject:'', mins, note:'', tasks:[], done:false, status:null});
  checkPauseSuggestion();
  // Sync ring to this block if it's the only/first one and timer isn't running
  if(!running && blocks.length === 1){ timeLeft = mins * 60; totalTime = mins * 60; }
  saveData(); renderApp();
}

function addQuickPause(){
  blocks.push({id:nid++, isPause:true, mins:15, note:'', tasks:[], done:false});
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
    b.innerHTML = `<span>💡 ${streak} blokken zonder pauze — pauze inlassen?</span><button onclick="addQuickPause();this.closest('.pause-suggest').remove()">＋ Pauze</button><button onclick="this.closest('.pause-suggest').remove()">✕</button>`;
    const host = document.getElementById('blocksList');
    if(host){ host.before(b); setTimeout(() => b.remove && b.isConnected && b.remove(), 8000); }
  }
}

function addBlock(){
  blocks.push({id:nid++, subject:'', mins:S.focus, note:'', tasks:[], done:false, status:null});
  checkPauseSuggestion();
  saveData(); renderApp(); openEdit(blocks.length - 1);
}

function deleteBlock(i){
  blocks.splice(i, 1);
  if(curBlock >= blocks.length) curBlock = Math.max(0, blocks.length - 1);
  editingBlock = null;
  if(!blocks.length){ goHome(); return; }
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

  // routing
  if(!onboarded){ startOnboard(); }
  else if(_restoredDay && blocks.length){ goApp(); banner(Tf('sess_of', {a:Math.min(curBlock+1, blocks.length), b:blocks.length})); }
  else { goHome(); }
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

function agendaNavMonth(dir){
  if(!agendaViewDate) agendaViewDate = new Date();
  agendaViewDate.setMonth(agendaViewDate.getMonth() + dir);
  renderAgenda();
}

function renderAgenda(){
  if(!agendaViewDate) agendaViewDate = new Date();
  const d = agendaViewDate;

  // Header labels
  document.getElementById('agendaBackLbl').textContent = '← ' + T('agenda_back');
  document.getElementById('agendaTitleEl').textContent = T('agenda_title');
  document.getElementById('agendaAddBtn').textContent = T('agenda_add_exam');

  // Month label
  const monthLbl = d.toLocaleDateString(S.lang === 'en' ? 'en-US' : S.lang, {month:'long', year:'numeric'});
  document.getElementById('agendaMonthLbl').textContent = monthLbl.charAt(0).toUpperCase() + monthLbl.slice(1);

  // Calendar grid
  const cal = document.getElementById('agendaCal');
  cal.innerHTML = '';

  const year = d.getFullYear(), month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const today = todayStr();

  // Day-of-week headers (Mon-Sun)
  const dayNames = ['Ma','Di','Wo','Do','Vr','Za','Zo'];
  if(S.lang === 'en') { dayNames.splice(0, 7, 'Mo','Tu','We','Th','Fr','Sa','Su'); }
  else if(S.lang === 'fr') { dayNames.splice(0, 7, 'Lu','Ma','Me','Je','Ve','Sa','Di'); }
  else if(S.lang === 'es') { dayNames.splice(0, 7, 'Lu','Ma','Mi','Ju','Vi','Sá','Do'); }
  else if(S.lang === 'ro') { dayNames.splice(0, 7, 'Lu','Ma','Mi','Jo','Vi','Sâ','Du'); }
  dayNames.forEach(n => {
    const h = document.createElement('div');
    h.className = 'cal-hdr'; h.textContent = n;
    cal.appendChild(h);
  });

  // Start offset (Mon=0)
  let startOffset = (firstDay.getDay() + 6) % 7;
  for(let i = 0; i < startOffset; i++){
    const blank = document.createElement('div'); blank.className = 'cal-day cal-blank'; cal.appendChild(blank);
  }

  for(let day = 1; day <= lastDay.getDate(); day++){
    const dateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if(dateStr === today) cell.classList.add('cal-today');

    const exams = examDates.filter(e => e.date === dateStr);
    const hasPlan = !!dayPlans[dateStr];
    const histEntry = history.find(h => h.date === dateStr);

    let dots = '';
    if(exams.length) dots += '<span class="cal-dot exam"></span>';
    if(hasPlan || histEntry) dots += '<span class="cal-dot plan"></span>';

    cell.innerHTML = `<span class="cal-day-num">${day}</span>${dots ? '<div class="cal-dots">' + dots + '</div>' : ''}`;
    cell.onclick = () => showAgendaDay(dateStr);
    cal.appendChild(cell);
  }

  // Show today's detail by default
  showAgendaDay(today);
}

let _agendaSelectedDay = null;
function showAgendaDay(dateStr){
  _agendaSelectedDay = dateStr;
  const detail = document.getElementById('agendaDayDetail');
  const exams = examDates.filter(e => e.date === dateStr);
  const plan = dayPlans[dateStr];
  const histEntry = history.find(h => h.date === dateStr);

  const d = new Date(dateStr + 'T12:00:00');
  const today = todayStr();
  const diffDays = Math.round((d - new Date(today + 'T12:00:00')) / 86400000);
  let dayLbl = '';
  if(diffDays === 0) dayLbl = T('agenda_today');
  else if(diffDays === 1) dayLbl = T('agenda_tomorrow');
  else if(diffDays > 1) dayLbl = Tf('agenda_days_left', {n: diffDays});
  else dayLbl = Math.abs(diffDays) + (S.lang === 'nl' ? ' dagen geleden' : ' days ago');

  const dayName = d.toLocaleDateString(S.lang === 'en' ? 'en-US' : S.lang, {weekday:'long', day:'numeric', month:'long'});

  let html = `<div class="agenda-day-title">
    <span class="agenda-day-name">${dayName}</span>
    <span class="agenda-day-rel">${dayLbl}</span>
  </div>`;

  // Exams
  if(exams.length){
    html += `<div class="agenda-section-lbl">${T('agenda_exam_lbl')}</div>`;
    exams.forEach(ex => {
      const col = ex.color || '#f87171';
      html += `<div class="agenda-exam-card" style="border-left-color:${col}">
        <div class="agenda-exam-name">${esc(ex.subject)}</div>
        ${ex.time ? `<div class="agenda-exam-time">🕐 ${esc(ex.time)}</div>` : ''}
        ${ex.note ? `<div class="agenda-exam-note">${esc(ex.note)}</div>` : ''}
        <button class="agenda-exam-del" onclick="deleteExam('${ex.id}')">✕</button>
      </div>`;
    });
  }

  // History / plan
  if(histEntry){
    html += `<div class="agenda-section-lbl">${T('agenda_plan_lbl')}</div>
      <div class="agenda-hist-card">✓ ${fmtDur(histEntry.mins)} ${S.lang === 'nl' ? 'gestudeerd' : 'studied'}</div>`;
  } else if(plan){
    html += `<div class="agenda-section-lbl">${T('agenda_plan_lbl')}</div>`;
    plan.forEach(b => {
      html += `<div class="agenda-plan-row"><span class="agenda-plan-dot" style="background:${b.isPause ? 'var(--muted)' : colorFor(b.subject || '')}"></span>${esc(b.isPause ? T('dpl_type_pause') : (b.subject || T('dpl_type_focus')))} · ${fmtDur(b.mins)}</div>`;
    });
    html += `<button class="agenda-plan-btn" onclick="editDayPlan('${dateStr}')">${T('agenda_edit_day')}</button>`;
    html += `<button class="agenda-del-plan-btn" onclick="deleteDayPlan('${dateStr}')">✕ ${S.lang === 'nl' ? 'Plan verwijderen' : 'Remove plan'}</button>`;
  } else if(diffDays >= 0) {
    if(!exams.length) html += `<div class="agenda-no-events">${T('agenda_no_events')}</div>`;
    html += `<button class="agenda-plan-btn" onclick="planFromAgenda('${dateStr}')">${T('agenda_plan_day')}</button>`;
  } else {
    if(!exams.length) html += `<div class="agenda-no-events">${T('agenda_no_events')}</div>`;
  }

  detail.innerHTML = html;

  // Highlight selected day
  document.querySelectorAll('.cal-day').forEach(el => el.classList.remove('cal-selected'));
}

function planFromAgenda(dateStr){
  // Open planner pre-set for that date; save plan back to dayPlans[dateStr]
  D.bb = [];
  plannerStartTime = '09:00';
  plannerEndTime = '';
  plannerMode = 'full';
  // After startFromPlanner, we'll save to dayPlans instead of starting immediately
  _planningForDate = dateStr;
  renderPlanner();
  showScreen('planner');
}

function editDayPlan(dateStr){
  D.bb = (dayPlans[dateStr] || []).map(b => ({...b, done:false, tasks:b.tasks||[]}));
  plannerStartTime = '09:00';
  plannerMode = 'full';
  _planningForDate = dateStr;
  renderPlanner();
  showScreen('planner');
}

function deleteDayPlan(dateStr){
  delete dayPlans[dateStr];
  saveData();
  showAgendaDay(dateStr);
}

/* ---- Exam modal ---- */
let _editingExamId = null;
function openExamModal(examId){
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
        <input class="bd-subj-input" id="examDateInput" type="date" value="${ex ? ex.date : todayStr()}">
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
        <div class="bd-field-lbl">Kleur</div>
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
function examPickColor(c){
  document.getElementById('examColorVal').value = c;
  document.querySelectorAll('.exam-color-dot').forEach(d => d.classList.toggle('active', d.style.background === c || d.style.backgroundColor === c));
}
function saveExamModal(){
  const subj = document.getElementById('examSubjInput').value.trim();
  const date = document.getElementById('examDateInput').value;
  if(!subj || !date){ banner('Vul vak en datum in.'); return; }
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
