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
  // Supabase v2 ondersteunt het meegeven van metadata aan signUp; de
  // username staat zo ook in auth.users.user_metadata als backup voor
  // ensureProfile (handig als _pendingUsername verloren is bij een refresh).
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username: _pendingUsername } }
  });
  if (error) throw error;
  return data;
}

async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function resendConfirmation(email) {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw error;
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
// Idempotent: gebruikt maybeSingle() zodat het niet faalt bij ontbrekende rij,
// en upsert zodat parallelle SIGNED_IN-events geen dubbele rijen of races geven.
async function ensureProfile(user) {
  try {
    const { data: existing, error: selErr } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, referral_code')
      .eq('id', user.id)
      .maybeSingle();

    if (selErr) console.warn('[Auth] profile select warn:', selErr.message);
    if (existing) return existing;

    const metaName      = user?.user_metadata?.username;
    const baseName      = (_pendingUsername || metaName || (user.email || 'user').split('@')[0] || 'user').trim().substring(0, 30) || 'user';
    _pendingUsername    = null;
    const referral_code = generateReferralCode(baseName);

    const { data: created, error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, username: baseName, referral_code }, { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (error) {
      // Username could clash (unique constraint) — retry once with a suffix
      if (/duplicate|unique/i.test(error.message || '')) {
        const alt = (baseName.substring(0, 24) + Math.floor(Math.random()*9000+1000)).substring(0,30);
        const retry = await supabase
          .from('profiles')
          .upsert({ id: user.id, username: alt, referral_code: generateReferralCode(alt) }, { onConflict: 'id' })
          .select()
          .maybeSingle();
        if (retry.error) console.error('[Auth] Profiel aanmaken faalt (retry):', retry.error.message);
        return retry.data || null;
      }
      console.error('[Auth] Profiel aanmaken mislukt:', error.message);
    }
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

  // localize the modal title
  const titleEl = document.querySelector('#authOv .modal-title');
  if (titleEl) titleEl.textContent = (typeof T === 'function') ? T('auth_account_title') : 'Account';

  if (_currentUser) {
    // Logged in: account chip opens settings('profile') instead — but keep this for direct access
    body.innerHTML = `
      <div class="auth-user-info">
        ${fbAvatarHTML(_myProfile?.username || _currentUser.email, _myProfile?.avatar_url, 64)}
        <div class="auth-username">${_esc(_myProfile?.username || _currentUser.email)}</div>
        <div class="auth-email-lbl">${_esc(_currentUser.email)}</div>
        <button class="btn-primary" style="width:100%;margin-top:0.4rem" onclick="handleLogout()">${_esc(T('auth_logout'))}</button>
      </div>`;
    return;
  }

  body.innerHTML = `
    <div class="auth-tabs">
      <button class="auth-tab on" id="authTabLogin"    onclick="switchAuthTab('login')">${_esc(T('auth_login'))}</button>
      <button class="auth-tab"    id="authTabRegister" onclick="switchAuthTab('register')">${_esc(T('auth_register'))}</button>
    </div>

    <form id="authLoginForm" class="auth-form" onsubmit="event.preventDefault(); handleLogin();">
      <input type="email"    id="authEmail"    class="txt-input" placeholder="${_esc(T('auth_email_ph'))}"  autocomplete="email" />
      <input type="password" id="authPassword" class="txt-input" placeholder="${_esc(T('auth_password_ph'))}"   autocomplete="current-password" />
      <div id="authLoginMsg" class="auth-msg"></div>
      <button type="submit" class="btn-primary" style="width:100%">${_esc(T('auth_login_btn'))}</button>
    </form>

    <form id="authRegisterForm" class="auth-form" style="display:none" onsubmit="event.preventDefault(); handleRegister();">
      <input type="text"     id="authUsername"    class="txt-input" placeholder="${_esc(T('auth_username_ph'))}"  autocomplete="username" maxlength="30" />
      <input type="email"    id="authEmailReg"    class="txt-input" placeholder="${_esc(T('auth_email_ph'))}"     autocomplete="email" />
      <input type="password" id="authPasswordReg" class="txt-input" placeholder="${_esc(T('auth_password_new_ph'))}" autocomplete="new-password" />
      <div id="authRegMsg" class="auth-msg"></div>
      <button type="submit" class="btn-primary" style="width:100%">${_esc(T('auth_register_btn'))}</button>
    </form>`;
}

// ── Form handlers ───────────────────────────────────────
async function handleLogin() {
  const email    = (document.getElementById('authEmail')?.value    || '').trim();
  const password =  document.getElementById('authPassword')?.value || '';

  if (!email || !password) {
    showAuthMsg('authLoginMsg', T('auth_fill_email_pw')); return;
  }
  try {
    showAuthMsg('authLoginMsg', T('auth_busy'), false);
    await login(email, password);
    closeAuthModal();
    toast(T('auth_welcome_back'));
  } catch (e) {
    const raw = e?.message || '';
    // Account bestond al vóór email-confirmation uit stond → toon resend-link
    if (/email not confirmed/i.test(raw)) {
      const msgEl = document.getElementById('authLoginMsg');
      if (msgEl) {
        msgEl.innerHTML = `${_esc(T('auth_err_unconfirmed') || 'Account nog niet bevestigd via e-mail.')} <a href="#" id="authResendLink" style="color:var(--brand);text-decoration:underline;cursor:pointer">${_esc(T('auth_resend') || 'Opnieuw versturen')}</a>`;
        msgEl.className = 'auth-msg auth-error';
        document.getElementById('authResendLink')?.addEventListener('click', async (ev) => {
          ev.preventDefault();
          try {
            await resendConfirmation(email);
            showAuthMsg('authLoginMsg', T('auth_resent') || 'Bevestigingsmail opnieuw verstuurd.', false);
          } catch (er) {
            showAuthMsg('authLoginMsg', _friendlyError(er?.message || 'Fout bij versturen.'));
          }
        });
      }
      return;
    }
    showAuthMsg('authLoginMsg', _friendlyError(raw));
  }
}

async function handleRegister() {
  const username = (document.getElementById('authUsername')?.value    || '').trim();
  const email    = (document.getElementById('authEmailReg')?.value    || '').trim();
  const password =  document.getElementById('authPasswordReg')?.value || '';

  if (!username || !email || !password) { showAuthMsg('authRegMsg', T('auth_fill_all')); return; }
  if (username.length < 2)               { showAuthMsg('authRegMsg', T('auth_min_username')); return; }
  if (password.length < 6)               { showAuthMsg('authRegMsg', T('auth_min_password')); return; }

  try {
    showAuthMsg('authRegMsg', T('auth_creating'), false);
    const data = await register(email, password, username);

    // Pad 1: Supabase gaf direct een sessie terug — email-confirmation is uit.
    if (data.session) {
      // ensureProfile draait ook automatisch via SIGNED_IN, maar we forceren hier
      // zodat de welkom-toast de juiste username toont.
      try { await ensureProfile(data.session.user); } catch {}
      closeAuthModal();
      toast(typeof Tf === 'function' ? Tf('auth_account_created', {name: username}) : ('Welkom, ' + username + '!'));
      return;
    }

    // Pad 2: signUp gaf user terug maar geen sessie. Dat gebeurt soms ook
    // als confirmation uit staat. Probeer direct in te loggen.
    try {
      await login(email, password);
      closeAuthModal();
      toast(typeof Tf === 'function' ? Tf('auth_account_created', {name: username}) : ('Welkom, ' + username + '!'));
      return;
    } catch (le) {
      const lm = le?.message || '';
      // Pad 3: confirmation staat dus tóch nog aan in het Supabase project.
      if (/email not confirmed/i.test(lm)) {
        showAuthMsg('authRegMsg', T('auth_check_email') || 'Bevestig je account via de e-mail die we net hebben gestuurd.', false);
        return;
      }
      // Onbekend; toon de echte foutmelding zodat we niet stilletjes falen.
      showAuthMsg('authRegMsg', _friendlyError(lm));
    }
  } catch (e) {
    showAuthMsg('authRegMsg', _friendlyError(e?.message || ''));
  }
}

async function handleLogout() {
  try {
    await logout();
    closeAuthModal();
    toast(T('auth_logged_out'));
  } catch (e) {
    toast((typeof Tf === 'function') ? Tf('auth_logout_failed', {msg: e.message}) : ('Logout failed: ' + e.message));
  }
}

function _friendlyError(msg) {
  msg = String(msg || '');
  if (/Invalid login credentials/i.test(msg))   return T('auth_err_invalid');
  if (/Email not confirmed/i.test(msg))         return T('auth_err_unconfirmed') || 'Bevestig je account eerst via e-mail.';
  if (/User already registered/i.test(msg))     return T('auth_err_already');
  if (/Password should be at least/i.test(msg)) return T('auth_err_minpw');
  if (/Unable to validate/i.test(msg))          return T('auth_err_connect');
  if (/rate limit exceeded|too many requests/i.test(msg))
                                                return T('auth_err_rate_limit') || 'Te veel pogingen — probeer het zo opnieuw.';
  if (/network|failed to fetch/i.test(msg))     return T('auth_err_connect') || 'Geen verbinding met de server.';
  return msg || (T('auth_err_unknown') || 'Onbekende fout — probeer opnieuw.');
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
  if (!_currentUser) throw new Error((typeof T==='function'?T('fr_not_logged_in'):'Not logged in'));
  const { error } = await supabase.from('profiles').update(fields).eq('id', _currentUser.id);
  if (error) {
    // The avatar_url column doesn't exist yet → guide the user to run the SQL migration.
    if (error.message && /avatar_url|column .* does not exist|schema cache/i.test(error.message) && 'avatar_url' in fields){
      if (typeof window.banner === 'function') window.banner(T('avatar_col_missing'));
    }
    throw error;
  }
  _myProfile = { ..._myProfile, ...fields };
  renderAuthChip();
  // refresh all the social views that show avatars / usernames
  window.reloadFriendStatuses?.();
  if (typeof window.renderHomeSocial === 'function') window.renderHomeSocial();
  if (typeof window.renderOverviewSocial === 'function') window.renderOverviewSocial();
  // Refresh open settings pane so the photo shows immediately
  if (document.getElementById('settingsOv')?.classList.contains('open') && typeof window.renderSettings === 'function') window.renderSettings();
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
