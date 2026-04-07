-- 2026-04-07: Coach completion notifications
-- Adds a "coach_seen" flag on workout_logs so the coach gets notified when
-- clients complete workouts. New completions show up unseen; viewing the
-- Activity page marks them seen.
--
-- After running, redeploy the app (npm run deploy).

-- 1. Add the column.
alter table workout_logs add column if not exists coach_seen boolean not null default false;

-- 2. Backfill: anything already completed before today should NOT show as a
--    new notification (otherwise Meg gets a giant badge on first load).
update workout_logs
set coach_seen = true
where workout_completed = true and coach_seen = false;

-- 3. Trigger: auto-flag completions as unseen, and block clients from
--    silencing notifications by writing coach_seen = true themselves.
--
--    Behavior:
--      - When a workout transitions from incomplete -> complete (by anyone),
--        coach_seen is forced to false. This is what generates the badge.
--      - Otherwise, only the coach (role=admin in JWT) can change coach_seen.
create or replace function workout_logs_coach_seen_guard()
returns trigger language plpgsql as $$
declare
  is_admin boolean := (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin';
  just_completed boolean := (new.workout_completed = true)
    and (old.workout_completed is distinct from true);
begin
  -- New completion → always reset coach_seen so the coach gets pinged.
  if just_completed then
    new.coach_seen := false;
    return new;
  end if;

  -- Non-coach updates can't otherwise touch coach_seen.
  if not is_admin then
    new.coach_seen := old.coach_seen;
  end if;

  return new;
end $$;

drop trigger if exists workout_logs_coach_seen_guard on workout_logs;
create trigger workout_logs_coach_seen_guard
  before update on workout_logs
  for each row execute function workout_logs_coach_seen_guard();

-- Same idea for INSERTs: a fresh row inserted as already-completed counts as
-- a new notification. Default is false, but be explicit.
create or replace function workout_logs_coach_seen_insert_guard()
returns trigger language plpgsql as $$
begin
  if new.workout_completed = true then
    new.coach_seen := false;
  end if;
  return new;
end $$;

drop trigger if exists workout_logs_coach_seen_insert_guard on workout_logs;
create trigger workout_logs_coach_seen_insert_guard
  before insert on workout_logs
  for each row execute function workout_logs_coach_seen_insert_guard();

-- Sanity check:
--   select count(*) from workout_logs where workout_completed = true and coach_seen = false;
--   should return 0 right after running this migration.
