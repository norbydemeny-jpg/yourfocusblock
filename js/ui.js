/* ══════════════════════════════════════════════════════
   FocusBlock — ui.js
   Banner toast, confirm modal, reward card, recap,
   confetti, pointer drag helper.
   ══════════════════════════════════════════════════════ */

/* ---- Banner toast ---- */
let bannerT = null;
function banner(msg){
  const el = document.getElementById('banner');
  el.textContent = msg; el.classList.add('show');
  if(bannerT) clearTimeout(bannerT);
  bannerT = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---- Confirm modal ---- */
let _confirmQuit = null, _confirmStay = null;
function showConfirm(icon, title, msg, stayLbl, quitLbl, onQuit, onStay){
  document.getElementById('cfIcon').textContent = icon;
  document.getElementById('cfTitle').textContent = title;
  document.getElementById('cfMsg').textContent = msg;
  document.getElementById('cfStay').textContent = stayLbl;
  document.getElementById('cfQuit').textContent = quitLbl;
  _confirmQuit = onQuit; _confirmStay = onStay;
  document.getElementById('confirmOv').classList.add('open');
}
function confirmStay(){ document.getElementById('confirmOv').classList.remove('open'); if(_confirmStay) _confirmStay(); _confirmQuit = _confirmStay = null; }
function confirmQuit(){ document.getElementById('confirmOv').classList.remove('open'); const f = _confirmQuit; _confirmQuit = _confirmStay = null; if(f) f(); }

/* ---- Reward card ---- */
function showReward(b, mins){
  playChime(true);
  const idx = villageStageIdx(houseProgress);
  const nextStage = VILLAGE_STAGES[idx+1];
  let buildPct;
  if(nextStage){ const prev = VILLAGE_STAGES[idx].at; buildPct = Math.round(((houseProgress-prev)/(nextStage.at-prev))*100); }
  else buildPct = 100;
  const subj = (b && b.subject) ? b.subject : T('phase_focus');
  // milestone confetti
  const milestone = VILLAGE_STAGES.some(v => v.at === houseProgress) && houseProgress > 0;
  const nextBlock = blocks.find(x => !x.done && !x.skipped && x !== b);
  document.getElementById('rewardBody').innerHTML = `
    <div style="text-align:center;">
      <div class="reward-cheer">${esc(T('reward_cheer'))}</div>
      <div class="reward-sub">${esc(Tf('reward_sub',{min:mins}))}</div>
    </div>
    <div class="reward-grid">
      <div class="reward-stat"><div class="reward-v">+1</div><div class="reward-l">${esc(T('reward_block'))}</div></div>
      <div class="reward-stat"><div class="reward-v">+10</div><div class="reward-l">${esc(T('reward_focus'))}</div></div>
      <div class="reward-stat"><div class="reward-v">🔥${streak}</div><div class="reward-l">${esc(T('reward_streak'))}</div></div>
    </div>
    <div class="reward-build">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);">
        <span>${esc(Tf('reward_build',{pct:buildPct}))}</span>
        <span>${esc(T(nextStage ? nextStage.k : 'vs_village'))}</span>
      </div>
      <div class="reward-build-bar"><div class="reward-build-fill" style="width:0%"></div></div>
    </div>
    <div style="font-size:12px;color:var(--muted);text-align:center;margin-bottom:.8rem;">${esc(T('reward_reflect'))}</div>
    <div class="reflect-chips" id="reflectChips">
      <button class="reflect-chip" data-r="well">${esc(T('reflect_well'))}</button>
      <button class="reflect-chip" data-r="partial">${esc(T('reflect_partial'))}</button>
      <button class="reflect-chip" data-r="struggled">${esc(T('reflect_struggled'))}</button>
    </div>
    ${nextBlock ? `<div style="text-align:center;font-size:13px;color:var(--mid);margin-bottom:1rem;">${esc(Tf('reward_next',{name:nextBlock.subject||T('phase_focus')}))}</div>` : ''}
    <div class="cf-btns">
      <button class="cf-stay" id="rwBreak">${esc(T('reward_break_now'))}</button>
      <button class="cf-quit" id="rwCont">${esc(T('reward_continue'))}</button>
    </div>`;
  document.getElementById('rewardOv').classList.add('open');
  setTimeout(() => { const fill = document.querySelector('.reward-build-fill'); if(fill) fill.style.width = buildPct+'%'; }, 120);
  document.querySelectorAll('#reflectChips .reflect-chip').forEach(c => c.onclick = () => {
    document.querySelectorAll('#reflectChips .reflect-chip').forEach(x => x.classList.toggle('on', x === c));
    if(b) b.status = c.dataset.r;
    saveData();
  });
  document.getElementById('rwBreak').onclick = () => continueFromReward(true);
  document.getElementById('rwCont').onclick = () => continueFromReward(false);
  if(milestone) confetti();
}
function closeReward(){ document.getElementById('rewardOv').classList.remove('open'); }

/* ---- Recap ---- */
function showRecap(){
  const total = completedMins;
  const doneBlocks = blocks.filter(b => b.done);
  const subs = [...new Set(doneBlocks.map(b => b.subject).filter(Boolean))];
  let tomorrow = blocks.find(b => b.skipped && b.subject);
  let tomName = tomorrow ? tomorrow.subject : (subs[subs.length-1] || '');
  document.getElementById('recapBody').innerHTML = `
    <div style="text-align:center;">
      <div class="reward-cheer">${esc(T('recap_t'))}</div>
      <div class="reward-sub">${esc(T('recap_sub'))}</div>
    </div>
    <div class="ready-card" style="margin-bottom:1.4rem;">
      <div class="rc-row"><div class="rc-ico">✓</div><div><div class="rc-val">${esc(Tf('recap_blocks',{n:doneBlocks.length}))}</div></div></div>
      <div class="rc-row"><div class="rc-ico">◷</div><div><div class="rc-val">${esc(Tf('recap_time',{t:fmtDur(total)}))}</div></div></div>
      ${subs.length ? `<div class="rc-row"><div class="rc-ico">≡</div><div><div class="rc-val">${esc(Tf('recap_subj',{list:subs.join(', ')}))}</div></div></div>` : ''}
    </div>
    ${tomName ? `<div class="reward-build" style="margin-bottom:1.4rem;"><div class="reward-l" style="margin:0 0 6px;">${esc(T('recap_tomorrow'))}</div><div style="font-size:13.5px;color:var(--mid);line-height:1.5;">${esc(Tf('recap_tom_msg',{name:tomName}))}</div></div>` : ''}
    <div class="cf-btns"><button class="cf-stay" id="recapDone">${esc(T('recap_close'))}</button></div>`;
  document.getElementById('recapOv').classList.add('open');
  document.getElementById('recapDone').onclick = () => { document.getElementById('recapOv').classList.remove('open'); goHome(); };
  confetti();
}

/* ---- Confetti (lightweight, milestone celebrations) ---- */
function confetti(){
  if(S.animLevel === 'minimal') return;
  // Bug fix: use prototype check instead of instance check
  if(typeof HTMLElement.prototype.animate !== 'function') return;
  const n = 60, c = document.createElement('div');
  c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:300;overflow:hidden;';
  const acc = getCSS('--accent');
  const cols = [acc, '#fcd34d', '#fb7185', '#67e8f9', '#c084fc'];
  for(let i = 0; i < n; i++){
    const p = document.createElement('div');
    const sz = 6 + Math.random() * 7;
    p.style.cssText = `position:absolute;top:-20px;left:${Math.random()*100}%;width:${sz}px;height:${sz}px;background:${cols[i%cols.length]};border-radius:${Math.random()>.5?'50%':'2px'};opacity:.9;`;
    c.appendChild(p);
    const dur = 1800 + Math.random() * 1400, x = (Math.random()-0.5) * 240;
    p.animate(
      [{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${x}px,${window.innerHeight+60}px) rotate(${Math.random()*720}deg)`,opacity:.7}],
      {duration:dur, easing:'cubic-bezier(.3,.8,.6,1)'}
    );
  }
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 3400);
}

/* ── Reusable pointer drag for any list ─────────────────────────
   Calls onReorder(fromIdx, toIdx) when a drag completes.
   ──────────────────────────────────────────────────────────────── */
function attachPointerDrag(host, getItems, getIdx, onReorder){
  let ghost = null, srcEl = null, fromIdx = null, lastDropIdx = null, ghostOffY = 0;
  function calcDropIdx(y){
    const items = getItems();
    for(let i = 0; i < items.length; i++){
      const r = items[i].getBoundingClientRect();
      if(y < r.top + r.height/2) return i;
    }
    return items.length;
  }
  function showDropLine(dropIdx){
    host.querySelectorAll('.bb-drop-line').forEach(l => l.remove());
    const items = getItems();
    const line = document.createElement('div'); line.className = 'bb-drop-line';
    if(dropIdx >= items.length) host.appendChild(line);
    else items[dropIdx].before(line);
    lastDropIdx = dropIdx;
  }
  host.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.bb-drag-handle,.bi-drag');
    if(!handle) return;
    const item = handle.closest('.bb-card,.block-item');
    if(!item) return;
    e.preventDefault();
    srcEl = item; fromIdx = getIdx(item);
    const r = item.getBoundingClientRect();
    ghostOffY = e.clientY - r.top;
    ghost = item.cloneNode(true);
    ghost.classList.add('touch-drag-ghost');
    ghost.style.cssText += `;position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;pointer-events:none;z-index:9999;`;
    document.body.appendChild(ghost);
    item.style.opacity = '0.25';
    lastDropIdx = null;
    try{ host.setPointerCapture(e.pointerId); }catch(err){}
  }, {passive:false});
  host.addEventListener('pointermove', (e) => {
    if(fromIdx === null || !ghost) return;
    e.preventDefault();
    ghost.style.top = (e.clientY - ghostOffY) + 'px';
    const drop = calcDropIdx(e.clientY);
    const eff = drop > fromIdx ? drop-1 : drop;
    if(eff !== fromIdx){ showDropLine(drop); }
    else{ host.querySelectorAll('.bb-drop-line').forEach(l => l.remove()); lastDropIdx = null; }
  }, {passive:false});
  function endDrag(){
    if(fromIdx === null) return;
    if(ghost){ ghost.remove(); ghost = null; }
    host.querySelectorAll('.bb-drop-line').forEach(l => l.remove());
    getItems().forEach(el => el.style.opacity = '');
    if(srcEl) srcEl.style.opacity = '';
    if(lastDropIdx !== null && lastDropIdx !== fromIdx) onReorder(fromIdx, lastDropIdx);
    fromIdx = null; lastDropIdx = null; srcEl = null;
  }
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', endDrag);
}
