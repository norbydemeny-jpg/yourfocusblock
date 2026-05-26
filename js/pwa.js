/* ══════════════════════════════════════════════════════
   FocusBlock — pwa.js
   Wake lock (prevent device sleep while timer runs) and
   service worker registration.
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

/* ---- Service Worker ---- */
// Registered as a proper file instead of a blob URL for reliability.
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});

  // Auto-reload the page when a new service worker takes control
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}
