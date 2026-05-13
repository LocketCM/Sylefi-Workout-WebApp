-- 2026-05-12: Move admin-role check from user_metadata to app_metadata.
--
-- WHY: Every prior migration that gated coach-only behavior used
--
--     (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
--
-- but `user_metadata` (a.k.a. raw_user_meta_data) is END-USER editable.
-- Any signed-in client could call supabase.auth.updateUser({ data: {
-- role: 'admin' } }) in DevTools, sign back in, and their JWT would
-- satisfy every admin policy and SECURITY DEFINER check below. That's
-- exactly the exploit Supabase's Advisor flagged as CRITICAL.
--
-- `app_metadata` (raw_app_meta_data) is writeable only by the service
-- role (server / SQL editor), not by end users — so the same JWT-shape
-- check is safe once we switch fields.
--
-- ORDER OF OPERATIONS — IMPORTANT
-- -------------------------------
-- This migration ONLY changes the policies/functions. It does NOT set
-- anyone's app_metadata. Before running it, make sure Meg's auth.users
-- row has raw_app_meta_data.role = 'admin', or she will be locked out
-- of every admin-only path the moment this lands.
--
-- Run THIS first, in the Supabase SQL editor (one-time setup), filling
-- in Meg's email:
--
--     update auth.users
--       set raw_app_meta_data =
--         coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
--       where email = 'meg@example.com';
--
-- After running this migration, Meg must sign out and sign back in on
-- the live site so her JWT refreshes with the new app_metadata. (Until
-- she does, her existing JWT still carries the old user_metadata role,
-- which the new policies will ignore — i.e. she'll act like a client.)
--
-- The migration is idempotent: every policy uses `drop policy if
-- exists` and every function uses `create or replace`.

-- =====================================================================
-- 1. POLICIES
-- =====================================================================

-- app_settings: only the coach can write. (2026-04-08)
drop policy if exists "app_settings write for admin" on app_settings;
create policy "app_settings write for admin"
  on app_settings for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- workout_templates: coach has full access, clients have none. (2026-04-10)
drop policy if exists "admin_full_access" on workout_templates;
create policy "admin_full_access" on workout_templates
  for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- client_quick_logs: coach has full access (clients keep their own
-- read/insert/delete policies, which already key off auth.uid()). (2026-05-06)
drop policy if exists "client_quick_logs admin full access" on client_quick_logs;
create policy "client_quick_logs admin full access"
  on client_quick_logs for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- =====================================================================
-- 2. TRIGGER FUNCTIONS
-- =====================================================================

-- workout_logs UPDATE: keep coach_seen safe from client tampering. (2026-04-07)
create or replace function workout_logs_coach_seen_guard()
returns trigger language plpgsql as $$
declare
  is_admin boolean := (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
  just_completed boolean := (new.workout_completed = true)
    and (old.workout_completed is distinct from true);
begin
  if just_completed then
    new.coach_seen := false;
    return new;
  end if;

  if not is_admin then
    new.coach_seen := old.coach_seen;
  end if;

  return new;
end $$;

-- client_quick_logs INSERT: force coach_seen=false unless admin inserted.
-- (2026-05-06)
create or replace function client_quick_logs_coach_seen_insert_guard()
returns trigger
language plpgsql
as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    new.coach_seen := false;
  end if;
  return new;
end;
$$;

-- workout_logs UPDATE: keep coach_archived safe from client tampering.
-- (2026-05-06)
create or replace function workout_logs_archive_guard()
returns trigger
language plpgsql
as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    new.coach_archived := old.coach_archived;
  end if;
  return new;
end;
$$;

-- client_quick_logs UPDATE: same archive guard. (2026-05-06)
create or replace function client_quick_logs_archive_guard()
returns trigger
language plpgsql
as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    new.coach_archived := old.coach_archived;
  end if;
  return new;
end;
$$;

-- =====================================================================
-- 3. SHARED HELPER
-- =====================================================================
-- public.is_coach() lives outside the docs/migrations history (it was
-- created in the initial schema, before this folder existed). It's the
-- helper that backs the *_coach_all policies on clients, exercises,
-- programs, workout_logs, messages, announcements, and feature_requests,
-- and is also called by the regenerate_invite_code RPC. Updating this
-- one function quietly fixes every caller — no policy rewrites needed
-- on those seven tables.
create or replace function public.is_coach()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- =====================================================================
-- 4. SECURITY DEFINER RPCs
-- =====================================================================

-- clear_client_messages: coach wipes one client's conversation. (2026-04-08)
create or replace function clear_client_messages(p_client_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    text := (auth.jwt() -> 'app_metadata' ->> 'role');
  v_deleted integer;
begin
  if v_role is distinct from 'admin' then
    raise exception 'Only the coach can clear conversations';
  end if;

  delete from messages where client_id = p_client_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- coach_save_workout_log: coach logs/edits a workout for a client. (2026-04-09)
create or replace function coach_save_workout_log(
  p_log_id        uuid,
  p_client_id     uuid,
  p_program_id    uuid,
  p_workout_day   text,
  p_workout_title text,
  p_exercise_logs jsonb,
  p_client_notes  text,
  p_finish        boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := (auth.jwt() -> 'app_metadata' ->> 'role');
  v_id   uuid;
begin
  if v_role is distinct from 'admin' then
    raise exception 'Only the coach can log workouts on behalf of clients';
  end if;

  if p_log_id is null then
    insert into workout_logs (
      client_id, program_id, workout_day, workout_title,
      exercise_logs, client_notes,
      workout_completed, completed_at,
      logged_by_coach, coach_seen
    ) values (
      p_client_id, p_program_id, p_workout_day, coalesce(p_workout_title, 'Workout'),
      coalesce(p_exercise_logs, '[]'::jsonb), p_client_notes,
      coalesce(p_finish, false),
      case when p_finish then now() else null end,
      true,
      true
    )
    returning id into v_id;
  else
    update workout_logs
    set
      exercise_logs     = coalesce(p_exercise_logs, exercise_logs),
      client_notes      = p_client_notes,
      workout_completed = case when p_finish then true else workout_completed end,
      completed_at      = case when p_finish then now() else completed_at end,
      logged_by_coach   = true,
      coach_seen        = true
    where id = p_log_id
    returning id into v_id;

    if v_id is null then
      raise exception 'workout_log % not found', p_log_id;
    end if;
  end if;

  return v_id;
end;
$$;

-- =====================================================================
-- 5. VERIFICATION QUERIES (run manually after the migration lands)
-- =====================================================================
--
-- a) Confirm no policy or function still references user_metadata:
--
--    select schemaname, tablename, policyname,
--           regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\s+', ' ', 'g') as expr
--    from pg_policies
--    where (qual || coalesce(with_check, '')) ilike '%user_metadata%';
--    -- expected: 0 rows
--
--    select n.nspname || '.' || p.proname as fn
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and pg_get_functiondef(p.oid) ilike '%user_metadata%';
--    -- expected: 0 rows
--
-- b) Confirm Meg's app_metadata is set:
--
--    select id, email, raw_app_meta_data
--    from auth.users
--    where email = 'meg@example.com';
--    -- expected: raw_app_meta_data contains "role": "admin"
--
-- c) From the live site, sign out + sign back in as Meg, then load the
--    Activity page. It should populate normally. If it 403s on the
--    queries, her JWT hasn't refreshed yet (force-refresh / re-sign-in).
