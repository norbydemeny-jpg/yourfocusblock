/* ══════════════════════════════════════════════════════
   FocusBlock — planner.js
   Flow engine: onboarding, plan-my-day, short-on-time,
   all flow steps, block builder, commit plan.
   ══════════════════════════════════════════════════════ */

/* ---- Flow entry points ---- */
function startMode(mode){
  if(mode === 'agenda') { goAgenda(); return; }
  if(mode === 'last')  { continueLast(); return; }
  if(mode === 'day')   { goPlanner('full'); return; }
  if(mode === 'quick') { startQuick(); return; }

  // 'blocks' = the step-by-step wizard (same as old 'plan' flow)
  // 'plan'   = same
  flowMode = 'plan'; flowStep = 0; D = {};
  D.subjects = subjects.map(s => s.name);
  D.durIdx = getDurs().findIndex(d => d.min === S.focus);
  if(D.durIdx < 0) D.durIdx = getDurs().findIndex(d => d.rec);
  D.count = 4;
  if(mode === 'short'){
    D.chosen = []; D.time = 120;
    flowSteps = ['short_subj','short_focus','short_time','ready'];
  } else {
    // 'blocks' and 'plan' both use the full wizard
    flowSteps = ['dur','count','assign','ready'];
  }
  showScreen('flow'); renderFlowStep();
}

function startOnboard(){
  flowMode = 'onboard'; flowStep = 0; D = {subjects:[]};
  flowSteps = ['lang','name','subjects','companion','theme','ready_onb'];
  showScreen('flow'); renderFlowStep();
}

function flowBack(){
  if(flowStep > 0){ flowStep--; renderFlowStep(); }
  else { if(flowMode === 'onboard') showScreen('flow'); else goHome(); }
}

function flowNext(){
  if(flowStep < flowSteps.length - 1){ flowStep++; renderFlowStep(); }
}

function renderFlowProg(){
  const p = document.getElementById('flowProg'); p.innerHTML = '';
  for(let i = 0; i < flowSteps.length; i++){
    const d = document.createElement('div');
    d.className = 'fp' + (i < flowStep ? ' don' : i === flowStep ? ' act' : '');
    p.appendChild(d);
  }
  document.getElementById('flowStepLbl').textContent = (flowStep+1) + ' / ' + flowSteps.length;
  document.getElementById('flowBackLbl').textContent = T('back');
}

function fstepHTML(q, hint, body, ctaLabel, ctaEnabled){
  return `<div class="fstep show"><div class="fstep-q">${q}</div>${hint ? `<div class="fstep-hint">${esc(hint)}</div>` : ''}${body}<div class="flow-cta"><button class="btn-primary" id="flowCta" ${ctaEnabled === false ? 'disabled' : ''}>${esc(ctaLabel)}</button></div></div>`;
}

function renderFlowStep(){
  renderFlowProg();
  const step = flowSteps[flowStep];
  const host = document.getElementById('flowSteps');
  if(step === 'lang') renderStepLang(host);
  else if(step === 'name') renderStepName(host);
  else if(step === 'subjects') renderStepSubjects(host);
  else if(step === 'companion') renderStepCompanion(host);
  else if(step === 'theme') renderStepTheme(host);
  else if(step === 'dur') renderStepDur(host);
  else if(step === 'count') renderStepCount(host);
  else if(step === 'assign') renderStepAssign(host);
  else if(step === 'short_subj') renderStepShortSubj(host);
  else if(step === 'short_focus') renderStepShortFocus(host);
  else if(step === 'short_time') renderStepShortTime(host);
  else if(step === 'ready' || step === 'ready_onb') renderStepReady(host, step === 'ready_onb');
}

/* ---- step: language ---- */
function renderStepLang(host){
  const opts = LANGS.map(l => `<button class="opt${l.id === S.lang ? ' on' : ''}" data-l="${l.id}"><div class="opt-body"><div class="opt-name">${esc(l.n)}</div></div><div class="opt-check">✓</div></button>`).join('');
  host.innerHTML = fstepHTML(T('onb_lang_q'), '', `<div class="opt-list">${opts}</div>`, T('next'));
  host.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    S.lang = b.dataset.l; applyLang(); renderFlowStep();
  });
  document.getElementById('flowCta').onclick = flowNext;
}

/* ---- step: name ---- */
function renderStepName(host){
  host.innerHTML = fstepHTML(T('onb_name_q'), '', `<input class="txt-input" id="nameInp" placeholder="${esc(T('name_ph'))}" value="${esc(D.name || userName || '')}" maxlength="24" autocomplete="off">`, T('next'));
  const inp = document.getElementById('nameInp');
  setTimeout(() => inp.focus(), 60);
  inp.oninput = () => { D.name = inp.value; };
  inp.onkeydown = (e) => { if(e.key === 'Enter') document.getElementById('flowCta').click(); };
  document.getElementById('flowCta').onclick = () => { D.name = inp.value.trim(); flowNext(); };
}

/* ---- step: subjects (master list) ---- */
function renderStepSubjects(host){
  host.innerHTML = fstepHTML(T('onb_subj_q'), T('onb_subj_hint'),
    `<div class="subj-mgr"><div class="subj-add-row"><input class="txt-input" id="subjInp" placeholder="${esc(T('subj_ph'))}" maxlength="22" autocomplete="off"><button class="subj-add-btn" id="subjAdd">+</button></div><div class="subj-chips" id="subjChips"></div></div>`,
    T('next'));
  const inp = document.getElementById('subjInp');
  const add = () => { const v = inp.value.trim(); if(v){ addSubject(v); inp.value = ''; drawSubjChips(); } inp.focus(); };
  document.getElementById('subjAdd').onclick = add;
  inp.onkeydown = (e) => { if(e.key === 'Enter'){ e.preventDefault(); add(); } };
  drawSubjChips();
  document.getElementById('flowCta').onclick = flowNext;
}

function drawSubjChips(){
  const host = document.getElementById('subjChips'); if(!host) return;
  if(!subjects.length){ host.innerHTML = `<div class="subj-empty">${esc(T('no_subjects'))}</div>`; return; }
  host.innerHTML = subjects.map((s,i) => `<span class="subj-chip"><span class="sc-dot" style="background:${s.color}"></span>${esc(s.name)}<button class="sc-x" data-i="${i}">✕</button></span>`).join('');
  host.querySelectorAll('.sc-x').forEach(b => b.onclick = () => { subjects.splice(+b.dataset.i, 1); drawSubjChips(); });
}

function addSubject(name){
  name = String(name).trim(); if(!name) return null;
  let ex = subjects.find(s => s.name.toLowerCase() === name.toLowerCase());
  if(ex) return ex;
  const s = {name, color:colorFor(name)}; subjects.push(s); return s;
}

/* ---- step: companion ---- */
function renderStepCompanion(host){
  const acc = '#9ca3af';
  const cards = compMeta().map(c => {
    const vis = c.id === 'none' ? '<div style="font-size:24px;color:var(--muted)">∅</div>' : companionSVG(c.id, 'active', acc, 2);
    return `<button class="pick-card${(D.companion || S.companion) === c.id ? ' on' : ''}" data-c="${c.id}"><div class="pc-vis">${vis}</div><div class="pc-name">${esc(T(c.k))}</div></button>`;
  }).join('');
  host.innerHTML = fstepHTML(T('onb_comp_q'), T('onb_comp_hint'), `<div class="pick-grid">${cards}</div>`, T('next'));
  host.querySelectorAll('.pick-card').forEach(b => b.onclick = () => {
    D.companion = b.dataset.c;
    host.querySelectorAll('.pick-card').forEach(x => x.classList.toggle('on', x === b));
  });
  document.getElementById('flowCta').onclick = flowNext;
}

