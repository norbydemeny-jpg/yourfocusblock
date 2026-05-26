-- ════════════════════════════════════════════════════════════════════
--   FocusBlock — Supabase RLS / data fixes
--   Plak deze blokken in Supabase → SQL Editor en druk Run.
--   Veilig om meerdere keren te draaien (DROP POLICY IF EXISTS + CREATE).
-- ════════════════════════════════════════════════════════════════════

-- ─── 1) PROFILES ────────────────────────────────────────────────────
--  Iedere ingelogde user mag alle profielen lezen (nodig voor zoeken,
--  vriendenlijst-avatars, leaderboard, top-week widget en friend-stats).
--  Inserten/updaten alleen je eigen rij.

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());


-- ─── 2) FRIENDSHIPS ─────────────────────────────────────────────────
--  Je mag rijen zien waar jij betrokken bent.
--  Aanvragen sturen = jij bent de requester. Aannemen/weigeren mag
--  alleen de receiver. Verwijderen mag beide.

alter table public.friendships enable row level security;

drop policy if exists "friendships_select_involved" on public.friendships;
create policy "friendships_select_involved"
  on public.friendships for select
  to authenticated
  using (requester_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists "friendships_insert_requester" on public.friendships;
create policy "friendships_insert_requester"
  on public.friendships for insert
  to authenticated
  with check (requester_id = auth.uid());

drop policy if exists "friendships_update_receiver" on public.friendships;
create policy "friendships_update_receiver"
  on public.friendships for update
  to authenticated
  using (receiver_id = auth.uid() or requester_id = auth.uid())
  with check (receiver_id = auth.uid() or requester_id = auth.uid());

drop policy if exists "friendships_delete_involved" on public.friendships;
create policy "friendships_delete_involved"
  on public.friendships for delete
  to authenticated
  using (requester_id = auth.uid() or receiver_id = auth.uid());


-- ─── 3) USER_STATUS ─────────────────────────────────────────────────
--  Iedereen ingelogd mag statussen lezen (voor het "vrienden aan het
--  studeren" widget). Eigen rij upserten.

alter table public.user_status enable row level security;

drop policy if exists "user_status_select_authenticated" on public.user_status;
create policy "user_status_select_authenticated"
  on public.user_status for select
  to authenticated
  using (true);

drop policy if exists "user_status_upsert_self" on public.user_status;
create policy "user_status_upsert_self"
  on public.user_status for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_status_update_self" on public.user_status;
create policy "user_status_update_self"
  on public.user_status for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ─── 4) STUDY_SESSIONS ──────────────────────────────────────────────
--  Eigen sessies: vol toegang. Sessies van vrienden: alleen SELECT
--  zodat het friend-stats popup en het leaderboard kunnen werken.

alter table public.study_sessions enable row level security;

drop policy if exists "study_sessions_own" on public.study_sessions;
create policy "study_sessions_own"
  on public.study_sessions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "study_sessions_select_friends" on public.study_sessions;
create policy "study_sessions_select_friends"
  on public.study_sessions for select
  to authenticated
  using (
    exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.receiver_id = study_sessions.user_id)
          or (f.receiver_id = auth.uid() and f.requester_id = study_sessions.user_id)
        )
    )
  );


-- ─── 5) REFERRALS (optioneel) ───────────────────────────────────────
alter table public.referrals enable row level security;

drop policy if exists "referrals_select_involved" on public.referrals;
create policy "referrals_select_involved"
  on public.referrals for select
  to authenticated
  using (referrer_id = auth.uid() or invited_user_id = auth.uid());

drop policy if exists "referrals_insert_self" on public.referrals;
create policy "referrals_insert_self"
  on public.referrals for insert
  to authenticated
  with check (referrer_id = auth.uid() or invited_user_id = auth.uid());


-- ─── 6) REALTIME — user_status publicatie ──────────────────────────
--  Voor de live "vriend X is aan het studeren" widget. Voegt user_status
--  toe aan de supabase_realtime publicatie zodat de client live changes
--  ontvangt. Veilig om opnieuw te draaien.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'user_status'
  ) then
    execute 'alter publication supabase_realtime add table public.user_status';
  end if;
end $$;

-- Voeg ook friendships toe zodat een nieuwe acceptatie meteen zichtbaar is.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'friendships'
  ) then
    execute 'alter publication supabase_realtime add table public.friendships';
  end if;
end $$;


-- ─── 7) BESTAANDE 'ONBEVESTIGDE' USERS BEVESTIGEN ───────────────────
--  Accounts die zijn aangemaakt VOOR jij email-confirmation uitzette
--  hebben email_confirmed_at = NULL. Die kunnen niet inloggen omdat
--  Supabase nog steeds confirmation eist voor die rijen.
--  Met deze query bevestig je ze allemaal in één keer.
--
--  Voer dit ALLEEN uit als je echt zeker bent dat de e-mailadressen
--  geldig zijn (niet typo's van testen).

-- update auth.users
--   set email_confirmed_at = now(),
--       confirmed_at       = now()
-- where email_confirmed_at is null;

-- (Verwijder de '--' aan het begin van de update-regels om te draaien.)

-- ════════════════════════════════════════════════════════════════════
--   Klaar! Reload de app, en alles zou nu moeten werken:
--     ✓ Vrienden zien je profiel
--     ✓ Top-friends van de week vult zich met sessies van vrienden
--     ✓ Friend-stats popup laat per-vak data zien
--     ✓ Leaderboard toont alle vrienden + hun minuten
--     ✓ Oude users kunnen inloggen
-- ════════════════════════════════════════════════════════════════════
