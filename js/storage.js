/* ══════════════════════════════════════════════════════
   FocusBlock — storage.js
   Persistence: localStorage + IndexedDB fallback, data
   export/import, reset.
   ══════════════════════════════════════════════════════ */

function buildPayload(){
  return {
    v:2, onboarded, name:userName, subjects, lastPlan,
    focus:S.focus, short:S.short, long:S.long, longAfter:S.longAfter,
    theme:S.theme, light:S.light, sound:S.sound, tips:S.tips, lang:S.lang,
    bgPhoto:S.bgPhoto, ambient:S.ambient, timerLayout:S.timerLayout, animLevel:S.animLevel,
    companion:S.companion, companionName:S.companionName, companionVis:S.companionVis,
    companionTone:S.companionTone, companionSound:S.companionSound,
    streak, lastDay, lifetimeBlocks, lifetimeMins, lifetimeFocusPoints, houseProgress,
    history, subjectTotals,
    examDates, dayPlans,
    // active day (so refresh mid-session doesn't lose the day)
    activeDay: blocks.length ? {
      date:studyDayStr(), blocks, curBlock, curPhase, timeLeft, totalTime,
      endTimestamp: running ? endTimestamp : 0,
      sessComp, completedMins, currentSessionMins, dayCounted, running:false
    } : null
  };
}

function idbOpen(){
  return new Promise((res,rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(d){
  try {
    const db = await idbOpen();
    return new Promise((res) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(d, 'data');
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch(e){}
}
async function idbGet(){
  try {
    const db = await idbOpen();
    return new Promise((res) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const rq = tx.objectStore(DB_STORE).get('data');
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => res(null);
    });
  } catch(e){ return null; }
}

let saveT = null;
function saveData(){
  const d = buildPayload();
  try{ localStorage.setItem(LS_KEY, JSON.stringify(d)); }catch(e){}
  clearTimeout(saveT);
  saveT = setTimeout(() => idbSet(d), 400);
}

function loadLocal(){
  try{ const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; }
  catch(e){ return null; }
}

function applyLoaded(d){
  if(!d) return;
  onboarded = !!d.onboarded;
  userName = d.name || '';
  subjects = Array.isArray(d.subjects) ? d.subjects : [];
  lastPlan = d.lastPlan || null;
  S.focus = d.focus ?? S.focus; S.short = d.short ?? S.short; S.long = d.long ?? S.long; S.longAfter = d.longAfter ?? S.longAfter;
  S.theme = d.theme || S.theme; S.light = !!d.light; S.sound = d.sound || S.sound;
  S.tips = d.tips !== undefined ? d.tips : S.tips; S.lang = d.lang || S.lang;
  S.bgPhoto = d.bgPhoto || ''; S.ambient = d.ambient || 'none'; S.timerLayout = d.timerLayout || 'ring'; S.animLevel = d.animLevel || 'balanced';
  S.companion = d.companion || S.companion; S.companionName = d.companionName || ''; S.companionVis = d.companionVis || 'focus';
  S.companionTone = d.companionTone || 'friendly'; S.companionSound = d.companionSound || 'off';
  streak = d.streak || 0; lastDay = d.lastDay || null;
  lifetimeBlocks = d.lifetimeBlocks || 0; lifetimeMins = d.lifetimeMins || 0;
  lifetimeFocusPoints = d.lifetimeFocusPoints || 0; houseProgress = d.houseProgress || 0;
  history = Array.isArray(d.history) ? d.history : [];
  subjectTotals = d.subjectTotals || {};
  examDates = Array.isArray(d.examDates) ? d.examDates : [];
  dayPlans = (d.dayPlans && typeof d.dayPlans === 'object') ? d.dayPlans : {};
  // restore active day — uses studyDayStr (4am boundary) so sessions past midnight still restore
  if(d.activeDay && d.activeDay.date === studyDayStr() && Array.isArray(d.activeDay.blocks) && d.activeDay.blocks.length){
    const a = d.activeDay;
    blocks = a.blocks; curBlock = a.curBlock || 0; curPhase = a.curPhase || 'focus';
    totalTime = a.totalTime || phaseDur(curPhase);
    // if a real endTimestamp was saved (timer was running when page closed), recalculate timeLeft from wall clock
    if(a.endTimestamp && a.endTimestamp > Date.now()){
      endTimestamp = a.endTimestamp;
      timeLeft = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000));
    } else {
      timeLeft = a.timeLeft ?? totalTime;
    }
    sessComp = a.sessComp || 0; completedMins = a.completedMins || 0;
    currentSessionMins = a.currentSessionMins || 0;
    dayCounted = a.dayCounted || false; running = false;
    // re-id blocks to keep nid unique
    blocks.forEach(b => { b.id = nid++; });
    _restoredDay = true;
  }
}

function finalizeDayHistory(){
  const t = studyDayStr();  // use study-day (4am boundary) so post-midnight sessions land on the right date
  const doneBlocks = blocks.filter(b => b.done && !b.isPause);
  if(!doneBlocks.length) return;
  const subjMap = {};
  doneBlocks.forEach(b => { const s = b.subject || T('phase_focus'); subjMap[s] = (subjMap[s] || 0) + b.mins; });
  let h = history.find(x => x.date === t);
  if(h){ h.blocks = doneBlocks.length; h.mins = completedMins; h.subjects = subjMap; }
  else history.push({date:t, blocks:doneBlocks.length, mins:completedMins, subjects:subjMap});
  // clear active day so it doesn't restore tomorrow
  blocks = []; // keep lastPlan
  saveData();
}

function exportData(){
  const data = buildPayload();
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'focusblock-backup-' + todayStr() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  banner(T('set_data_export'));
}

function importData(file){
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if(!d || (d.v !== 2 && !d.onboarded && !d.name && !d.history)) throw new Error('bad');
      applyLoaded(d); saveData();
      applyLang(); applyBodyClass(); applyAnimLevel();
      closeSettings();
      goHome();
      banner(T('set_data_import'));
    } catch(e){ banner(T('invalid_backup')); }
  };
  rd.readAsText(file);
}

function askReset(){
  showConfirm('⚠', T('reset_t'), T('reset_msg'), T('reset_cancel'), T('reset_confirm'),
    () => { doReset(); });
}

function doReset(){
  try{ localStorage.removeItem(LS_KEY); }catch(e){}
  idbSet(null);
  location.reload();
}
