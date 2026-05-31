// ══════════════════════════════════════════════════════
// supabaseClient.js — Supabase client initialisatie
//
// Vul HIER jouw waarden in (enkel dit bestand aanpassen):
//   SUPABASE_URL    → Dashboard → Settings → API → Project URL
//   SUPABASE_ANON_KEY → Dashboard → Settings → API → anon public key
// ══════════════════════════════════════════════════════

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL      = 'https://orpcsxaboxrvzooooacz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-1guDFsRshvxH_cJkn1PMg_he4h_H7K';

// ── In-memory auth-lock ─────────────────────────────────
// supabase-js gebruikt standaard `navigator.locks` om de auth-token te
// beschermen. In sommige omstandigheden (een achtergrond-tab, een service
// worker, of een context die crasht zonder de lock vrij te geven) blijft die
// lock EXCLUSIEF vastzitten. Élke query die de token nodig heeft wacht dan
// tot z'n eigen timeout → "Laden..." dat nooit weggaat en "de server reageert
// niet", terwijl het netwerk prima werkt.
//
// We vervangen de cross-context lock door een eenvoudige in-memory keten die
// alleen bínnen dit tabblad serialiseert. Geen gedeelde lock = geen deadlock.
// De token blijft gewoon in localStorage staan, dus sessies overleven herladen.
let _lockChain = Promise.resolve();
function inMemoryLock(_name, _acquireTimeout, fn) {
  const run = _lockChain.then(() => fn());
  // Houd de keten draaiende, ook als fn faalt — zodat één fout de volgende
  // operatie niet permanent blokkeert.
  _lockChain = run.then(() => {}, () => {});
  return run;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'sb-orpcsxaboxrvzooooacz-auth-token',
    lock: inMemoryLock,
  },
});
