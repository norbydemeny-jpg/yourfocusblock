/* ══════════════════════════════════════════════════════
   FocusBlock — settings.js
   Settings modal: tabs, panes, live preview, save/cancel.
   ══════════════════════════════════════════════════════ */

let setTab = 'timer';
let _orig = null;    // committed snapshot to revert to on cancel
let _dirty = false;  // any change made since open

function openSettings(tab){
  _orig = JSON.parse(JSON.stringify(S));   // committed state
  _t = JSON.parse(JSON.stringify(S));      // editable draft (previews live)
  _dirty = false;
  document.getElementById('setTitle').textContent = T('set_title');
  if(!onboarded) setTab = 'timer';
  if(tab) setTab = tab;
  renderSettings();
  document.getElementById('settingsOv').classList.add('open');
}

/* Auto-save: every change persists immediately, no Save/Cancel needed */
function markDirty(){ _dirty = true; saveData(); updateSaveBtn(); }

function updateSaveBtn(){
  const foot = document.getElementById('setFoot');
  if(foot) foot.style.display = 'none'; // auto-save → footer hidden
}

function saveSettings(){
  Object.assign(S, _t);
  applyBodyClass(); applyAnimLevel();
  if(blocks.length && !running){ totalTime = phaseDur(curPhase); timeLeft = totalTime; }
  saveData();
  _orig = JSON.parse(JSON.stringify(S));
  _dirty = false;
  if(blocks.length) renderApp();
  closeSettings();
  banner(T('settings_saved'));
}

function cancelSettings(){
  if(_dirty && _orig){
    Object.assign(S, _orig);
    applyBodyClass(); applyAnimLevel(); applyLang();
    if(blocks.length){ if(!running){ totalTime = phaseDur(curPhase); timeLeft = totalTime; } renderApp(); }
  }
  _dirty = false;
  closeSettings();
}

function closeSettings(){ document.getElementById('settingsOv').classList.remove('open'); }

function renderSettings(){
  document.getElementById('setTitle').textContent = T('set_title');
  updateSaveBtn();
  // Profile tab only when logged in
  const loggedIn = typeof window.fbUserId === 'function' && window.fbUserId();
  const tabs = [];
  if(loggedIn) tabs.push(['profile','tab_profile']);
  tabs.push(['timer','tab_timer'],['appear','tab_appear'],['comp','tab_comp'],['subjects','tab_subjects'],['lang','tab_lang'],['data','tab_data']);
  if(!loggedIn && setTab === 'profile') setTab = 'timer';
  const tb = document.getElementById('setTabs');
  tb.innerHTML = tabs.map(([id,k]) => `<button class="set-tab${setTab === id ? ' on' : ''}" data-t="${id}">${esc(T(k))}</button>`).join('');
  tb.querySelectorAll('.set-tab').forEach(b => b.onclick = () => { setTab = b.dataset.t; renderSettings(); });
  const body = document.getElementById('setBody');
  if(setTab === 'profile') body.innerHTML = paneProfile();
  else if(setTab === 'timer') body.innerHTML = paneTimer();
  else if(setTab === 'appear') body.innerHTML = paneAppear();
  else if(setTab === 'comp') body.innerHTML = paneComp();
  else if(setTab === 'subjects') body.innerHTML = paneSubjects();
  else if(setTab === 'lang') body.innerHTML = paneLang();
  else if(setTab === 'data') body.innerHTML = paneData();
  wireSettings();
}

/* ---- Profile pane (account, photo, username, email, weekly goal, logout) ---- */
function paneProfile(){
  const p = (typeof window.fbMyProfile === 'function') ? window.fbMyProfile() : null;
  if(!p) return `<div class="set-pane on"><div style="padding:1.5rem;text-align:center;color:var(--muted)">${esc(T('home_social_login_d'))}</div></div>`;
  const av = (typeof window.fbAvatarHTML === 'function') ? window.fbAvatarHTML(p.username, p.avatar_url, 96) : '';
  return `<div class="set-pane on">
    <div class="set-profile">
      <div class="set-profile-photo">${av}<button class="set-photo-btn" id="setPhotoBtn">${esc(T('set_change_photo'))}</button><input type="file" id="setPhotoFile" accept="image/*" style="display:none">${p.avatar_url ? `<button class="set-photo-clear" id="setPhotoClear">${esc(T('set_remove_photo'))}</button>` : ''}</div>
      <div class="set-profile-fields">
        <div class="set-field"><label class="set-field-lbl">${esc(T('set_username'))}</label><input class="txt-input" id="setUsername" maxlength="30" value="${esc(p.username || '')}" autocomplete="off"></div>
        <div class="set-field"><label class="set-field-lbl">${esc(T('set_email'))}</label><div class="set-field-readonly">${esc(p.email || (typeof _currentUser !== 'undefined' && _currentUser ? _currentUser.email : ''))}</div></div>
      </div>
    </div>
    ${rowStepper('weeklyGoal', T('set_weekgoal'), T('set_weekgoal_s'), _t.weeklyGoal || 15, 1, 70, 1)}
    <button class="set-logout-btn" id="setLogoutBtn">${esc(T('logout'))}</button>
  </div>`;
}