/* ---- step: theme ---- */
function renderStepTheme(host){
  const cards = THEMES.map(t => `<button class="pick-card${(D.theme || S.theme) === t.id ? ' on' : ''}" data-t="${t.id}"><div class="theme-sw" style="background:${t.a}"></div><div class="pc-name">${esc(t.n)}</div></button>`).join('');
  host.innerHTML = fstepHTML(T('onb_theme_q'), T('onb_theme_hint'), `<div class="pick-grid">${cards}</div>`, T('next'));
  host.querySelectorAll('.pick-card').forEach(b => b.onclick = () => {
    D.theme = b.dataset.t; S.theme = b.dataset.t; applyBodyClass();
    host.querySelectorAll('.pick-card').forEach(x => x.classList.toggle('on', x === b));
  });
  document.getElementById('flowCta').onclick = flowNext;
}

/* ---- step: duration ---- */
function renderStepDur(host){
  const durs = getDurs();
  if(D.durIdx == null || D.durIdx < 0) D.durIdx = durs.findIndex(d => d.rec);
  const opts = durs.map((d,i) => `<button class="dur-opt${i === D.durIdx ? ' on' : ''}${d.rec ? ' rec' : ''}" data-i="${i}" ${d.rec ? `data-rec="${esc(T('rec_badge'))}"` : ''}><div class="dur-badge">${d.min}/${d.brk}</div><div class="dur-txt"><div class="dur-name">${esc(d.name)}</div><div class="opt-desc">${esc(d.desc)}</div></div><div class="dur-check">✓</div></button>`).join('');
  host.innerHTML = fstepHTML(T('dur_q'), T('dur_hint'), `<div class="dur-grid">${opts}</div>`, T('next'));
  host.querySelectorAll('.dur-opt').forEach(b => b.onclick = () => {
    D.durIdx = +b.dataset.i;
    host.querySelectorAll('.dur-opt').forEach(x => x.classList.toggle('on', x === b));
  });
  document.getElementById('flowCta').onclick = flowNext;
}

/* ---- step: count ---- */
function renderStepCount(host){
  if(!D.count) D.count = 4;
  host.innerHTML = fstepHTML(T('count_q'), T('count_hint'),
    `<div class="cnt-pick"><div class="cnt-num" id="cntNum">${D.count}</div><div class="cnt-ctrls"><button class="cnt-btn" id="cntMinus">−</button><button class="cnt-btn" id="cntPlus">+</button></div></div><div class="cnt-info" id="cntInfo"></div>`,
    T('next'));
  const upd = () => {
    document.getElementById('cntNum').textContent = D.count;
    const durs = getDurs(); const d = durs[D.durIdx] || durs.find(x => x.rec);
    const focusMins = D.count * d.min;
    const breakMins = (D.count - 1) * d.brk;
    // Bug fix: use T() keys instead of hardcoded Dutch strings
    let endStr = '';
    const startSrc = D.startTime || null;
    if(startSrc){
      const [sh,sm] = startSrc.split(':').map(Number);
      const endMins = sh*60 + sm + focusMins + breakMins;
      const eh = Math.floor(endMins/60)%24, em = endMins%60;
      endStr = ` · ${T('ready_at')} <strong>${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}</strong>`;
    } else {
      const now = new Date();
      const startMins = Math.ceil((now.getHours()*60 + now.getMinutes() + 10) / 10) * 10;
      const endMins = startMins + focusMins + breakMins;
      const eh = Math.floor(endMins/60)%24, em = endMins%60;
      endStr = ` · ${T('ready_approx')}<strong>${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}</strong>`;
    }
    document.getElementById('cntInfo').innerHTML = `<strong>${D.count}</strong> × ${d.min} min · ${fmtDur(focusMins)}${endStr}`;
  };
  document.getElementById('cntMinus').onclick = () => { D.count = Math.max(1, D.count-1); upd(); };
  document.getElementById('cntPlus').onclick = () => { D.count = Math.min(12, D.count+1); upd(); };
  upd();
  document.getElementById('flowCta').onclick = () => { buildAssignDrafts(); flowNext(); };
}

function buildAssignDrafts(){
  const durs = getDurs(); const d = durs[D.durIdx] || durs.find(x => x.rec);
  if(!D.bb) D.bb = [];
  
  // Extract existing focus blocks to preserve user details (subjects, notes, tasks)
  const existingFocus = D.bb.filter(b => !b.isPause);
  
  // Match the requested focus block count
  while(existingFocus.length < D.count){
    existingFocus.push({subject:'', mins:d.min, note:'', tasks:[], noteOpen:false});
  }
  existingFocus.length = D.count;
  existingFocus.forEach(b => { if(!b.mins) b.mins = d.min; });
  
  // Interleave focus blocks with pause blocks
  const newBb = [];
  for(let i = 0; i < D.count; i++){
    newBb.push(existingFocus[i]);
    if(i < D.count - 1){
      // Reuse existing pause block from previous state if available to prevent overwriting custom break durations
      const prevPause = D.bb[i * 2 + 1];
      if(prevPause && prevPause.isPause){
        newBb.push(prevPause);
      } else {
        newBb.push({subject:'__pause__', mins:d.brk, note:'', tasks:[], noteOpen:false, isPause:true});
      }
    }
  }
  D.bb = newBb;
}

/* ---- step: assign (per-block builder) ---- */
function renderStepAssign(host){
  buildAssignDrafts();
  if(!D.startTime){
    const now = new Date();
    const totalMins = now.getHours()*60 + now.getMinutes() + 10;
    const rounded = Math.ceil(totalMins / 10) * 10;
    const h = Math.floor(rounded/60) % 24;
    const m = rounded % 60;
    D.startTime = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
  }
  host.innerHTML = fstepHTML(T('assign_q'), T('assign_hint'),
    `<div class="assign-starttime"><label>🕐 ${esc(T('start_at'))}</label><input type="time" id="startTimeInp" value="${D.startTime}"></div>
     <div class="quick-add-label">${esc(T('quick_add_lbl'))}</div>
     <div class="bb-quick-row">
       <button class="bb-quick-btn" id="bbAdd25">＋ 25 min</button>
       <button class="bb-quick-btn" id="bbAdd50">＋ 50 min</button>
       <button class="bb-quick-btn bb-quick-pause" id="addPauseBtn">⏸ ${esc(T('phase_long'))}</button>
     </div>
     <div class="block-builder" id="bbHost"></div>`,
    T('next'));
  document.getElementById('startTimeInp').oninput = (e) => { D.startTime = e.target.value; drawBuilder(); };
  document.getElementById('bbAdd25').onclick = () => {
    D.bb.push({subject:'', mins:25, note:'', tasks:[], noteOpen:false});
    D.bb.push({subject:'__pause__', mins:5, note:'', tasks:[], noteOpen:false, isPause:true});
    D.count = D.bb.filter(b => !b.isPause).length; drawBuilder();
    setTimeout(() => { const h = document.getElementById('bbHost'); if(h) h.scrollTop = h.scrollHeight; }, 50);
  };
  document.getElementById('bbAdd50').onclick = () => {
    D.bb.push({subject:'', mins:50, note:'', tasks:[], noteOpen:false});
    D.bb.push({subject:'__pause__', mins:10, note:'', tasks:[], noteOpen:false, isPause:true});
    D.count = D.bb.filter(b => !b.isPause).length; drawBuilder();
    setTimeout(() => { const h = document.getElementById('bbHost'); if(h) h.scrollTop = h.scrollHeight; }, 50);
  };
  document.getElementById('addPauseBtn').onclick = () => {
    D.bb.push({subject:'__pause__', mins:60, note:'', tasks:[], noteOpen:false, isPause:true});
    D.count = D.bb.length; drawBuilder();
    setTimeout(() => { const h = document.getElementById('bbHost'); if(h) h.scrollTop = h.scrollHeight; }, 50);
  };
  drawBuilder();
  document.getElementById('flowCta').onclick = flowNext;
}

