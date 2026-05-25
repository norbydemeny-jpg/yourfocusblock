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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
