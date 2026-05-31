/* ════════════════════════════════════════════════════════════════
   redesign.js — FocusBlock design pass runtime hooks
   - Auto-adds .press feedback to every button/card
   - Wraps studying friend dots in .live-dot for pulse animation
   - Toggles .ring-idle / .ring-running on the timer ring
   - Provides window.fbCelebrate() (CSS-only confetti, no canvas)
   - Hooks into existing reward/recap flow to fire celebration
   No existing app logic is changed; this only LAYERS on top.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ════════ 1 · .press auto-injection ════════
     Adds tactile press feedback to every interactive element. Skips elements
     that already have a transform-on-active rule (.play-btn, .pq-pill, etc.) */
  const PRESS_SKIP = new Set([
    'play-btn', 'pq-pill', 'pq-multi-add', 'fc-pill', 'afw-pill',
    'cel-primary', 'cel-ghost', 'cel-check', 'modal', 'modal-ov',
  ]);
  function injectPress(root = document) {
    const els = root.querySelectorAll('button, .start-card, .pln-card, .home-hook, .agm-day, .ag-ev, .nav-tab, .botnav-tab, .pick-card, .subj-chip, .quick-add-btn, .pq-btn, .ctrl-btn, .extend-btn, .icon-btn, .collapse-btn, .ptab, .set-tab, .mob-bar-btn');
    els.forEach(el => {
      if (el.classList.contains('press')) return;
      let skip = false;
      el.classList.forEach(c => { if (PRESS_SKIP.has(c)) skip = true; });
      if (!skip) el.classList.add('press');
    });
  }

  /* ════════ 2 · Live-dot upgrade for studying friend status dots ════════ */
  function upgradeLiveDots(root = document) {
    const dots = root.querySelectorAll('.afw-status-dot.afw-studying, .afw-status-dot.studying, .fc-status.studying');
    dots.forEach(d => {
      // The pulse rings are added via CSS pseudo (see redesign.css), no markup change needed.
      // We only need to ensure positioning is set so ::after isn't clipped.
      d.style.position ||= 'relative';
    });
  }

  /* ════════ 3 · Timer ring idle/running state ════════ */
  function syncRingState() {
    const rw = document.getElementById('ringWrap');
    if (!rw) return;
    const playBtn = document.getElementById('playBtn');
    const isPlaying = playBtn && !playBtn.classList.contains('idle');
    rw.classList.toggle('ring-running', !!isPlaying);
    rw.classList.toggle('ring-idle', !isPlaying);
  }

  /* ════════ 4 · MutationObserver — keep press class fresh as views re-render ════════ */
  let scheduled = false;
  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      injectPress();
      upgradeLiveDots();
      syncRingState();
    });
  }

  /* ════════ 5 · CELEBRATION (CSS confetti) ════════ */
  const CONFETTI_COLORS = ['var(--accent)', '#fff', 'var(--accent-press)', 'var(--mid)'];
  const CEL_LINES = {
    nl: ['Mooi gefocust.', 'Dat telt. Even ademen.', 'Momentum opgebouwd.', 'Goed bezig — neem je pauze.'],
    en: ['Beautifully focused.', 'That counts. Breathe.', 'Momentum building.', 'Nicely done — take your break.'],
    fr: ['Belle concentration.', 'Ça compte. Respire.', 'Élan créé.', 'Bien joué — prends ta pause.'],
    es: ['Bien enfocado.', 'Eso cuenta. Respira.', 'Impulso creado.', 'Bien hecho — toma tu pausa.'],
    ro: ['Focusare frumoasă.', 'Asta contează. Respiră.', 'Ai prins ritmul.', 'Bravo — ia-ți pauza.'],
  };
  // Full UI strings for the celebration overlay, per language. Kept here (next
  // to CEL_LINES) so the whole celebration is self-contained and localized —
  // previously the title/labels/buttons were hardcoded Dutch and showed Dutch
  // to every non-NL user.
  const CEL_UI = {
    en: { blockDone:'Block complete.', planDone:'Plan complete.', min:'min focus', blocks:'blocks', streak:'streak', cont:'Continue →', summary:'View summary', home:'Back home' },
    nl: { blockDone:'Blok voltooid.', planDone:'Plan voltooid.', min:'min focus', blocks:'blokken', streak:'streak', cont:'Doorgaan →', summary:'Bekijk samenvatting', home:'Naar home' },
    fr: { blockDone:'Bloc terminé.', planDone:'Plan terminé.', min:'min focus', blocks:'blocs', streak:'série', cont:'Continuer →', summary:'Voir le résumé', home:'Accueil' },
    es: { blockDone:'Bloque completado.', planDone:'Plan completado.', min:'min de enfoque', blocks:'bloques', streak:'racha', cont:'Continuar →', summary:'Ver resumen', home:'Inicio' },
    ro: { blockDone:'Bloc finalizat.', planDone:'Plan finalizat.', min:'min focus', blocks:'blocuri', streak:'serie', cont:'Continuă →', summary:'Vezi rezumatul', home:'Acasă' },
  };
  // Read the app's real language. `S` is a lexical global (state.js `let S`),
  // NOT a window property, so the old `window.S` check always failed → fell
  // back to 'nl'. Reference S directly (typeof-guarded for safety).
  function tLang() {
    try { if (typeof S !== 'undefined' && S && S.lang) return S.lang; } catch (e) {}
    try { if (window.S && window.S.lang) return window.S.lang; } catch (e) {}
    return 'en';
  }
  function celUI() { return CEL_UI[tLang()] || CEL_UI.en; }
  function pickLine(n) {
    const arr = CEL_LINES[tLang()] || CEL_LINES.en;
    return arr[Math.abs(n || 0) % arr.length];
  }

  function celebrate(opts) {
    opts = opts || {};
    const el = document.getElementById('fbCelebrate');
    if (!el) return;
    // build confetti
    const wrap = el.querySelector('.confetti-wrap');
    wrap.innerHTML = '';
    for (let i = 0; i < 28; i++) {
      const c = document.createElement('span');
      c.className = 'confetti';
      c.style.left = (Math.random() * 100) + '%';
      c.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      c.style.setProperty('--cx', (Math.random() * 180 - 90) + 'px');
      c.style.setProperty('--cr', (Math.random() * 720 - 360) + 'deg');
      c.style.setProperty('--cd', (1.3 + Math.random() * 0.9) + 's');
      c.style.setProperty('--cdelay', (Math.random() * 0.35) + 's');
      wrap.appendChild(c);
    }
    const mins   = opts.mins ?? 0;
    const done   = opts.done ?? 0;
    const total  = opts.total ?? 0;
    const streak = opts.streak ?? 0;
    const last   = opts.last || (total > 0 && done >= total);
    const ui = celUI();
    document.getElementById('celMins').textContent = mins;
    document.getElementById('celCount').textContent = total ? `${done}/${total}` : `${done}`;
    document.getElementById('celStreakV').textContent = streak;
    // Localize the static stat labels (were hardcoded Dutch in index.html).
    const lblMin = document.getElementById('celMinsLbl');   if (lblMin) lblMin.textContent = ui.min;
    const lblCnt = document.getElementById('celCountLbl');  if (lblCnt) lblCnt.textContent = ui.blocks;
    const lblStk = document.getElementById('celStreakLbl'); if (lblStk) lblStk.textContent = ui.streak;
    document.getElementById('celTitle').textContent = last ? (opts.titleLast || ui.planDone) : (opts.title || ui.blockDone);
    document.getElementById('celLine').textContent  = opts.line || pickLine(done);

    const primary = document.getElementById('celPrimaryBtn');
    const ghost   = document.getElementById('celGhostBtn');
    primary.textContent = last ? (opts.primaryLastLabel || ui.summary) : (opts.primaryLabel || ui.cont);
    primary.onclick = () => {
      hideCelebrate();
      if (typeof opts.onPrimary === 'function') opts.onPrimary();
    };
    ghost.textContent = opts.ghostLabel || ui.home;
    ghost.onclick = () => {
      hideCelebrate();
      if (typeof opts.onGhost === 'function') opts.onGhost();
      else if (typeof window.goHome === 'function') window.goHome();
    };

    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
  }
  function hideCelebrate() {
    const el = document.getElementById('fbCelebrate');
    if (!el) return;
    el.classList.remove('show');
    el.setAttribute('aria-hidden', 'true');
  }
  window.fbCelebrate    = celebrate;
  window.fbHideCelebrate = hideCelebrate;

  /* ════════ 6 · Auto-celebration from existing showReward hook ════════
     We wrap window.showReward so the existing modal logic still fires
     for backwards compatibility, but the celebration plays on top first. */
  function wrapShowReward() {
    if (typeof window.showReward !== 'function') return false;
    if (window.__fbShowRewardWrapped) return true;
    const orig = window.showReward;
    window.showReward = function (block, mins) {
      try {
        // Read stats from DOM (which existing app code keeps up to date).
        const dots = document.querySelectorAll('#dbBlocks .db-dot');
        const total = dots.length;
        let done = 0;
        dots.forEach(d => { if (d.classList.contains('done')) done++; });
        // streak — pick the first non-empty source
        let streak = 0;
        const sNode = document.getElementById('appStreakNum') || document.getElementById('homeStreakNum');
        if (sNode) streak = parseInt(sNode.textContent, 10) || 0;
        const isLast = total > 0 && done >= total;
        celebrate({
          mins: mins,
          done: done,
          total: total,
          streak: streak,
          last: isLast,
          // labels intentionally omitted → celebrate() fills in localized
          // defaults (ui.cont / ui.summary / ui.home) for the active language.
          onPrimary: () => {
            // Open the original reward modal so reflection chips + break/continue still work.
            try { orig.call(this, block, mins); } catch (e) { /* noop */ }
          },
          onGhost: () => {
            if (typeof window.goHome === 'function') window.goHome();
          }
        });
      } catch (e) {
        // If anything goes wrong, fall through to original
        try { orig.call(this, block, mins); } catch (e2) {}
      }
    };
    window.__fbShowRewardWrapped = true;
    return true;
  }

  /* ════════ 7 · Live status sync — observe DOM for re-renders ════════
     IMPORTANT (perf): the timer's tick() rewrites text nodes 4×/sec. If we
     refresh on every mutation we run a full-document querySelectorAll 4×/sec
     during any focus session → visible lag. So we only schedule a refresh when
     a real ELEMENT node is added (a genuine view re-render), never on the
     per-tick text/character updates. */
  function startObserver() {
    const obs = new MutationObserver(mutations => {
      for (let i = 0; i < mutations.length; i++) {
        const added = mutations[i].addedNodes;
        for (let j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) { scheduleRefresh(); return; }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ════════ 8 · Patch the play button toggle ════════
     Existing toggleTimer() flips .idle on #playBtn. We piggy-back via class watch. */
  function startRingObserver() {
    const playBtn = document.getElementById('playBtn');
    if (!playBtn) return;
    const obs = new MutationObserver(syncRingState);
    obs.observe(playBtn, { attributes: true, attributeFilter: ['class'] });
    syncRingState();
  }

  /* ════════ 9 · ESC closes celebration ════════ */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const el = document.getElementById('fbCelebrate');
      if (el && el.classList.contains('show')) hideCelebrate();
    }
  });

  /* ════════ INIT ════════ */
  function init() {
    injectPress();
    upgradeLiveDots();
    syncRingState();
    startObserver();
    startRingObserver();
    // showReward is defined in timer.js / ui.js — may load slightly after this; retry briefly.
    if (!wrapShowReward()) {
      let tries = 0;
      const iv = setInterval(() => {
        if (wrapShowReward() || ++tries > 20) clearInterval(iv);
      }, 150);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
