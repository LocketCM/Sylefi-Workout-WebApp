-- 2026-04-10: Workout-level templates.
--
-- Meg builds lots of similar workouts: "Lower A", "Upper Push", etc.
-- Instead of recreating those from scratch each time she writes a
-- program, she can now save individual workouts as reusable templates
-- and pull them in when building a new program.
--
-- Separate from program-level templates (which are entire multi-week
-- plans). A workout template is just one day's exercises — the
-- building block she slots into a program.
--
-- After running, redeploy so the template save/load UI appears.

create table if not exists workout_templates (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  category   text,  -- optional label: Lower, Upper, Push, Pull, Full Body, etc.
  exercises  jsonb not null default '[]',  -- same shape as programs.workouts[].exercises
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table workout_templates enable row level security;

-- Coach (admin) can do everything. No client access needed.
create policy "admin_full_access" on workout_templates
  for all
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- Sanity check:
--   select id, title, category, jsonb_array_length(exercises) as ex_count from workout_templates;