function rowStepper(id, lbl, sub, val, min, max, step){
  return `<div class="set-row"><div class="set-row-info"><div class="set-row-lbl">${esc(lbl)}</div><div class="set-row-sub">${esc(sub)}</div></div><div class="stepper" data-step="${id}" data-min="${min}" data-max="${max}" data-st="${step}"><button class="step-btn" data-d="-1">−</button><div class="step-val" id="sv_${id}">${val}</div><button class="step-btn" data-d="1">+</button></div></div>`;
}
function rowToggle(id, lbl, sub, on){
  return `<div class="set-row"><div class="set-row-info"><div class="set-row-lbl">${esc(lbl)}</div><div class="set-row-sub">${esc(sub)}</div></div><div class="toggle${on ? ' on' : ''}" data-toggle="${id}"></div></div>`;
}
function rowSeg(id, lbl, sub, opts, val){
  const segs = opts.map(([v,l]) => `<button class="seg-btn${val === v ? ' on' : ''}" data-v="${v}">${esc(l)}</button>`).join('');
  return `<div class="set-row" style="flex-wrap:wrap;"><div class="set-row-info"><div class="set-row-lbl">${esc(lbl)}</div><div class="set-row-sub">${esc(sub)}</div></div><div class="seg" data-seg="${id}">${segs}</div></div>`;
}

function paneTimer(){
  return `<div class="set-pane on">
    ${rowStepper('focus',T('set_focus_l'),T('set_focus_s'),_t.focus,5,180,5)}
    ${rowStepper('short',T('set_short_l'),T('set_short_s'),_t.short,1,60,1)}
    ${rowStepper('long',T('set_long_l'),T('set_long_s'),_t.long,5,90,5)}
    ${rowStepper('longAfter',T('set_la_l'),T('set_la_s'),_t.longAfter,1,10,1)}
    ${rowSeg('timerLayout',T('set_layout_l'),T('set_layout_s'),[['ring',T('layout_ring')],['minimal',T('layout_minimal')],['card',T('layout_card')]],_t.timerLayout)}
    ${rowSeg('sound',T('set_sound_l'),T('set_sound_s'),[['off',T('sound_off')],['soft',T('sound_soft')],['full',T('sound_full')]],_t.sound)}
  </div>`;
}

function paneAppear(){
  const themeCards = THEMES.map(t => `<button class="pick-card${_t.theme === t.id ? ' on' : ''}" data-theme="${t.id}"><div class="theme-sw" style="background:${t.a}"></div><div class="pc-name">${esc(t.n)}</div></button>`).join('');
  const ambs = [['none','amb_none'],['dark','amb_dark'],['rain','amb_rain'],['library','amb_library'],['forest','amb_forest'],['cream','amb_cream'],['space','amb_space']];
  return `<div class="set-pane on">
    <div class="set-row" style="flex-direction:column;align-items:stretch;"><div class="set-row-info"><div class="set-row-lbl">${esc(T('set_theme_l'))}</div></div><div class="set-grid">${themeCards}</div></div>
    ${rowToggle('light',T('set_light_l'),T('set_light_s'),_t.light)}
    ${rowSeg('animLevel',T('set_anim_l'),T('set_anim_s'),[['minimal',T('anim_minimal')],['balanced',T('anim_balanced')],['expressive',T('anim_expressive')]],_t.animLevel)}
    ${rowSeg('ambient',T('set_ambient_l'),T('set_ambient_s'),ambs.map(([v,k]) => [v,T(k)]),_t.ambient)}
    <div class="set-row"><div class="set-row-info"><div class="set-row-lbl">${esc(T('set_bg_l'))}</div><div class="set-row-sub">${esc(T('set_bg_s'))}</div></div><div style="display:flex;gap:8px;"><button class="ctrl-btn" id="bgUpload">${esc(T('set_bg_upload'))}</button>${_t.bgPhoto ? `<button class="ctrl-btn" id="bgClear">${esc(T('set_bg_clear'))}</button>` : ''}</div></div>
    <input type="file" id="bgFile" accept="image/*" style="display:none;">
  </div>`;
}

