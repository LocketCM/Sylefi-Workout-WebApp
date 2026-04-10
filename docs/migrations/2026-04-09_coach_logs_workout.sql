-- 2026-04-09: Let the coach log a workout on behalf of a client.
--
-- Meg sometimes trains clients in person. Up to now, the only way a
-- workout_log row got created was through the client's own device — if
-- she trained Sarah in the studio, Sarah still had to open the app
-- herself to tick things off. This migration closes that gap.
--
-- What it adds:
--   1. workout_logs.logged_by_coach boolean — marks sessions she logged
--      for a client so the history view can show "Logged by Meg" and
--      Activity doesn't ping her about a workout she just entered.
--
--   2. coach_save_workout_log(...) — a SECURITY DEFINER RPC that lets
--      an admin insert OR update a workout_log row for any client.
--      All the usual app-level writes stay the same; this RPC is
--      strictly the coach-side in-person flow. We use SECURITY DEFINER
--      so whatever RLS exists on workout_logs doesn't need to grow a
--      new "admin can insert" policy — the function explicitly checks
--      the caller's role before touching anything.
--
--   3. When p_finish = true the RPC also sets coach_seen = true, since
--      the coach already knows about a workout she just entered herself
--      — otherwise the Activity feed would badge its own entry.
--
-- After running, redeploy so the new CoachLogWorkout page can call the RPC.

alter table workout_logs
  add column if not exists logged_by_coach boolean not null default false;

-- Upsert a workout_log as the coach. Returns the row id.
--
-- Arguments:
--   p_log_id        — existing row id to update, or null to insert new
--   p_client_id     — which client the session belongs to
--   p_program_id    — which program the workout comes from
--   p_workout_day   — the workout's local id inside program.workouts
--   p_workout_title — snapshot of workout title
--   p_exercise_logs — jsonb array of exercise logs (same shape as client flow)
--   p_client_notes  — notes field
--   p_finish        — if true, mark workout_completed=true + completed_at=now
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
  v_role text := (auth.jwt() -> 'user_metadata' ->> 'role');
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
      true  -- coach logged it, so it's already "seen"
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

grant execute on function coach_save_workout_log(
  uuid, uuid, uuid, text, text, jsonb, text, boolean
) to authenticated;

-- Sanity check after running:
--   select id, client_id, workout_title, workout_completed, logged_by_coach, completed_at
--   from workout_logs
--   where logged_by_coach = true
--   order by completed_at desc nulls last;
