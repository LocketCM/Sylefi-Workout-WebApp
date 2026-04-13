-- 2026-04-10: Support timed exercises (planks, wall sits, etc.)
--
-- Some exercises are measured in time, not reps. Meg prescribes
-- "3 sets × 45 seconds" and the client sees a countdown timer in
-- the workout session.
--
-- Adds two columns to the exercise library:
--   exercise_type    — 'reps' (default) or 'timed'
--   default_duration — default hold time in seconds (e.g. 45)
--
-- The program-level and log-level exercise data is JSONB, so those
-- fields (duration, target_duration, duration_completed) are added
-- at the application layer — no column changes needed for
-- programs.workouts or workout_logs.exercise_logs.
--
-- After running, redeploy so the new timer UI appears.

alter table exercises
  add column if not exists exercise_type text not null default 'reps'
    check (exercise_type in ('reps', 'timed'));

alter table exercises
  add column if not exists default_duration integer;  -- seconds

-- Sanity check:
--   select name, exercise_type, default_duration from exercises order by name;
