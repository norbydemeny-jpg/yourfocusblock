// ══════════════════════════════════════════════════════
// auth.js — Supabase authenticatie + profiel aanmaken
// ══════════════════════════════════════════════════════

import { supabase } from './supabaseClient.js';

// ── State ──────────────────────────────────────────────
let _currentUser     = null;
let _pendingUsername = null; // bewaard tijdens registratie tot SIGNED_IN event
let _myProfile       = null; // { id, username, avatar_url }

// ── Avatar helpers (global) ────────────────────────────
const _AV_COLORS = ['#c8f060','#fb7185','#67e8f9','#fcd34d','#c084fc','#6ee7b7','#f0a868','#38bdf8','#f472b6','#a3e635'];
function fbAvatarColor(name){
  let h = 0; const s = String(name || '?');
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return _AV_COLORS[Math.abs(h) % _AV_COLORS.length];
}
function _avSafe(url){ return (typeof url === 'string' && /^(data:image\/|https:\/\/)/.test(url)) ? url : ''; }
function fbAvatarHTML(name, url, size){
  size = size || 36;
  const safe = _avSafe(url);
  if (safe) return `<span class="fb-av" style="width:${size}px;height:${size}px"><img src="${safe.replace(/"/g,'&quot;')}" alt="" loading="lazy"></span>`;
  const initial = (String(name || '?').trim()[0] || '?').toUpperCase();
  return `<span class="fb-av fb-av-init" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.42)}px;background:${fbAvatarColor(name)};color:#0c0e06">${initial}</span>`;
}
window.fbAvatarHTML  = fbAvatarHTML;
window.fbAvatarColor = fbAvatarColor;
window.fbMyProfile   = () => _myProfile;

// ── Helpers ────────────────────────────────────────────
function generateReferralCode(username) {
  const prefix = (username || 'USER')
    .substring(0, 4)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, 'X');
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return prefix + rand;
}

function toast(msg) {
  if (typeof window.banner === 'function') window.banner(msg);
  else console.log('[Auth]', msg);
}

// ── Auth functies (ook beschikbaar via window.*) ───────
async function register(email, password, username) {
  _pendingUsername = username.trim();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

// ── Profiel aanmaken / ophalen ─────────────────────────
async function ensureProfile(user) {
  try {
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('id', user.id)
      .single();

    if (existing) return existing;

    const username      = (_pendingUsername || user.email.split('@')[0]).substring(0, 30);
    _pendingUsername    = null;
    const referral_code = generateReferralCode(username);

    const { data: created, error } = await supabase
      .from('profiles')
      .insert({ id: user.id, username, referral_code })
      .select()
      .single();

    if (error) console.error('[Auth] Profiel aanmaken mislukt:', error.message);
    return created;
  } catch (e) {
    console.error('[Auth] ensureProfile fout:', e.message);
    return null;
  }
}

// ── Auth modal UI ───────────────────────────────────────
function openAuthModal() {
  renderAuthModal();
  document.getElementById('authOv').classList.add('open');
}

function closeAuthModal() {
  document.getElementById('authOv').classList.remove('open');
}

function switchAuthTab(tab) {
  const loginForm  = document.getElementById('authLoginForm');
  const regForm    = document.getElementById('authRegisterForm');
  const tabLogin   = document.getElementById('authTabLogin');
  const tabReg     = document.getElementById('authTabRegister');

  if (tab === 'login') {
    loginForm.style.display = 'flex';
    regForm.style.display   = 'none';
    tabLogin.classList.add('on');
    tabReg.classList.remove('on');
  } else {
    loginForm.style.display = 'none';
    regForm.style.display   = 'flex';
    tabLogin.classList.remove('on');
    tabReg.classList.add('on');
  }
  clearAuthErrors();
}

function clearAuthErrors() {
  const els = document.querySelectorAll('.auth-msg');
  els.forEach(el => { el.textContent = ''; el.className = 'auth-msg'; });
}

function showAuthMsg(elId, msg, isError = true) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className   = 'auth-msg ' + (isError ? 'auth-error' : 'auth-success');
}