function subjectOptionsHTML(sel){
  let o = `<option value="">${esc(T('pick_subject'))}</option>`;
  subjects.forEach(s => { o += `<option value="${esc(s.name)}"${s.name === sel ? ' selected' : ''}>${esc(s.name)}</option>`; });
  o += `<option value="__custom__">${esc(T('custom_subject'))}</option>`;
  return o;
}

function calcDoneBy(idx){
  if(!D.startTime) return '';
  const [hh,mm] = D.startTime.split(':').map(Number);
  let totalMins = hh*60 + mm;
  const durs = getDurs(); const d = durs[D.durIdx] || durs.find(x => x.rec);
  const brkMin = D._shortBrk || d.brk;
  for(let i = 0; i <= idx; i++){
    const b = D.bb[i]; if(!b) break;
    totalMins += b.mins;
    if(i < idx){
      const next = D.bb[i+1];
      if(next && next.isPause){
        // next block is an explicit pause — its duration will be added in the next iteration
      } else if(b.isPause){
        // current is pause, next is focus — no extra gap
      } else {
        // focus → focus: add auto short break
        totalMins += brkMin;
      }
    }
  }
  const h = Math.floor(totalMins/60)%24, m = totalMins%60;
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
}

function drawBuilder(){
  const host = document.getElementById('bbHost'); if(!host) return;
  host.innerHTML = '';
  let focusNum = 0;
  D.bb.forEach((b,i) => {
    if(!b.isPause) focusNum++;
    const card = document.createElement('div');
    const doneBy = calcDoneBy(i);
    const dragHandle = `<div class="bb-drag-handle" title="${esc(T('drag_to_move'))}">⠿</div>`;
    if(b.isPause){
      card.className = 'bb-card bb-pause';
      card.dataset.idx = i;
      card.innerHTML = `
        <div class="bb-top">
          ${dragHandle}
          <div class="bb-num">⏸</div>
          <span class="bb-pause-lbl">${esc(T('phase_long'))}</span>
          ${D.bb.length > 1 ? `<button class="bb-x" title="${esc(T('del_lbl'))}">✕</button>` : ''}
        </div>
        <div class="bb-pause-mins"><span>${esc(T('minutes'))}</span><input type="number" min="15" max="180" step="15" value="${b.mins}"><span class="bb-done-by bb-done-by-pause">${esc(T('break_until'))} ${doneBy}</span></div>`;
      card.querySelector('.bb-pause-mins input').oninput = (e) => { b.mins = Math.max(15, Math.min(180, +e.target.value || 15)); updateDoneByTimes(); };
      const x = card.querySelector('.bb-x'); if(x) x.onclick = () => { D.bb.splice(i,1); D.count = D.bb.filter(b => !b.isPause).length; drawBuilder(); };
    } else {
      card.className = 'bb-card';
      card.dataset.idx = i;
      const isCustom = b.subject && !subjects.some(s => s.name === b.subject);
      const showCustomInput = isCustom || b._custom;
      const chipHtml = subjects.map(s => `<button type="button" class="bb-subj-chip${b.subject === s.name ? ' on' : ''}" data-name="${esc(s.name)}" style="--chip-col:${s.color}">${esc(s.name)}</button>`).join('');
      card.innerHTML = `
        <div class="bb-top">
          ${dragHandle}
          <div class="bb-num">${focusNum}</div>
          <div style="flex:1;min-width:0;">
            <div class="bb-subj-chips">${chipHtml}<button type="button" class="bb-subj-chip bb-subj-new${showCustomInput ? ' on' : ''}">${esc(T('add_subj_btn'))}</button></div>
            <input class="bb-custom-inp${showCustomInput ? '' : ' hidden'}" placeholder="${esc(T('subj_ph'))}" value="${esc(showCustomInput ? b.subject : '')}">
          </div>
          ${D.bb.length > 1 ? `<button class="bb-x" title="${esc(T('cancel'))}">✕</button>` : ''}
        </div>
        <div class="bb-min"><span>${esc(T('minutes'))}</span><input type="number" min="5" max="180" step="5" value="${b.mins}"><span class="bb-done-by">${esc(T('ready_at'))} ${doneBy}</span></div>
        <div class="bb-tasks-section">
          <div class="bb-checks"></div>
          ${(!b.tasks || !b.tasks.length) ? `<button class="bb-add-todo-btn bb-add-task-inline">＋ ${esc(T('add_task'))}</button>` : `<button class="bb-add-task-inline bb-add-task-more">＋ ${esc(T('add_task'))}</button>`}
        </div>`;
      // chip selection
      card.querySelectorAll('.bb-subj-chip:not(.bb-subj-new)').forEach(chip => {
        chip.onclick = () => {
          b.subject = chip.dataset.name; b._custom = false;
          card.querySelectorAll('.bb-subj-chip').forEach(c => c.classList.remove('on'));
          chip.classList.add('on');
          const inp = card.querySelector('.bb-custom-inp'); inp.classList.add('hidden'); inp.value = '';
        };
      });
      const newChip = card.querySelector('.bb-subj-new');
      const custInp = card.querySelector('.bb-custom-inp');
      newChip.onclick = () => {
        card.querySelectorAll('.bb-subj-chip').forEach(c => c.classList.remove('on'));
        newChip.classList.add('on');
        custInp.classList.remove('hidden');
        b.subject = ''; b._custom = true;
        setTimeout(() => custInp.focus(), 30);
      };
      custInp.oninput = () => { b.subject = custInp.value; };
      custInp.onkeydown = (e) => { if(e.key === 'Enter'){ e.preventDefault(); custInp.blur(); } };
      if(showCustomInput) setTimeout(() => custInp.focus(), 30);
      card.querySelector('.bb-min input').oninput = (e) => { b.mins = Math.max(5, Math.min(180, +e.target.value || 5)); updateDoneByTimes(); };
      const x = card.querySelector('.bb-x'); if(x) x.onclick = () => { D.bb.splice(i,1); D.count = D.bb.filter(bl => !bl.isPause).length; drawBuilder(); };
      const checks = card.querySelector('.bb-checks');
      (b.tasks || []).forEach((t,ti) => {
        const row = document.createElement('div'); row.className = 'bb-check-row';
        row.innerHTML = `<input value="${esc(t.text || '')}" placeholder="${esc(T('task_ph'))}"><button class="bb-x" style="width:24px;">✕</button>`;
        row.querySelector('input').oninput = (e) => { t.text = e.target.value; };
        row.querySelector('.bb-x').onclick = () => { b.tasks.splice(ti,1); drawBuilder(); };
        checks.appendChild(row);
      });
      card.querySelector('.bb-add-task-inline').onclick = () => { if(!b.tasks) b.tasks = []; b.tasks.push({text:'', done:false}); drawBuilder(); };
    }
    host.appendChild(card);
  });
  // smooth pointer drag (mouse + touch)
  attachPointerDrag(host,
    () => [...host.querySelectorAll('.bb-card')],
    (el) => parseInt(el.dataset.idx),
    (from, to) => {
      const moved = D.bb.splice(from, 1)[0];
      const insertAt = to > from ? to-1 : to;
      D.bb.splice(insertAt, 0, moved);
      D.count = D.bb.filter(bl => !bl.isPause).length;
      drawBuilder();
    }
  );
}

