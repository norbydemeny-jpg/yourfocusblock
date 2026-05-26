/* ══════════════════════════════════════════════════════
   FocusBlock — pwa.js
   Wake lock (prevent device sleep while timer runs) and
   service worker registration with auto-update handling.
   ══════════════════════════════════════════════════════ */

/* ---- Wake Lock ---- */
let _wakeLock = null;

async function acquireWakeLock(){
  if(!('wakeLock' in navigator)) return;
  try { _wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
}

function releaseWakeLock(){
  if(_wakeLock){ try{ _wakeLock.release(); }catch(e){} _wakeLock = null; }
}

/* ---- Service Worker ──────────────────────────────────
   Auto-update strategie:
   1. Bij elke registratie checken op nieuwe versie (registration.update()).
   2. Als er een nieuwe SW in 'waiting' staat → vraag direct skipWaiting.
   3. Bij controllerchange (= nieuwe SW heeft het overgenomen) → reload.
   4. Periodiek (elke 5 min terwijl tabblad open is) updaten zoeken.
   ────────────────────────────────────────────────────── */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js').then(registration => {
    // Direct skipWaiting vragen als er al een waiting worker is.
    if(registration.waiting) registration.waiting.postMessage('SKIP_WAITING');

    // Nieuwe SW geïnstalleerd? → activeer direct.
    registration.addEventListener('updatefound', () => {
      const sw = registration.installing;
      if(!sw) return;
      sw.addEventListener('statechange', () => {
        if(sw.state === 'installed' && navigator.serviceWorker.controller){
          sw.postMessage('SKIP_WAITING');
        }
      });
    });

    // Periodiek updaten checken zonder de page te reloaden.
    setInterval(() => { registration.update().catch(() => {}); }, 5 * 60 * 1000);
    // Ook bij terug-focus.
    document.addEventListener('visibilitychange', () => {
      if(!document.hidden) registration.update().catch(() => {});
    });
  }).catch(() => {});

  // Auto-reload zodra een nieuwe SW de controle overneemt.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
