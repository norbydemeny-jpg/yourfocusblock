/* ══════════════════════════════════════════════════════
   FocusBlock — timer.js
   Timer engine: phases, start/pause/stop/tick, skip,
   reward flow, motivational text, companion, chime.
   ══════════════════════════════════════════════════════ */

function phaseDur(ph){
  if(ph === 'focus'){
    const b = curB();
    if(b && b.isPause) return b.mins * 60; // pause block duration
    return (b && b.mins ? b.mins : S.focus) * 60;
  }
  if(ph === 'short') return S.short * 60;
  return S.long * 60;
}

function setPhase(ph, resetOnly){
  // if entering focus and current block is a pause block, treat it as a long-style break
  const b = curB();
  if(ph === 'focus' && b && b.isPause){
    curPhase = 'pause-block';
  } else {
    curPhase = ph;
  }
  totalTime = phaseDur(ph);
  timeLeft = totalTime;
  running = false;
  if(iv){ clearInterval(iv); iv = null; }
  applyPhaseClass();
  renderApp();
}

function applyPhaseClass(){
  document.body.classList.remove('ph-focus','ph-short','ph-long');
  const ph = curPhase === 'pause-block' ? 'long' : curPhase;
  document.body.classList.add('ph-' + ph);
}

function manualPhase(ph){
  if(running){ return; } // don't switch mid-run silently
  setPhase(ph, true);
}

function startTimer(){
  if(running || timeLeft <= 0) return;
  running = true;
  requestNotifPerm();
  endTimestamp = Date.now() + timeLeft * 1000;
  if(iv) clearInterval(iv);
  iv = setInterval(tick, 250);
  acquireWakeLock();
  document.body.classList.add('running');
  updatePlayBtn(); updateEndsPill(); updateMotiv(); renderCompanionStage();
}

function pauseTimer(){
  running = false;
  if(iv){ clearInterval(iv); iv = null; }
  releaseWakeLock();
  document.body.classList.remove('running');
  updatePlayBtn(); updateEndsPill(); updateMotiv(); renderCompanionStage();
}

function stopTimer(){
  running = false;
  if(iv){ clearInterval(iv); iv = null; }
  releaseWakeLock();
  document.body.classList.remove('running');
}

function tick(){
  const now = Date.now();
  timeLeft = Math.max(0, Math.round((endTimestamp - now) / 1000));
  if(curPhase === 'focus'){
    const elapsed = (totalTime - timeLeft) / 60;
    currentSessionMins = Math.max(0, Math.min((curB()?.mins || S.focus), Math.round(elapsed)));
  }
  drawRing(); updateTimeText();
  if(curPhase === 'focus') renderDayBar();
  if(timeLeft <= 0){ phaseComplete(); }
}

function toggleTimer(){
  if(running){
    // soft pause confirm
    askPause();
  } else {
    startTimer();
  }
}

function askPause(){
  if(curPhase !== 'focus'){ pauseTimer(); return; }
  const minIn = Math.round((totalTime - timeLeft) / 60);
  const leftMin = Math.ceil(timeLeft / 60);
  const title = S.lang === 'nl' ? T('pause_t') : T('pause_t_en');
  showConfirm('⏸', title,
    Tf('pause_msg', {min:minIn, left:leftMin}),
    T('pause_continue'), T('pause_pause'),
    () => { pauseTimer(); });
}

function resetTimer(){
  stopTimer();
  if(curPhase === 'focus') currentSessionMins = 0;
  setPhase(curPhase, true);
}

/* ---- phase completed naturally (timer hit 0) ---- */
function phaseComplete(){
  stopTimer();
  playChime();
  // flash the ring
  const rw = document.getElementById('ringWrap');
  if(rw){ rw.classList.remove('flash'); void rw.offsetWidth; rw.classList.add('flash'); setTimeout(() => rw.classList.remove('flash'), 900); }
  if(curPhase === 'focus'){
    sendNotif('🎯 ' + T('phase_focus') + '!', curB() && curB().subject ? `${curB().subject} — ${T('reward_cheer')}` : T('break_short_msg'));
  } else {
    sendNotif('⏰ ' + T('phase_short') + '!', T('m_ready'));
  }
  if(curPhase === 'focus'){
    const b = curB();
    // if it's a pause block, just advance
    if(b && b.isPause){
      b.done = true;
      advanceAfterBreak();
      return;
    }
    const mins = b ? b.mins : S.focus;
    // count it ONCE
    completedMins += mins; currentSessionMins = 0;
    sessComp++;
    if(b){ b.done = true; }
    lifetimeBlocks++; lifetimeMins += mins; lifetimeFocusPoints += 10; houseProgress++;
    // subject totals
    const subj = (b && b.subject && !b.isPause) ? b.subject : T('phase_focus');
    subjectTotals[subj] = (subjectTotals[subj] || 0) + mins;
    bumpStreakIfFirst();
    saveData();
    checkInvitePopup();
    showReward(b, mins);
  } else if(curPhase === 'pause-block'){
    // pause block timer ended
    const b = curB();
    if(b){ b.done = true; }
    saveData();
    advanceAfterBreak();
  } else {
    // break ended -> advance to next focus
    advanceAfterBreak();
  }
}

function bumpStreakIfFirst(){
  const t = studyDayStr();  // study-day boundary (4am) keeps streak consistent for late-night sessions
  if(lastDay !== t){
    if(lastDay && daysBetween(lastDay, t) === 1) streak++;
    else streak = 1;
    lastDay = t;
  } else if(streak === 0){ streak = 1; }
}