function updateDoneByTimes(){
  const host = document.getElementById('bbHost'); if(!host) return;
  const cards = [...host.querySelectorAll('.bb-card')];
  cards.forEach((card, i) => {
    const el = card.querySelector('.bb-done-by');
    if(!el) return;
    const isPause = card.classList.contains('bb-pause');
    const time = calcDoneBy(i);
    el.textContent = (isPause ? T('break_until') : T('ready_at')) + ' ' + time;
  });
}

/* ---- step: short subjects ---- */
function renderStepShortSubj(host){
  if(!D.chosen) D.chosen = [];
  host.innerHTML = fstepHTML(T('short_subj_q'), T('short_subj_hint'),
    `<div class="subj-mgr"><div class="subj-add-row"><input class="txt-input" id="ssInp" placeholder="${esc(T('subj_ph'))}" maxlength="22" autocomplete="off"><button class="subj-add-btn" id="ssAdd">+</button></div><div class="opt-list" id="ssList" style="margin-top:.4rem;"></div></div>`,
    T('next'));
  const inp = document.getElementById('ssInp');
  const add = () => { const v = inp.value.trim(); if(v){ const s = addSubject(v); if(!D.chosen.includes(s.name)) D.chosen.push(s.name); inp.value = ''; drawShortSubj(); } inp.focus(); };
  document.getElementById('ssAdd').onclick = add;
  inp.onkeydown = (e) => { if(e.key === 'Enter'){ e.preventDefault(); add(); } };
  drawShortSubj();
  document.getElementById('flowCta').onclick = () => { if(D.chosen.length) flowNext(); else banner(T('no_subjects')); };
}

function drawShortSubj(){
  const host = document.getElementById('ssList'); if(!host) return;
  if(!subjects.length){ host.innerHTML = `<div class="subj-empty">${esc(T('no_subjects'))}</div>`; return; }
  host.innerHTML = subjects.map(s => {
    const on = D.chosen.includes(s.name);
    return `<button class="opt${on ? ' on' : ''}" data-s="${esc(s.name)}"><div class="opt-body"><div class="opt-name"><span class="sc-dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${s.color};margin-right:8px;"></span>${esc(s.name)}</div></div><div class="opt-check">✓</div></button>`;
  }).join('');
  host.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    const n = b.dataset.s; const i = D.chosen.indexOf(n);
    if(i >= 0) D.chosen.splice(i,1); else D.chosen.push(n);
    drawShortSubj();
  });
}

/* ---- step: short-on-time priority ---- */
function renderStepShortFocus(host){
  if(!D.priority) D.priority = [...D.chosen];
  D.priority = D.priority.filter(n => D.chosen.includes(n));
  D.chosen.forEach(n => { if(!D.priority.includes(n)) D.priority.push(n); });

  function drawPriority(){
    const list = document.getElementById('sfPrioList'); if(!list) return;
    list.innerHTML = '';
    D.priority.forEach((name, pi) => {
      const col = colorFor(name);
      const labels = ['🔴 Hoog','🟡 Middel','🟢 Laag'];
      const pLabel = labels[Math.min(pi, labels.length-1)];
      const el = document.createElement('div');
      el.className = 'sf-prio-row'; el.dataset.name = name;
      el.innerHTML = `
        <div class="sf-prio-handle">⠿</div>
        <span class="sf-dot" style="background:${col};width:10px;height:10px;border-radius:50%;flex-shrink:0;"></span>
        <span class="sf-prio-name">${esc(name)}</span>
        <span class="sf-prio-badge">${pLabel}</span>
        <div class="sf-prio-arrows">
          <button class="sf-arrow" data-dir="-1" ${pi === 0 ? 'disabled' : ''}>↑</button>
          <button class="sf-arrow" data-dir="1" ${pi === D.priority.length-1 ? 'disabled' : ''}>↓</button>
        </div>`;
      el.querySelectorAll('.sf-arrow').forEach(btn => {
        btn.onclick = () => {
          const dir = +btn.dataset.dir;
          const idx = D.priority.indexOf(name);
          const newIdx = idx + dir;
          if(newIdx < 0 || newIdx >= D.priority.length) return;
          D.priority.splice(idx, 1);
          D.priority.splice(newIdx, 0, name);
          drawPriority();
        };
      });
      list.appendChild(el);
    });
  }

  host.innerHTML = fstepHTML(
    `Wat heeft de <span>hoogste prioriteit</span>?`,
    'Bovenaan = meeste tijd. Zet je belangrijkste vak eerst.',
    `<div class="sf-prio-list" id="sfPrioList"></div>`,
    T('next')
  );
  drawPriority();
  document.getElementById('flowCta').onclick = () => { D.chosen = [...D.priority]; flowNext(); };
}

