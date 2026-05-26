-- 2026-05-06: Lock down client_quick_logs.coach_seen on insert.
--
-- Follow-up to the client_quick_logs migration. The original RLS lets a
-- client insert their own rows but doesn't restrict which columns they can
-- set — so a client could submit { coach_seen: true } and bypass Meg's
-- unread-badge counter for that entry.
--
-- Not a privacy breach (they can only affect their own rows), but it lets a
-- client silently hide their own activity from the coach. We add a trigger
-- that forces coach_seen=false on insert unless the caller is an admin.
-- The coach's CoachLogWorkout flow doesn't use this table, but if it ever
-- does, admins can still set the flag freely.
--
-- After running, redeploy.

create or replace function client_quick_logs_coach_seen_insert_guard()
returns trigger
language plpgsql
as $$
begin
  -- Anyone other than admin gets coach_seen forced to false. The coach
  -- (admin) keeps the ability to insert pre-seen rows in the future.
  if (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    new.coach_seen := false;
  end if;
  return new;
end;
$$;

drop trigger if exists client_quick_logs_coach_seen_insert_guard on client_quick_logs;
create trigger client_quick_logs_coach_seen_insert_guard
  before insert on client_quick_logs
  for each row execute function client_quick_logs_coach_seen_insert_guard();

-- Sanity check after running:
--   -- as a client, this insert should land with coach_seen = false regardless
--   -- of what was submitted:
--   select id, exercise, coach_seen
--   from client_quick_logs
--   order by created_at desc limit 5;
