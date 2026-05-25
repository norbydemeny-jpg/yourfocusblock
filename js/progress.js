/* ══════════════════════════════════════════════════════
   FocusBlock — progress.js
   Progress page rendering: lifetime stats, week chart,
   subject breakdown, village, companion.
   ══════════════════════════════════════════════════════ */

function backFromProgress(){
  if(progReturn === 'app' && blocks.length){ showScreen('app'); renderApp(); }
  else goHome();
}

const PROG_INTRO_KEY = 'fb_prog_intro_shown';

function renderProgress(){
  document.getElementById('progBackBtn').innerHTML = '← ' + esc(T('prog_back'));
  const host = document.getElementById('progBody');

  // First-time intro card
  let introHtml = '';
  if(!localStorage.getItem(PROG_INTRO_KEY)){
    introHtml = `<div class="prog-intro-card" id="progIntroCard">
      <div class="prog-intro-icon">📊</div>
      <div class="prog-intro-text">
        <div class="prog-intro-title">${esc(T('prog_open'))}</div>
        <div class="prog-intro-sub">${esc(T('prog_intro'))}</div>
      </div>
      <button class="prog-intro-close" onclick="dismissProgIntro()" title="${T('done')}">✕</button>
    </div>`;
  }

  // Lifetime stats with info tooltips
  const mkInfo = (tipKey) => `<span class="stat-info" tabindex="0" aria-label="${T(tipKey)}">ℹ<span class="stat-info-tip">${esc(T(tipKey))}</span></span>`;

  let html = introHtml + `<div class="prog-section">
    <div class="prog-sec-t">${esc(T('prog_lifetime'))}</div>
    <div class="prog-intro-line">${esc(T('prog_intro'))}</div>
    <div class="lifetime-row">
      <div class="lt-stat"><div class="lt-v">${lifetimeBlocks}</div><div class="lt-l">${esc(T('lt_blocks'))}${mkInfo('prog_tip_blocks')}</div></div>
      <div class="lt-stat"><div class="lt-v">${fmtDur(lifetimeMins)}</div><div class="lt-l">${esc(T('lt_focus'))}${mkInfo('prog_tip_focus')}</div></div>
      <div class="lt-stat"><div class="lt-v">🔥${streak}</div><div class="lt-l">${esc(T('lt_streak'))}${mkInfo('prog_tip_streak')}</div></div>
    </div>
  </div>`;
  html += renderWeekChart();
  html += renderSubjStats();
  html += renderVillage();
  html += renderCompanionProg();
  host.innerHTML = html;
  // animate bars
  setTimeout(() => { document.querySelectorAll('.wc-bar').forEach(b => { b.style.height = b.dataset.h + '%'; }); }, 100);
  setTimeout(() => { document.querySelectorAll('.ss-fill').forEach(b => { b.style.width = b.dataset.w + '%'; }); }, 120);
}

function dismissProgIntro(){
  localStorage.setItem(PROG_INTRO_KEY, '1');
  const card = document.getElementById('progIntroCard');
  if(card) card.remove();
}

function renderWeekChart(){
  const days = []; const today = new Date();
  const todayMins = completedMins;
  for(let i = 6; i >= 0; i--){
    const d = new Date(today); d.setDate(today.getDate() - i);
    const ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    let mins = 0;
    const h = history.find(x => x.date === ds); if(h) mins = h.mins;
    if(ds === todayStr()) mins = Math.max(mins, todayMins);
    days.push({d, mins, lbl:d.toLocaleDateString(S.lang === 'en' ? undefined : S.lang, {weekday:'short'}).slice(0,2)});
  }
  const max = Math.max(60, ...days.map(d => d.mins));
  const bars = days.map(d => {
    const h = Math.round((d.mins / max) * 100);
    return `<div class="wc-day"><div class="wc-val">${d.mins ? fmtDur(d.mins) : ''}</div><div class="wc-bar-wrap"><div class="wc-bar" data-h="${h}" style="height:0%"></div></div><div class="wc-lbl">${esc(d.lbl)}</div></div>`;
  }).join('');
  return `<div class="prog-section"><div class="prog-sec-t">${esc(T('prog_week'))}</div><div class="week-chart">${bars}</div></div>`;
}

function renderSubjStats(){
  // merge: all known subjects + any in subjectTotals not in subjects list
  const allNames = new Set([
    ...subjects.map(s => s.name),
    ...Object.keys(subjectTotals).filter(k => k !== '__pause__' && k !== T('phase_focus'))
  ]);
  const entries = [...allNames].map(name => ([name, subjectTotals[name] || 0])).sort((a,b) => b[1] - a[1]);
  const totalMins = entries.reduce((s, [,m]) => s + m, 0);
  const max = Math.max(...entries.map(e => e[1]), 1);
  const inner = entries.map(([name, mins]) => {
    const w = Math.round((mins / max) * 100);
    const col = colorFor(name);
    const pct = totalMins > 0 ? Math.round((mins / totalMins) * 100) : 0;
    const isEmpty = mins === 0;
    return `<div class="ss-row">
      <div class="ss-top">
        <div class="ss-name"><span class="ss-dot" style="background:${col}"></span>${esc(name)}</div>
        <div class="ss-right">
          ${!isEmpty ? `<span class="ss-pct">${pct}%</span>` : ''}
          <div class="ss-val${isEmpty ? ' ss-val-empty' : ''}">${isEmpty ? '—' : fmtDur(mins)}</div>
        </div>
      </div>
      <div class="ss-track"><div class="ss-fill" data-w="${w}" style="width:0%;background:${col};${isEmpty ? 'opacity:.25' : ''}"></div></div>
    </div>`;
  }).join('');
  const summary = totalMins > 0 ? `<div class="ss-total">Totaal: <strong>${fmtDur(totalMins)}</strong> focus</div>` : '';
  return `<div class="prog-section"><div class="prog-sec-t">${esc(T('prog_subjects'))}</div><div class="subj-stats">${inner}${summary}</div></div>`;
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