function renderAuthModal() {
  const body = document.getElementById('authModalBody');
  if (!body) return;

  if (_currentUser) {
    // Ingelogd: toon gebruikersinfo + uitlogknop
    const initial = (_currentUser.email || '?')[0].toUpperCase();
    body.innerHTML = `
      <div class="auth-user-info">
        <div class="auth-avatar">${initial}</div>
        <div class="auth-username" id="authDisplayName">…</div>
        <div class="auth-email-lbl">${_currentUser.email}</div>
        <button class="btn-primary" style="width:100%;margin-top:0.4rem" onclick="handleLogout()">Uitloggen</button>
      </div>`;
    // Haal username op uit profiel
    supabase
      .from('profiles')
      .select('username')
      .eq('id', _currentUser.id)
      .single()
      .then(({ data }) => {
        const el = document.getElementById('authDisplayName');
        if (el && data) el.textContent = data.username;
      });
    return;
  }

  // Niet ingelogd: login / register tabs
  body.innerHTML = `
    <div class="auth-tabs">
      <button class="auth-tab on" id="authTabLogin"    onclick="switchAuthTab('login')">Inloggen</button>
      <button class="auth-tab"    id="authTabRegister" onclick="switchAuthTab('register')">Registreren</button>
    </div>

    <div id="authLoginForm" class="auth-form">
      <input type="email"    id="authEmail"    class="txt-input" placeholder="E-mailadres"  autocomplete="email" />
      <input type="password" id="authPassword" class="txt-input" placeholder="Wachtwoord"   autocomplete="current-password" />
      <div id="authLoginMsg" class="auth-msg"></div>
      <button class="btn-primary" style="width:100%" onclick="handleLogin()">Inloggen</button>
    </div>

    <div id="authRegisterForm" class="auth-form" style="display:none">
      <input type="text"     id="authUsername"    class="txt-input" placeholder="Gebruikersnaam"  autocomplete="username" maxlength="30" />
      <input type="email"    id="authEmailReg"    class="txt-input" placeholder="E-mailadres"     autocomplete="email" />
      <input type="password" id="authPasswordReg" class="txt-input" placeholder="Wachtwoord (min. 6 tekens)" autocomplete="new-password" />
      <div id="authRegMsg" class="auth-msg"></div>
      <button class="btn-primary" style="width:100%" onclick="handleRegister()">Account aanmaken</button>
    </div>`;
}

// ── Form handlers ───────────────────────────────────────
async function handleLogin() {
  const email    = (document.getElementById('authEmail')?.value    || '').trim();
  const password =  document.getElementById('authPassword')?.value || '';

  if (!email || !password) {
    showAuthMsg('authLoginMsg', 'Vul e-mail en wachtwoord in.'); return;
  }
  try {
    showAuthMsg('authLoginMsg', 'Bezig…', false);
    await login(email, password);
    closeAuthModal();
    toast('Welkom terug!');
  } catch (e) {
    showAuthMsg('authLoginMsg', _friendlyError(e.message));
  }
}

async function handleRegister() {
  const username = (document.getElementById('authUsername')?.value    || '').trim();
  const email    = (document.getElementById('authEmailReg')?.value    || '').trim();
  const password =  document.getElementById('authPasswordReg')?.value || '';

  if (!username || !email || !password) {
    showAuthMsg('authRegMsg', 'Vul alle velden in.'); return;
  }
  if (username.length < 2) {
    showAuthMsg('authRegMsg', 'Gebruikersnaam moet minstens 2 tekens zijn.'); return;
  }
  if (password.length < 6) {
    showAuthMsg('authRegMsg', 'Wachtwoord moet minstens 6 tekens zijn.'); return;
  }
  try {
    showAuthMsg('authRegMsg', 'Account aanmaken…', false);
    const data = await register(email, password, username);

    if (data.session) {
      // Sessie direct actief (email bevestiging uit)
      closeAuthModal();
      toast('Account aangemaakt! Welkom ' + username + '!');
    } else {
      // Email bevestiging vereist
      showAuthMsg('authRegMsg',
        'Controleer je e-mail om je account te bevestigen, dan kun je inloggen.', false);
    }
  } catch (e) {
    showAuthMsg('authRegMsg', _friendlyError(e.message));
  }
}