/* ---- step: short-on-time available time ---- */
function renderStepShortTime(host){
  if(!D.time) D.time = 120;
  const presets = [60,90,120,180,240];
  const isCustom = !presets.includes(D.time);
  const opts = presets.map(m => `<button class="dur-opt${D.time === m ? ' on' : ''}" data-m="${m}"><div class="dur-badge">${fmtDur(m)}</div><div class="dur-txt"><div class="dur-name">${fmtDur(m)}</div></div><div class="dur-check">✓</div></button>`).join('');
  const customCard = `<button class="dur-opt st-custom${isCustom ? ' on' : ''}" data-m="custom"><div class="dur-badge" id="stCustBadge">${isCustom ? fmtDur(D.time) : '＋'}</div><div class="dur-txt"><div class="dur-name">${esc(T('short_custom'))}</div></div><div class="dur-check">✓</div></button>`;
  const customPanel = `<div class="st-cust-panel${isCustom ? ' open' : ''}" id="stCustPanel">
      <div class="st-cust-row">
        <div class="st-cust-step" data-unit="h"><button class="step-btn" data-d="-1">−</button><div class="step-val"><span id="stHours">${Math.floor(D.time/60)}</span><span class="st-cust-u">${esc(T('hours_short'))}</span></div><button class="step-btn" data-d="1">+</button></div>
        <div class="st-cust-step" data-unit="m"><button class="step-btn" data-d="-1">−</button><div class="step-val"><span id="stMins">${D.time%60}</span><span class="st-cust-u">${esc(T('min_short'))}</span></div><button class="step-btn" data-d="1">+</button></div>
      </div>
      <div class="st-cust-total" id="stCustTotal">${fmtDur(D.time)}</div>
    </div>`;
  host.innerHTML = fstepHTML(T('short_time_q'), T('short_time_hint'), `<div class="dur-grid">${opts}${customCard}</div>${customPanel}`, T('continue'));
  function selectPreset(b){
    host.querySelectorAll('.dur-opt').forEach(x => x.classList.toggle('on', x === b));
    const panel = document.getElementById('stCustPanel');
    if(b.dataset.m === 'custom'){ panel.classList.add('open'); }
    else { panel.classList.remove('open'); D.time = +b.dataset.m; }
  }
  host.querySelectorAll('.dur-opt').forEach(b => b.onclick = () => selectPreset(b));
  function clampTime(){ if(D.time < 15) D.time = 15; if(D.time > 600) D.time = 600; }
  function refreshCustom(){
    clampTime();
    document.getElementById('stHours').textContent = Math.floor(D.time/60);
    document.getElementById('stMins').textContent = D.time%60;
    document.getElementById('stCustTotal').textContent = fmtDur(D.time);
    document.getElementById('stCustBadge').textContent = fmtDur(D.time);
  }
  host.querySelectorAll('.st-cust-step').forEach(stp => {
    const unit = stp.dataset.unit;
    stp.querySelectorAll('.step-btn').forEach(btn => btn.onclick = () => {
      const d = +btn.dataset.d;
      const cc = host.querySelector('.st-custom'); selectPreset(cc);
      if(unit === 'h') D.time += d*60; else D.time += d*15;
      refreshCustom();
    });
  });
  document.getElementById('flowCta').onclick = () => { autoPlanShort(); flowNext(); };
}

/* ---- short on time: smart auto-planner ---- */
function autoPlanShort(){
  const durs = getDurs();
  let base = durs.find(d => d.rec) || durs[2];
  let chosen = base;
  if(D.time <= 60) chosen = durs.find(d => d.min === 25) || durs[0];
  else if(D.time <= 100) chosen = durs.find(d => d.min === 40) || durs[1];
  const focusMin = chosen.min, brkMin = chosen.brk;
  const subs = D.chosen.length ? D.chosen : subjects.map(s => s.name);
  const per = focusMin + brkMin;
  let n = Math.max(1, Math.floor((D.time + brkMin) / per));
  n = Math.max(n, Math.min(subs.length, 8));
  n = Math.min(n, 8);

  const weights = subs.map((_,i) => i === 0 ? 1.0 : i === 1 ? 0.7 : 0.5);
  let totalWeight = 0;
  for(let i = 0; i < n; i++) totalWeight += weights[i % subs.length];
  const totalFocus = D.time - (n-1) * brkMin;
  const baseUnit = Math.max(15, Math.floor(totalFocus / totalWeight / 5) * 5);

  const bb = [];
  for(let i = 0; i < n; i++){
    const subj = subs[i % subs.length];
    const w = weights[i % subs.length];
    const mins = Math.max(15, Math.min(120, Math.round(baseUnit * w / 5) * 5));
    const note = (D.focusNotes && D.focusNotes[subj]) || '';
    bb.push({subject:subj, mins, note, tasks:[], noteOpen:false});
  }
  D.bb = bb; D.durIdx = durs.indexOf(chosen); D.count = n;
  D._shortBrk = brkMin;
}

/* ---- step: ready ---- */
function renderStepReady(host, isOnb){
  const durs = getDurs();
  let focusMin, brkMin, longMin, count, subjList, totalFocus;
  if(isOnb){
    const d = durs.find(x => x.rec) || durs[2];
    focusMin = d.min; brkMin = d.brk;
    host.innerHTML = fstepHTML(T('ready_q'), '',
      `<div class="ready-card"><div class="rc-row"><div class="rc-ico">✓</div><div><div class="rc-lbl">${esc(T('home_greet_new'))}</div><div class="rc-val">${esc(D.name || T('comp_unnamed'))}</div></div></div>${subjects.length ? `<div class="rc-row"><div class="rc-ico">≡</div><div><div class="rc-lbl">${esc(T('ready_subj'))}</div><div class="rc-val">${subjects.map(s => esc(s.name)).join(' · ')}</div></div></div>` : ''}<div class="rc-row"><div class="rc-ico">◷</div><div><div class="rc-lbl">${esc(T('ready_dur'))}</div><div class="rc-val">${focusMin}/${brkMin}</div></div></div></div>`,
      T('begin'));
    document.getElementById('flowCta').onclick = finishOnboard;
    return;
  }
  const d = durs[D.durIdx] || durs.find(x => x.rec);
  focusMin = d.min; brkMin = (D._shortBrk || d.brk); longMin = S.long;
  count = D.bb.length;
  totalFocus = D.bb.reduce((a,b) => a + (b.mins || focusMin), 0);
  const usedSubs = [...new Set(D.bb.map(b => b.subject).filter(Boolean))];
  subjList = usedSubs.length ? usedSubs.join(' · ') : '—';
  host.innerHTML = fstepHTML(T('ready_q'), '',
    `<div class="ready-card">
      <div class="rc-row"><div class="rc-ico">◷</div><div><div class="rc-lbl">${esc(T('ready_dur'))}</div><div class="rc-val">${focusMin} / ${brkMin} min</div></div></div>
      <div class="rc-row"><div class="rc-ico">▦</div><div><div class="rc-lbl">${esc(T('ready_blocks'))}</div><div class="rc-val">${count}</div></div></div>
      <div class="rc-row"><div class="rc-ico">∑</div><div><div class="rc-lbl">${esc(T('ready_total'))}</div><div class="rc-val">${fmtDur(totalFocus)}</div></div></div>
      <div class="rc-row"><div class="rc-ico">≡</div><div><div class="rc-lbl">${esc(T('ready_subj'))}</div><div class="rc-val">${esc(subjList)}</div></div></div>
    </div>`,
    T('begin'));
  document.getElementById('flowCta').onclick = () => { commitPlan(d, brkMin); };
}

function finishOnboard(){
  userName = (D.name || '').trim();
  if(D.companion) S.companion = D.companion;
  if(D.theme) S.theme = D.theme;
  onboarded = true;
  const rec = getDurs().find(d => d.rec); if(rec){ S.focus = rec.min; S.short = rec.brk; }
  applyBodyClass(); saveData();
  goHome();
  banner(Tf('home_greet', {name:userName || ''}));
}

function commitPlan(d, brkMin){
  D.bb.forEach(b => { if(b.subject && !b.isPause) addSubject(b.subject); });
  S.focus = d.min; S.short = brkMin;
  blocks = D.bb.filter(b => b.mins).map((b,i) => ({
    id:nid++, subject:(b.isPause ? '__pause__' : (b.subject || '').trim()), mins:b.mins || d.min,
    note:b.note || '', tasks:(b.tasks || []).filter(t => t.text && t.text.trim()).map(t => ({text:t.text.trim(), done:false})),
    done:false, status:null, isPause:!!b.isPause
  }));
  if(!blocks.length){ banner(T('no_subjects')); return; }
  lastPlan = { focus:d.min, short:brkMin, long:S.long, longAfter:S.longAfter,
    blocks:blocks.map(b => ({subject:b.subject, mins:b.mins, note:b.note, tasks:b.tasks.map(t => ({text:t.text})), isPause:b.isPause})) };
  initDay();
  saveData();
  goApp();
}