function paneComp(){
  const acc = '#9ca3af';
  const cards = compMeta().map(c => {
    const vis = c.id === 'none' ? '<div style="font-size:22px;color:var(--muted)">∅</div>' : companionSVG(c.id, 'active', acc, 2);
    return `<button class="pick-card${_t.companion === c.id ? ' on' : ''}" data-comp="${c.id}"><div class="pc-vis">${vis}</div><div class="pc-name">${esc(T(c.k))}</div></button>`;
  }).join('');
  const disabled = _t.companion === 'none';
  return `<div class="set-pane on">
    <div class="set-row" style="flex-direction:column;align-items:stretch;"><div class="set-row-info"><div class="set-row-lbl">${esc(T('set_comp_type_l'))}</div></div><div class="set-grid">${cards}</div></div>
    ${disabled ? '' : `<div class="set-row"><div class="set-row-info"><div class="set-row-lbl">${esc(T('set_comp_name_l'))}</div></div><input class="txt-input" id="compName" style="max-width:200px;font-size:14px;padding:10px 13px;" placeholder="${esc(T('comp_name_ph'))}" value="${esc(_t.companionName || '')}" maxlength="18"></div>
    ${rowSeg('companionVis',T('set_comp_vis_l'),'',[['focus',T('vis_focus')],['after',T('vis_after')],['prog',T('vis_prog')],['off',T('vis_off')]],_t.companionVis)}
    ${rowSeg('companionTone',T('set_comp_tone_l'),'',[['calm',T('tone_calm')],['friendly',T('tone_friendly')],['strict',T('tone_strict')],['gamer',T('tone_gamer')],['minimal',T('tone_minimal')]],_t.companionTone)}
    ${rowSeg('companionSound',T('set_comp_sound_l'),'',[['off',T('csound_off')],['soft',T('csound_soft')],['reward',T('csound_reward')]],_t.companionSound)}`}
  </div>`;
}

function paneLang(){
  const list = LANGS.map(l => `<button class="opt${_t.lang === l.id ? ' on' : ''}" data-lang="${l.id}"><div class="opt-body"><div class="opt-name">${esc(l.n)}</div></div><div class="opt-check">✓</div></button>`).join('');
  return `<div class="set-pane on"><div class="opt-list">${list}</div></div>`;
}

function paneSubjects(){
  return `<div class="set-pane on">
    <div class="set-row" style="flex-direction:column;align-items:stretch;gap:14px;">
      <div class="set-row-info"><div class="set-row-lbl">${esc(T('set_subj_l'))}</div><div class="set-row-sub">${esc(T('set_subj_s'))}</div></div>
      <div class="subj-mgr">
        <div class="subj-add-row"><input class="txt-input" id="settSubjInp" placeholder="${esc(T('subj_ph'))}" maxlength="22" autocomplete="off"><button class="subj-add-btn" id="settSubjAdd">+</button></div>
        <div class="subj-chips" id="settSubjChips"></div>
      </div>
    </div>
  </div>`;
}