/* ---- after reward: continue to break or next focus ---- */
function continueFromReward(takeBreak){
  closeReward();
  // are all focus blocks done?
  const remaining = blocks.filter(b => !b.done && !b.skipped && !b.isPause).length;
  if(remaining === 0){
    finalizeDayHistory();
    showRecap();
    return;
  }
  // move to next undone block index
  const nextIdx = blocks.findIndex(b => !b.done && !b.skipped);
  if(takeBreak){
    // check if next block is a pause block — use it directly
    if(nextIdx >= 0 && blocks[nextIdx] && blocks[nextIdx].isPause){
      curBlock = nextIdx; setPhase('focus', true); startTimer();
    } else {
      // long break every longAfter sessions, otherwise short
      const ph = (sessComp > 0 && sessComp % S.longAfter === 0) ? 'long' : 'short';
      curBlock = nextIdx >= 0 ? nextIdx : curBlock; // upcoming block shown after the break
      setPhase(ph, true);
      startTimer();
    }
  } else {
    curBlock = nextIdx >= 0 ? nextIdx : curBlock; setPhase('focus', true);
    renderApp();
  }
  saveData();
}

function advanceAfterBreak(){
  const nextIdx = blocks.findIndex(b => !b.done && !b.skipped);
  if(nextIdx < 0){ finalizeDayHistory(); showRecap(); return; }
  curBlock = nextIdx; setPhase('focus', true);
  renderApp();
}

/* ---- skip — does NOT count as done ---- */
function skipPhase(){
  const wasRunning = running;
  if(wasRunning) pauseTimer();
  // pause blocks: skip immediately without confirm dialog
  if(curPhase === 'pause-block' || (curPhase === 'focus' && curB() && curB().isPause)){
    doSkipPauseBlock();
    return;
  }
  showConfirm('↷', T('skip_t'), T('skip_msg'),
    T('skip_continue'), T('skip_confirm'),
    () => { doSkip(); },
    () => { if(wasRunning) startTimer(); });
}

function doSkipPauseBlock(){
  stopTimer();
  const b = curB();
  if(b) b.done = true; // mark pause as done (skipped through)
  advanceAfterBreak();
  saveData(); renderApp();
}

function doSkip(){
  stopTimer();
  currentSessionMins = 0;
  if(curPhase === 'focus'){
    // skip this focus block: mark as skipped (NOT done, no counting), move to next undone
    const b = curB();
    if(b) b.skipped = true;
    const nextIdx = blocks.findIndex((bl, i) => i > curBlock && !bl.done && !bl.skipped);
    if(nextIdx >= 0){ curBlock = nextIdx; setPhase('focus', true); }
    else {
      // no more focus blocks ahead
      const anyDone = blocks.some(bl => bl.done);
      if(anyDone){ finalizeDayHistory(); showRecap(); return; }
      setPhase('focus', true);
    }
  } else {
    advanceAfterBreak();
  }
  saveData(); renderApp();
}

/* ---- extend timer ---- */
function extendTimer(mins){
  const secs = mins * 60;
  timeLeft += secs;
  totalTime += secs;
  endTimestamp += secs * 1000;
  if(curB()) curB().mins += mins;
  saveData(); renderApp();
  banner(`+${mins} min toegevoegd`);
}

/* ---- motivational text ---- */
function updateMotiv(){
  const el = document.getElementById('motiv');
  if(S.companionTone === 'minimal' || curPhase !== 'focus'){ el.classList.remove('show'); el.textContent = ''; return; }
  let key = 'm_ready';
  if(running){
    const frac = totalTime > 0 ? (totalTime - timeLeft) / totalTime : 0;
    if(timeLeft <= 60*3 && frac > 0.6) key = 'm_near';
    else if(frac >= 0.72) key = 'm_three';
    else if(frac >= 0.5) key = 'm_half';
    else if(frac >= 0.25) key = 'm_quarter';
    else key = 'm_started';
  }
  el.textContent = T(key);
  requestAnimationFrame(() => el.classList.add('show'));
}

function companionState(){
  if(!running) return 'idle';
  return 'active';
}

function renderCompanionStage(){
  const host = document.getElementById('companionStage');
  if(!host) return;
  const show = (S.companionVis === 'focus' || S.companionVis === 'after') && S.companion !== 'none';
  if(!show || (S.companionVis === 'after' && running)){ host.innerHTML = ''; host.style.display = 'none'; return; }
  if(S.companionVis === 'prog' || S.companionVis === 'off'){ host.innerHTML = ''; host.style.display = 'none'; return; }
  host.style.display = 'flex';
  const acc = getCSS('--accent');
  const lvl = Math.min(4, Math.floor(houseProgress / 10));
  const st = companionState();
  host.innerHTML = companionSVG(S.companion, running ? 'active' : 'idle', acc, lvl);
}

/* ---- WebAudio chime ---- */
function playChime(reward){
  const mode = reward ? S.companionSound : S.sound;
  if(S.sound === 'off' && (!reward)) return;
  if(reward && S.companionSound === 'off' && S.sound === 'off') return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    const vol = (S.sound === 'full') ? 0.18 : 0.09;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const t = now + i * 0.12;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t+0.5);
      o.start(t); o.stop(t+0.55);
    });
  } catch(e){}
}