function startQuick(){
  const rec = getDurs().find(d => d.rec) || getDurs()[2];
  S.focus = rec.min; S.short = rec.brk;
  blocks = [{id:nid++, subject:'', mins:rec.min, note:'', tasks:[], done:false, status:null}];
  lastPlan = null;
  initDay(); saveData(); goApp();
}

function continueLast(){
  if(!lastPlan || !Array.isArray(lastPlan.blocks) || !lastPlan.blocks.length){ banner(T('no_subjects')); goHome(); return; }
  S.focus = lastPlan.focus; S.short = lastPlan.short;
  if(lastPlan.long) S.long = lastPlan.long; if(lastPlan.longAfter) S.longAfter = lastPlan.longAfter;
  blocks = lastPlan.blocks.map(b => ({id:nid++, subject:b.subject || '', mins:b.mins, note:b.note || '',
    tasks:(b.tasks || []).map(t => ({text:t.text, done:false})), done:false, status:null, isPause:!!b.isPause}));
  initDay(); saveData(); goApp();
}

function initDay(){
  curBlock = 0; curPhase = 'focus'; sessComp = 0; completedMins = 0; currentSessionMins = 0; dayCounted = false;
  running = false;
  setPhase('focus', true);
}

/* ══════════════════════════════════════════════════════
   DAY PLANNER — goPlanner / renderPlanner / block detail
   ══════════════════════════════════════════════════════ */

