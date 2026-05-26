-- 2026-05-06: Per-row archive flag for Meg's Activity feed.
--
-- The earlier "Clear" feature used a single global app_settings timestamp
-- (`activity_cleared_at`) and hid every item older than it. That worked for
-- "wipe everything", but doesn't support the email-style multi-select Meg
-- now wants: "clear THIS one and that one, but leave the rest."
--
-- This migration moves the dismissal from a global marker to a per-row
-- boolean on each table, and backfills any rows that were already hidden by
-- the previous global mechanism so nothing reappears in her feed.
--
-- After running, redeploy.

-- ---------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------
alter table workout_logs
  add column if not exists coach_archived boolean not null default false;

alter table client_quick_logs
  add column if not exists coach_archived boolean not null default false;

-- Indexes for the common "show me unarchived activity" query path.
create index if not exists workout_logs_active_idx
  on workout_logs (completed_at desc) where coach_archived = false and workout_completed = true;

create index if not exists client_quick_logs_active_idx
  on client_quick_logs (created_at desc) where coach_archived = false;

-- ---------------------------------------------------------------
-- 2. Backfill from the old global cleared-at marker (if any)
-- ---------------------------------------------------------------
-- If Meg already hit the previous "Clear" button, app_settings.activity_cleared_at
-- holds a timestamp string. Honor it by archiving rows that were older than
-- that marker, then drop the now-obsolete setting. If she never used it, the
-- block is a no-op.
do $$
declare
  v_value   text;
  v_cleared timestamptz;
begin
  select case when jsonb_typeof(value) = 'string' then value #>> '{}' else null end
    into v_value
  from app_settings
  where key = 'activity_cleared_at';

  if v_value is not null then
    v_cleared := v_value::timestamptz;
    update workout_logs
      set coach_archived = true
      where workout_completed = true
        and completed_at is not null
        and completed_at <= v_cleared;
    update client_quick_logs
      set coach_archived = true
      where created_at <= v_cleared;
    delete from app_settings where key = 'activity_cleared_at';
  end if;
end $$;

-- ---------------------------------------------------------------
-- 3. Defense-in-depth: prevent non-admin updates to coach_archived
-- ---------------------------------------------------------------
-- workout_logs has client UPDATE policies (clients log their own progress),
-- and Postgres RLS doesn't restrict columns inside an UPDATE — so without a
-- guard, a client could flip coach_archived on their own rows and silently
-- hide their activity from Meg's feed. Same abuse class we closed for
-- coach_seen on client_quick_logs last week. Trigger: if the caller isn't
-- an admin, snap coach_archived back to its previous value on update.
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

drop trigger if exists workout_logs_archive_guard on workout_logs;
create trigger workout_logs_archive_guard
  before update on workout_logs
  for each row execute function workout_logs_archive_guard();

-- client_quick_logs currently has no client UPDATE policy, but add the same
-- guard so a future policy change can't accidentally open this hole.
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

drop trigger if exists client_quick_logs_archive_guard on client_quick_logs;
create trigger client_quick_logs_archive_guard
  before update on client_quick_logs
  for each row execute function client_quick_logs_archive_guard();

-- Both tables already have admin (coach) full-access policies, so Meg can
-- archive freely; the trigger only no-ops for clients.
--
-- Sanity check after running:
--   select count(*) filter (where coach_archived) as archived,
--          count(*) filter (where not coach_archived) as active
--   from workout_logs where workout_completed = true;
--
--   select count(*) filter (where coach_archived) as archived,
--          count(*) filter (where not coach_archived) as active
--   from client_quick_logs;
