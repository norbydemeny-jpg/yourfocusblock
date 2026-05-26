/* ══════════════════════════════════════════════════════
   FocusBlock — service-worker.js
   Cache-first strategy. Cache version: focusblock-v2.
   ══════════════════════════════════════════════════════ */

const CACHE = 'focusblock-v10';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/themes.css',
  './css/layout.css',
  './css/components.css',
  './css/mobile.css',
  './css/auth.css',
  './css/friends.css',
  './css/social.css',
  './css/nav.css',
  './data/default-settings.js',
  './js/state.js',
  './js/storage.js',
  './js/notifications.js',
  './js/pwa.js',
  './js/timer.js',
  './js/ui.js',
  './js/planner.js',
  './js/progress.js',
  './js/settings.js',
  './js/app.js',
  './js/supabaseClient.js',
  './js/auth.js',
  './js/sessions.js',
  './js/friends.js',
  './js/status.js',
  './js/leaderboard.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

/* ── Install: pre-cache all shell assets ─────────────── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: delete old caches ─────────────────────── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: cache-first, network fallback ─────────────── */
self.addEventListener('fetch', e => {
  /* Only handle GET requests for same-origin or precached cross-origin */
  if(e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(response => {
        /* Cache valid responses (not opaque/error) */
        if(response && response.status === 200 && response.type === 'basic'){
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        /* Offline fallback: return index.html for navigation requests */
        if(e.request.mode === 'navigate'){
          return caches.match('./index.html');
        }
      });
    })
  );
});