function padT(h, m){ return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'); }
function nowRounded5(){
  const now = new Date();
  const rounded = Math.ceil((now.getHours()*60 + now.getMinutes() + 1) / 5) * 5;
  return padT(Math.floor(rounded/60) % 24, rounded % 60);
}

function goPlanner(mode){
  plannerMode = mode || 'full';

  // Pre-fill D.bb if empty
  if(!D.bb || !D.bb.length){
    if (blocks && blocks.length > 0 && !_planningForDate) {
      D.bb = blocks.map(b => ({
        subject: b.subject === '__pause__' ? '' : b.subject,
        mins: b.mins,
        note: b.note || '',
        note2: b.note2 || '',
        tasks: (b.tasks || []).map(t => ({text: t.text, done: !!t.done})),
        isPause: !!b.isPause
      }));
    } else {
      const durIdx = getDurs().findIndex(d => d.rec);
      const dur = getDurs()[durIdx >= 0 ? durIdx : 2]; // fallback to 50/10
      const focMins = dur.min, brkMins = dur.brk;
      // Smart suggestion: 2 focus blocks + 1 pause between them
      D.bb = [
        {subject: subjects.length ? subjects[0].name : '', mins: focMins, note:'', note2:'', tasks:[], isPause:false},
        {subject:'__pause__', mins: brkMins, note:'', tasks:[], isPause:true},
        {subject: subjects.length > 1 ? subjects[1].name : (subjects.length ? subjects[0].name : ''), mins: focMins, note:'', note2:'', tasks:[], isPause:false},
      ];
    }
  }

  if(!plannerStartTime) plannerStartTime = nowRounded5();

  renderPlanner();
  showScreen('planner');
}

function backFromPlanner(){
  if(_planningForDate){ _planningForDate = null; goAgenda(); return; }
  // Go back to wherever the user came from (overview, agenda, app, home, progress)
  const prev = (typeof window.fbPrevScreen === 'function') ? window.fbPrevScreen() : 'home';
  if(prev === 'overview' && typeof renderOverview === 'function'){ renderOverview(); showScreen('overview'); return; }
  if(prev === 'agenda'   && typeof renderAgenda   === 'function'){ renderAgenda();   showScreen('agenda');   return; }
  if(prev === 'app'      && blocks.length)                       { renderApp();      showScreen('app');      return; }
  if(prev === 'progress' && typeof renderProgress === 'function'){ renderProgress(); showScreen('progress'); return; }
  showScreen('home'); renderHome();
}

/* ---- Calculate per-block start/end times from D.bb + plannerStartTime ---- */
function plnCalcTimes(){
  const [h, m] = (plannerStartTime || '09:00').split(':').map(Number);
  let cursor = (h || 0) * 60 + (m || 0);
  return (D.bb || []).map(b => {
    const start = cursor;
    cursor += (b.mins || 5);
    return { startMin: start, endMin: cursor };
  });
}

function plnMinToStr(totalMin){
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return padT(h, m);
}

/* ---- Re-render the whole planner screen ---- */
function renderPlanner(){
  // Labels
  document.getElementById('plnTitle').textContent = T('dpl_title');
  document.getElementById('plnBackLbl').textContent = T('back');
  document.getElementById('plnDupBtn').title = T('dpl_duplicate');
  document.getElementById('psStartLbl').textContent = T('dpl_start');
  document.getElementById('psPlannedLbl').textContent = T('dpl_planned');
  document.getElementById('psDoneLbl').textContent = T('dpl_endtime');
  document.getElementById('pqLabel').textContent = T('dpl_quick_blocks');
  document.getElementById('pqF25').textContent = T('dpl_add_focus_25');
  document.getElementById('pqF50').textContent = T('dpl_add_focus_50');
  document.getElementById('pqP5').textContent  = T('dpl_add_pause_5');
  document.getElementById('pqP15').textContent = T('dpl_add_pause_15');
  document.getElementById('pqCustom').textContent = T('dpl_add_custom');
  document.getElementById('plnStartBtn').textContent = T('dpl_start_btn');

  // Start time input — always synced
  const startInput = document.getElementById('plnStartInput');
  if(startInput && document.activeElement !== startInput)
    startInput.value = plannerStartTime;
  const endInput = document.getElementById('plnEndInput');
  if(endInput && document.activeElement !== endInput)
    endInput.value = plannerEndTime || '';

  // Totals
  const times = plnCalcTimes();
  const totalFocusMins = (D.bb || []).filter(b => !b.isPause).reduce((s, b) => s + (b.mins || 0), 0);
  const totalAllMins   = (D.bb || []).reduce((s, b) => s + (b.mins || 0), 0);
  document.getElementById('psPlannedVal').textContent = totalFocusMins ? fmtDur(totalFocusMins) : '—';
  const lastEndMin = times.length ? times[times.length - 1].endMin : null;
  document.getElementById('psDoneVal').textContent = lastEndMin != null ? plnMinToStr(lastEndMin) : '—';

  // End-time warning
  const statsEl = document.getElementById('plnStats');
  if(plannerEndTime && lastEndMin != null){
    const [eh, em] = plannerEndTime.split(':').map(Number);
    const endTargetMin = eh * 60 + em;
    statsEl.classList.toggle('over-time', lastEndMin > endTargetMin);
  } else {
    statsEl.classList.remove('over-time');
  }

  // Timeline
  const body = document.getElementById('plannerBlocks'); body.innerHTML = '';
  if(!D.bb || !D.bb.length){
    const em = document.createElement('div'); em.className = 'planner-empty';
    em.innerHTML = `<div style="font-size:2rem;margin-bottom:12px">📋</div>${esc(T('dpl_empty'))}`;
    body.appendChild(em);
  } else {
    D.bb.forEach((b, i) => {
      const t = times[i];
      const isPause = !!b.isPause;
      const row = document.createElement('div');
      row.className = 'pln-block block-item' + (isPause ? ' is-pause' : '');

      const timeStr = plnMinToStr(t.startMin);
      const timeEndStr = plnMinToStr(t.endMin);
      const tasksDone = (b.tasks || []).filter(tk => tk.done).length;
      const tasksTotal = (b.tasks || []).filter(tk => tk.text).length;
      const subjColor = !isPause && b.subject ? colorFor(b.subject) : null;

      // Subject chips for focus blocks (inline quick-pick)
      let inlineSubjHtml = '';
      if(!isPause && subjects.length){
        const chipHtml = subjects.slice(0,4).map(s =>
          `<button class="pln-subj-chip${b.subject === s.name ? ' active' : ''}" onclick="event.stopPropagation();plnSetSubj(${i},'${s.name.replace(/'/g,"\\'")}');return false;" style="${b.subject === s.name ? 'border-color:' + colorFor(s.name) + ';color:' + colorFor(s.name) : ''}">${esc(s.name)}</button>`
        ).join('');
        inlineSubjHtml = `<div class="pln-subj-row">${chipHtml}</div>`;
      }

      row.innerHTML = `
        <div class="pln-time">${timeStr}<br><span class="pln-time-end">${timeEndStr}</span></div>
        <div class="pln-line"><div class="pln-dot"${subjColor ? ` style="background:${subjColor};box-shadow:0 0 8px ${subjColor}40"` : ''}></div></div>
        <div class="pln-card" onclick="openBlockDetail(${i})">
          <div class="pln-card-top">
            <div class="pln-card-left">
              <span class="pln-badge ${isPause ? 'pause' : 'focus'}">${fmtDur(b.mins || 5)}</span>
              <div class="pln-block-name"${subjColor ? ` style="color:${subjColor}"` : ''}>${esc(isPause ? T('dpl_type_pause') : (b.subject || T('dpl_type_focus')))}</div>
            </div>
            <div class="pln-card-actions">
              ${tasksTotal ? `<span class="pln-task-pill">${tasksDone}/${tasksTotal}</span>` : ''}
              <span class="pln-dur-chip" onclick="event.stopPropagation();plnChangeDur(${i},-5)" title="-5 min">−</span>
              <span class="pln-dur-val">${b.mins}m</span>
              <span class="pln-dur-chip" onclick="event.stopPropagation();plnChangeDur(${i},5)" title="+5 min">+</span>
              <span class="pln-drag-handle bb-drag-handle" title="${T('drag_to_move')}">⠿</span>
            </div>
          </div>
          ${b.note ? `<div class="pln-block-note">${esc(b.note.substring(0,80))}${b.note.length > 80 ? '…' : ''}</div>` : ''}
          ${inlineSubjHtml}
        </div>`;

      body.appendChild(row);
    });

    // Wire drag-and-drop once on the container
    attachPointerDrag(
      body,
      () => [...body.querySelectorAll('.block-item')],
      (el) => [...body.querySelectorAll('.block-item')].indexOf(el),
      (fromIdx, toIdx) => {
        const insertAt = toIdx > fromIdx ? toIdx - 1 : toIdx;
        const moved = D.bb.splice(fromIdx, 1)[0];
        D.bb.splice(Math.max(0, insertAt), 0, moved);
        renderPlanner();
      }
    );
  }

  // Start button state
  const hasFocus = (D.bb || []).some(b => !b.isPause);
  document.getElementById('plnStartBtn').disabled = !hasFocus;
}

function plnSetSubj(idx, name){
  if(D.bb[idx]) D.bb[idx].subject = name;
  renderPlanner();
}

function plnChangeDur(idx, delta){
  const b = D.bb[idx]; if(!b) return;
  b.mins = Math.max(5, Math.min(240, (b.mins || 25) + delta));
  renderPlanner();
}

function onPlnStartChange(){
  const v = document.getElementById('plnStartInput').value;
  if(v) plannerStartTime = v;
  renderPlanner();
}
function onPlnEndChange(){
  const el = document.getElementById('plnEndInput');
  if(!el) return;
  plannerEndTime = el.value || '';
  renderPlanner();
}

/* ---- Quick-add helpers ---- */
function plnAddFocus(mins){
  if(!D.bb) D.bb = [];
  D.bb.push({subject:'', mins, note:'', note2:'', tasks:[], isPause:false});
  // Auto-append a break after a long focus block (≥45 min) if the last block isn't already a pause
  if(mins >= 45){
    const brMins = (S && S.short) ? S.short : 10;
    D.bb.push({subject:'__pause__', mins: brMins, note:'', tasks:[], isPause:true});
  }
  renderPlanner();
}
function plnAddPause(mins){
  if(!D.bb) D.bb = [];
  D.bb.push({subject:'__pause__', mins, note:'', tasks:[], isPause:true});
  renderPlanner();
}
function plnAddCustom(){
  const m = parseInt(prompt(T('dpl_duration') + ' (min):', '30'), 10);
  if(m > 0 && m <= 240){ plnAddFocus(Math.min(m, 240)); }
}

/* ---- Duplicate day ---- */
function duplicatePlan(){
  if(!D.bb || !D.bb.length){ banner(T('dpl_empty')); return; }
  D.bb = D.bb.map(b => ({...b, done:false, status:null, tasks:(b.tasks||[]).map(t => ({...t, done:false}))}));
  plannerStartTime = nowRounded5();
  renderPlanner();
  banner(T('plan_duplicated'));
}

/* ════════ BLOCK DETAIL MODAL ════════ */
function openBlockDetail(idx){
  _editingBlockIdx = idx;
  const b = D.bb[idx];
  if(!b) return;

  document.getElementById('bdTitle').textContent = T('dpl_block_detail');
  document.getElementById('bdSaveBtn').textContent = T('done');
  document.getElementById('bdDeleteBtn').textContent = T('del_lbl');

  const body = document.getElementById('bdBody');
  body.className = 'bd-body modal-body';

  // Type toggle
  const typeRow = `
    <div>
      <div class="bd-type-row">
        <button class="bd-type-btn ${!b.isPause ? 'active' : ''}" id="bdTypeFocus" onclick="bdSetType(false)">${T('dpl_type_focus')}</button>
        <button class="bd-type-btn ${b.isPause ? 'active' : ''}" id="bdTypePause" onclick="bdSetType(true)">${T('dpl_type_pause')}</button>
      </div>
    </div>`;

  // Duration stepper
  const durRow = `
    <div class="bd-dur-row">
      <div class="bd-dur-lbl">${T('dpl_duration')}</div>
      <div class="bd-dur-ctrl">
        <button class="bd-dur-minus" onclick="bdChangeDur(-5)">−</button>
        <div class="bd-dur-val" id="bdDurVal">${b.mins} min</div>
        <button class="bd-dur-plus" onclick="bdChangeDur(5)">+</button>
      </div>
    </div>`;

  // Subject chips (only for focus blocks)
  let subjSection = '';
  if(!b.isPause){
    const chips = subjects.map(s =>
      `<button class="bd-subj-chip ${b.subject === s.name ? 'active' : ''}" onclick="bdPickSubj('${esc(s.name)}')">${esc(s.name)}</button>`
    ).join('');
    subjSection = `
      <div>
        <div class="bd-field-lbl">${T('pick_subject')}</div>
        ${chips ? `<div class="bd-subj-chips">${chips}</div>` : ''}
        <input class="bd-subj-input" id="bdSubjInput" type="text" placeholder="${T('custom_subject')}" value="${esc(b.subject || '')}" oninput="bdSubjInputChange(this.value)">
      </div>`;
  }

  // Note (What)
  const noteSection = !b.isPause ? `
    <div>
      <div class="bd-field-lbl">${T('dpl_what')}</div>
      <textarea class="bd-note" id="bdNote" rows="2" placeholder="${T('note_ph')}">${esc(b.note || '')}</textarea>
    </div>` : '';

  // How
  const howSection = !b.isPause ? `
    <div>
      <div class="bd-field-lbl">${T('dpl_how')}</div>
      <textarea class="bd-note" id="bdHow" rows="2" placeholder="${T('note_ph')}">${esc(b.note2 || '')}</textarea>
    </div>` : '';

  // To-dos
  const todosSection = !b.isPause ? `
    <div>
      <div class="bd-field-lbl">${T('tasks_lbl')}</div>
      <div class="bd-todos" id="bdTodos"></div>
      <button class="bd-add-todo" onclick="bdAddTodo()">${T('dpl_add_todo')}</button>
    </div>` : '';

  body.innerHTML = typeRow + durRow + subjSection + noteSection + howSection + todosSection;

  // Render todos
  if(!b.isPause) _bdRenderTodos(b.tasks || []);

  document.getElementById('blockDetailOv').classList.add('open');
}

function _bdRenderTodos(tasks){
  const container = document.getElementById('bdTodos');
  if(!container) return;
  container.innerHTML = '';
  tasks.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'bd-todo-row';
    row.innerHTML = `
      <input type="checkbox" class="bd-todo-check" ${t.done ? 'checked' : ''} onchange="bdToggleTodo(${i}, this.checked)">
      <input type="text" class="bd-todo-input" value="${esc(t.text)}" placeholder="${T('task_ph')}" oninput="bdEditTodo(${i}, this.value)">
      <button class="bd-todo-del" onclick="bdRemoveTodo(${i})" title="${T('del_lbl')}">✕</button>`;
    container.appendChild(row);
  });
}

