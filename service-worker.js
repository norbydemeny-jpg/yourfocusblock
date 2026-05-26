/* ══════════════════════════════════════════════════════
   FocusBlock — service-worker.js
   Network-first voor app-code (HTML/JS/CSS) zodat users
   altijd de laatste versie zien, cache-fallback offline.
   Cache-first voor static assets (icons/sounds/images).
   ══════════════════════════════════════════════════════ */

const CACHE = 'focusblock-v11';

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
      .then(cache => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: delete old caches + take control immediately ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── Message handler: app kan om SKIP_WAITING vragen ─── */
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ── Bepaal of dit een app-code-asset is (HTML/JS/CSS) ── */
function isAppAsset(url){
  return /\.(html|js|css)$/i.test(url.pathname) || url.pathname === '/' || url.pathname.endsWith('/');
}

/* ── Fetch strategie:
   • App-code (HTML/JS/CSS): network-first, fallback naar cache
       Zo zien gebruikers ALTIJD de laatste versie als ze online zijn.
   • Static assets (icons/sounds): cache-first
   • Externe origin (Supabase, CDN): bypass — direct network.
   ─────────────────────────────────────────────────────── */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Externe API/CDN nooit cachen (Supabase, jsdelivr).
  if (url.origin !== self.location.origin) return;

  if (isAppAsset(url)) {
    // Network-first
    e.respondWith(
      fetch(e.request)
        .then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE).then(cache => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first voor static assets (icons, sounds, images)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        if (e.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