function drawSettSubjChips(){
  const host = document.getElementById('settSubjChips'); if(!host) return;
  if(!subjects.length){ host.innerHTML = `<div class="subj-empty">${esc(T('no_subjects'))}</div>`; return; }
  host.innerHTML = subjects.map((s,i) => `<span class="subj-chip" data-i="${i}"><span class="sc-dot" style="background:${s.color}"></span><span class="sc-name" data-i="${i}" style="cursor:pointer;border-bottom:1px dashed var(--border);padding-bottom:1px;" title="${esc(T('subj_rename_tip'))}">${esc(s.name)}</span><button class="sc-x" data-i="${i}">✕</button></span>`).join('');
  // delete
  host.querySelectorAll('.sc-x').forEach(b => b.onclick = () => { subjects.splice(+b.dataset.i, 1); saveData(); drawSettSubjChips(); });
  // inline rename on click
  host.querySelectorAll('.sc-name').forEach(span => span.onclick = () => {
    const i = +span.dataset.i;
    const inp = document.createElement('input');
    inp.style.cssText = 'font-size:13px;padding:3px 7px;border-radius:6px;border:1.5px solid var(--accent);background:var(--bg3);color:var(--text);outline:none;max-width:120px;font-family:var(--ff);';
    inp.value = subjects[i].name; inp.maxLength = 22;
    span.replaceWith(inp); inp.focus(); inp.select();
    const commit = () => {
      const v = inp.value.trim();
      if(v && v !== subjects[i].name){
        const old = subjects[i].name;
        if(subjectTotals[old] !== undefined){ subjectTotals[v] = (subjectTotals[v] || 0) + subjectTotals[old]; delete subjectTotals[old]; }
        blocks.forEach(b => { if(b.subject === old) b.subject = v; });
        subjects[i].name = v; subjects[i].color = colorFor(v);
        saveData();
      }
      drawSettSubjChips();
    };
    inp.onblur = commit;
    inp.onkeydown = (e) => { if(e.key === 'Enter'){ e.preventDefault(); inp.blur(); } if(e.key === 'Escape'){ inp.value = subjects[i].name; inp.blur(); } };
  });
}

function paneData(){
  return `<div class="set-pane on">
    <div class="set-row"><div class="set-row-info"><div class="set-row-lbl">${esc(T('set_data_export'))}</div><div class="set-row-sub">${esc(T('set_data_export_s'))}</div></div><button class="ctrl-btn" id="dataExport">${esc(T('export_btn'))}</button></div>
    <div class="set-row"><div class="set-row-info"><div class="set-row-lbl">${esc(T('set_data_import'))}</div><div class="set-row-sub">${esc(T('set_data_import_s'))}</div></div><button class="ctrl-btn" id="dataImport">${esc(T('import_btn'))}</button></div>
    <input type="file" id="importFile" accept="application/json,.json" style="display:none;">
    <div class="set-row"><div class="set-row-info"><div class="set-row-lbl" style="color:#f87171;">${esc(T('set_data_reset'))}</div><div class="set-row-sub">${esc(T('set_data_reset_s'))}</div></div><button class="ctrl-btn" id="dataReset" style="border-color:#f87171;color:#f87171;">${esc(T('reset_btn'))}</button></div>
    <div class="privacy-note" style="margin-top:1.2rem;">${esc(T('set_privacy'))}</div>
  </div>`;
}