function bdSetType(isPause){
  const b = D.bb[_editingBlockIdx]; if(!b) return;
  b.isPause = isPause;
  if(isPause){ b.subject = '__pause__'; }
  openBlockDetail(_editingBlockIdx); // re-render modal
}

function bdChangeDur(delta){
  const b = D.bb[_editingBlockIdx]; if(!b) return;
  b.mins = Math.max(5, Math.min(240, (b.mins || 25) + delta));
  const v = document.getElementById('bdDurVal');
  if(v) v.textContent = b.mins + ' min';
}

function bdPickSubj(name){
  const b = D.bb[_editingBlockIdx]; if(!b) return;
  b.subject = name;
  // update chips
  document.querySelectorAll('.bd-subj-chip').forEach(ch => ch.classList.toggle('active', ch.textContent === name));
  const inp = document.getElementById('bdSubjInput');
  if(inp) inp.value = name;
}

function bdSubjInputChange(val){
  const b = D.bb[_editingBlockIdx]; if(!b) return;
  b.subject = val;
  document.querySelectorAll('.bd-subj-chip').forEach(ch => ch.classList.toggle('active', ch.textContent === val));
}

function bdAddTodo(){
  const b = D.bb[_editingBlockIdx]; if(!b) return;
  if(!b.tasks) b.tasks = [];
  b.tasks.push({text:'', done:false});
  _bdRenderTodos(b.tasks);
}
function bdEditTodo(i, val){
  const b = D.bb[_editingBlockIdx]; if(!b || !b.tasks) return;
  if(b.tasks[i]) b.tasks[i].text = val;
}
function bdToggleTodo(i, done){
  const b = D.bb[_editingBlockIdx]; if(!b || !b.tasks) return;
  if(b.tasks[i]) b.tasks[i].done = done;
}
function bdRemoveTodo(i){
  const b = D.bb[_editingBlockIdx]; if(!b || !b.tasks) return;
  b.tasks.splice(i, 1);
  _bdRenderTodos(b.tasks);
}

function saveBlockDetail(){
  const b = D.bb[_editingBlockIdx]; if(!b) { closeBlockDetail(); return; }
  // read text fields that don't use oninput (belt-and-suspenders)
  const noteEl = document.getElementById('bdNote');
  const howEl  = document.getElementById('bdHow');
  const subjEl = document.getElementById('bdSubjInput');
  if(noteEl) b.note  = noteEl.value;
  if(howEl)  b.note2 = howEl.value;
  if(subjEl && !b.isPause) b.subject = subjEl.value;
  // Auto-add a new subject if user typed something new
  if(b.subject && !b.isPause){
    const name = b.subject.trim();
    if(name && !subjects.some(s => s.name.toLowerCase() === name.toLowerCase())){
      addSubject(name);
      if(typeof banner === 'function') banner(Tf('subj_added', {name}));
    }
  }
  closeBlockDetail();
}

function closeBlockDetail(){
  document.getElementById('blockDetailOv').classList.remove('open');
  renderPlanner();
}

function deleteEditingBlock(){
  if(_editingBlockIdx < 0) return;
  D.bb.splice(_editingBlockIdx, 1);
  _editingBlockIdx = -1;
  document.getElementById('blockDetailOv').classList.remove('open');
  renderPlanner();
}

/* ---- Start from planner → commit blocks ---- */
function startFromPlanner(){
  if(!D.bb || !D.bb.some(b => !b.isPause)){ banner(T('dpl_empty')); return; }

  // Build blocks array for the session
  blocks = D.bb.map(b => ({
    id: nid++,
    subject: b.isPause ? '__pause__' : (b.subject || T('dpl_type_focus')),
    mins: b.mins || (b.isPause ? 10 : 50),
    note: b.note || '',
    tasks: (b.tasks || []).filter(t => t.text).map(t => ({text:t.text, done:false})),
    done: false, status: null,
    isPause: !!b.isPause
  }));

  // Derive focus duration from the most common focus block length
  const focLens = blocks.filter(b => !b.isPause).map(b => b.mins);
  const focMode = focLens.sort((a,b) => focLens.filter(v => v===a).length - focLens.filter(v => v===b).length).pop();
  S.focus = focMode || 50;

  // Save lastPlan
  lastPlan = {
    focus: S.focus, short: S.short, long: S.long, longAfter: S.longAfter,
    blocks: D.bb.map(b => ({subject:b.subject, mins:b.mins, note:b.note, tasks:b.tasks, isPause:b.isPause}))
  };

  // If planning for a future date (from agenda), save to dayPlans instead of starting
  if(_planningForDate && _planningForDate !== todayStr() && _planningForDate !== studyDayStr()){
    dayPlans[_planningForDate] = { startTime: plannerStartTime || '09:00', blocks: blocks.map(b => ({...b})) };
    _planningForDate = null;
    D.bb = [];
    saveData();
    banner(T('agenda_plan_day') + ' ✓');
    goAgenda();
    return;
  }
  _planningForDate = null;

  initDay(); saveData();
  D.bb = []; // clear planner draft
  goApp();
}
