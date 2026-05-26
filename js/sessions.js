// ══════════════════════════════════════════════════════
// sessions.js — Afgeronde focussessies opslaan in Supabase
// Werkt zonder login (lokaal), offline (sync-queue) en online.
// ══════════════════════════════════════════════════════

import { supabase } from './supabaseClient.js';

const QUEUE_KEY = 'focusblock_sync_queue';

// ── Queue helpers (localStorage) ───────────────────────
function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch { return []; }
}
function saveQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}

// ── Huidige ingelogde user-ID ophalen ──────────────────
function getCurrentUserId() {
  if (typeof window.fbUserId === 'function') {
    return window.fbUserId();
  }
  return null;
}

// ── Eén sessie inserten in Supabase ────────────────────
async function insertSession(payload) {
  const { error } = await supabase.from('study_sessions').insert(payload);
  if (error) throw error;
}

// ── Wacht-queue legen zodra online + ingelogd ──────────
async function flushQueue() {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const q = getQueue();
  if (q.length === 0) return;

  const failed = [];
  for (const item of q) {
    try {
      // user_id opnieuw toevoegen (kan veranderd zijn als iemand wisselde)
      await insertSession({ ...item, user_id: userId });
    } catch {
      failed.push(item);
    }
  }
  saveQueue(failed);
  if (failed.length < q.length) {
    console.log(`[Sessions] ${q.length - failed.length} wachtende sessie(s) gesynchroniseerd.`);
  }
}

// ── Publieke functie: aanroepen bij afronden focusblok ─
async function recordFocusSession({ minutes, subject, completed_at }) {
  const userId = await getCurrentUserId();
  if (!userId) return; // niet ingelogd → blijft lokaal, niets doen

  const payload = {
    user_id:      userId,
    minutes:      minutes,
    block_type:   'focus',
    completed_at: completed_at || new Date().toISOString(),
    subject:      subject || null,
  };

  if (!navigator.onLine) {
    // Offline → opslaan in sync-queue
    const q = getQueue();
    q.push(payload);
    saveQueue(q);
    console.log('[Sessions] Offline — sessie in wachtrij opgeslagen.');
    return;
  }

  try {
    await insertSession(payload);
  } catch (e) {
    // Insert mislukt → alsnog in queue
    console.warn('[Sessions] Insert mislukt, in wachtrij:', e.message);
    const q = getQueue();
    q.push(payload);
    saveQueue(q);
  }
}

// ── Automatisch flushen bij netwerkherstel ─────────────
window.addEventListener('online', () => flushQueue());

// Probeer bij laden bestaande queue te legen zodra auth klaar is
(async () => {
  await window.fbAuthReady;
  flushQueue();
})();

// ── Expose aan window voor timer.js (geen ES module) ───
window.recordFocusSession = recordFocusSession;