function wireSettings(){
  const body = document.getElementById('setBody');
  // steppers
  body.querySelectorAll('[data-step]').forEach(st => {
    const id = st.dataset.step, min = +st.dataset.min, max = +st.dataset.max, step = +st.dataset.st;
    st.querySelectorAll('.step-btn').forEach(b => b.onclick = () => {
      let v = _t[id] + (+b.dataset.d) * step; v = Math.max(min, Math.min(max, v));
      _t[id] = v; document.getElementById('sv_' + id).textContent = v; applyLive();
    });
  });
  // toggles
  body.querySelectorAll('[data-toggle]').forEach(t => t.onclick = () => {
    const id = t.dataset.toggle; _t[id] = !_t[id]; t.classList.toggle('on', _t[id]); applyLive();
  });
  // segments
  body.querySelectorAll('[data-seg]').forEach(sg => {
    const id = sg.dataset.seg;
    sg.querySelectorAll('.seg-btn').forEach(b => b.onclick = () => {
      _t[id] = b.dataset.v;
      sg.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('on', x === b));
      applyLive();
      if(id === 'companionVis') renderSettings();
    });
  });
  // theme cards
  body.querySelectorAll('[data-theme]').forEach(c => c.onclick = () => {
    _t.theme = c.dataset.theme;
    body.querySelectorAll('[data-theme]').forEach(x => x.classList.toggle('on', x === c));
    applyLive();
  });
  // companion cards
  body.querySelectorAll('[data-comp]').forEach(c => c.onclick = () => {
    _t.companion = c.dataset.comp; renderSettings(); applyLive();
  });
  // companion name
  const cn = body.querySelector('#compName'); if(cn) cn.oninput = () => { _t.companionName = cn.value; applyLive(); };
  // lang
  body.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => {
    _t.lang = b.dataset.lang; S.lang = b.dataset.lang; markDirty(); applyLang();
    document.getElementById('setTitle').textContent = T('set_title');
    renderSettings();
  });
  // bg photo
  const up = body.querySelector('#bgUpload'), file = body.querySelector('#bgFile');
  if(up) up.onclick = () => file.click();
  if(file) file.onchange = (e) => {
    const f = e.target.files[0]; if(!f) return;
    const rd = new FileReader();
    rd.onload = () => { resizePhoto(rd.result, (data) => { _t.bgPhoto = data; applyLive(); renderSettings(); }); };
    rd.readAsDataURL(f);
  };
  const clr = body.querySelector('#bgClear'); if(clr) clr.onclick = () => { _t.bgPhoto = ''; applyLive(); renderSettings(); };
  // subjects pane
  const sai = body.querySelector('#settSubjAdd'), siin = body.querySelector('#settSubjInp');
  if(sai && siin){
    drawSettSubjChips();
    const addSettSubj = () => { const v = siin.value.trim(); if(v){ addSubject(v); siin.value = ''; saveData(); drawSettSubjChips(); } siin.focus(); };
    sai.onclick = addSettSubj;
    siin.onkeydown = (e) => { if(e.key === 'Enter'){ e.preventDefault(); addSettSubj(); } };
  }
  // profile pane wiring
  const photoBtn = body.querySelector('#setPhotoBtn');
  const photoFile = body.querySelector('#setPhotoFile');
  const photoClear = body.querySelector('#setPhotoClear');
  const userInp = body.querySelector('#setUsername');
  const logoutBtn = body.querySelector('#setLogoutBtn');
  if(photoBtn && photoFile){
    photoBtn.onclick = () => photoFile.click();
    photoFile.onchange = (e) => {
      const f = e.target.files[0]; if(!f) return;
      const rd = new FileReader();
      rd.onload = () => resizePhoto(rd.result, async (data) => {
        try { await window.updateMyProfile({ avatar_url: data }); banner(T('settings_saved') + ' ✓'); renderSettings(); }
        catch(err){ banner(err.message || 'Error'); }
      }, 256);
      rd.readAsDataURL(f);
    };
  }
  if(photoClear){
    photoClear.onclick = async () => {
      try { await window.updateMyProfile({ avatar_url: '' }); renderSettings(); }
      catch(err){ banner(err.message || 'Error'); }
    };
  }
  if(userInp){
    let _utimer = null;
    userInp.oninput = () => {
      if(_utimer) clearTimeout(_utimer);
      _utimer = setTimeout(async () => {
        const v = userInp.value.trim();
        if(!v || v.length < 2) return;
        try { await window.updateMyProfile({ username: v }); } catch(err){}
      }, 800);
    };
  }
  if(logoutBtn){
    logoutBtn.onclick = async () => {
      if(typeof window.handleLogout === 'function'){ await window.handleLogout(); closeSettings(); }
    };
  }

  // data
  const ex = body.querySelector('#dataExport'); if(ex) ex.onclick = exportData;
  const im = body.querySelector('#dataImport'), imf = body.querySelector('#importFile');
  if(im) im.onclick = () => imf.click();
  if(imf) imf.onchange = (e) => { const f = e.target.files[0]; if(f) importData(f); };
  const rs = body.querySelector('#dataReset'); if(rs) rs.onclick = askReset;
}

/* ---- apply settings draft live (also auto-saves) ---- */
function applyLive(){
  Object.assign(S, _t);
  applyBodyClass(); applyAnimLevel();
  markDirty(); // persists via saveData()
  if(blocks.length){
    if(!running){ totalTime = phaseDur(curPhase); timeLeft = totalTime; }
    renderApp();
  }
  // re-render whichever main screen is visible so changes propagate everywhere
  ['overview','agenda','progress','home'].forEach(id => {
    const el = document.getElementById(id);
    if(el && !el.classList.contains('out')){
      const fn = window['render' + id.charAt(0).toUpperCase() + id.slice(1)];
      if(typeof fn === 'function') fn();
    }
  });
}

/* ---- downscale uploaded photo to keep storage small ---- */
function resizePhoto(dataUrl, cb, maxOverride){
  const img = new Image();
  img.onload = () => {
    const max = maxOverride || 1280; let {width:w, height:h} = img;
    if(w > max || h > max){ const r = Math.min(max/w, max/h); w = Math.round(w*r); h = Math.round(h*r); }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    cb(cv.toDataURL('image/jpeg', maxOverride ? 0.86 : 0.82));
  };
  img.onerror = () => cb(dataUrl);
  img.src = dataUrl;
}