async function handleLogout() {
  try {
    await logout();
    closeAuthModal();
    toast('Je bent uitgelogd.');
  } catch (e) {
    toast('Uitloggen mislukt: ' + e.message);
  }
}

function _friendlyError(msg) {
  if (msg.includes('Invalid login credentials'))   return 'E-mail of wachtwoord klopt niet.';
  if (msg.includes('Email not confirmed'))          return 'Bevestig eerst je e-mail.';
  if (msg.includes('User already registered'))      return 'Dit e-mailadres is al in gebruik.';
  if (msg.includes('Password should be at least'))  return 'Wachtwoord moet minstens 6 tekens zijn.';
  if (msg.includes('Unable to validate'))           return 'Verbinding met server mislukt. Probeer opnieuw.';
  return msg;
}

function _esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Profiel laden / cachen ─────────────────────────────
async function loadMyProfile(userId){
  try {
    const { data } = await supabase.from('profiles').select('id, username, avatar_url').eq('id', userId).single();
    _myProfile = data || { id: userId, username: (_currentUser?.email || 'user').split('@')[0], avatar_url: '' };
  } catch { _myProfile = { id: userId, username: '', avatar_url: '' }; }
  return _myProfile;
}

// ── Top bar auth area ───────────────────────────────────
function renderAuthChip(){
  if (!_myProfile) return;
  document.querySelectorAll('.auth-area').forEach(area => {
    area.innerHTML = `
      <button class="auth-chip" onclick="openSettings('profile')" title="${_esc(_myProfile.username || 'Account')}">
        ${fbAvatarHTML(_myProfile.username, _myProfile.avatar_url, 30)}
        <svg class="auth-chip-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" width="13" height="13"><path d="M6 9l6 6 6-6"/></svg>
      </button>`;
  });
}

async function updateAuthUI(user) {
  _currentUser = user;
  if (user) {
    await loadMyProfile(user.id);
    renderAuthChip();
  } else {
    _myProfile = null;
    document.querySelectorAll('.auth-area').forEach(area => {
      area.innerHTML = `
        <button class="icon-btn" onclick="openAuthModal()" title="Inloggen / Registreren">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </button>`;
    });
  }
}

// ── Profiel bijwerken (gebruikersnaam / avatar) ────────
async function updateMyProfile(fields){
  if (!_currentUser) throw new Error('Niet ingelogd');
  const { error } = await supabase.from('profiles').update(fields).eq('id', _currentUser.id);
  if (error) throw error;
  _myProfile = { ..._myProfile, ...fields };
  renderAuthChip();
  // ververs sociale weergaves die avatars/namen tonen
  window.reloadFriendStatuses?.();
  if (typeof window.renderHomeSocial === 'function') window.renderHomeSocial();
  if (typeof window.renderOverviewSocial === 'function') window.renderOverviewSocial();
  return _myProfile;
}
window.updateMyProfile = updateMyProfile;
window.fbRefreshProfile = async () => { if (_currentUser){ await loadMyProfile(_currentUser.id); renderAuthChip(); } };

// ── Auth state listener ─────────────────────────────────
supabase.auth.onAuthStateChange(async (event, session) => {
  const user = session?.user ?? null;

  if (event === 'SIGNED_IN' && user) {
    await ensureProfile(user);
  }

  updateAuthUI(user);
});

// ── Init: herstel bestaande sessie bij pagina laden ─────
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    await ensureProfile(session.user);
    updateAuthUI(session.user);
  } else {
    updateAuthUI(null);
  }
})();

// ── Expose aan window (voor onclick in HTML) ────────────
window.openAuthModal   = openAuthModal;
window.closeAuthModal  = closeAuthModal;
window.switchAuthTab   = switchAuthTab;
window.handleLogin     = handleLogin;
window.handleRegister  = handleRegister;
window.handleLogout    = handleLogout;
