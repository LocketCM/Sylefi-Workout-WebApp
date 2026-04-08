-- 2026-04-08: Two small features
--   1. Per-client weight unit preference (lbs / kg) — display label only,
--      no conversion. Stored on the clients row, defaults to 'lbs'.
--   2. Coach welcome message — a single global app-settings row Meg can edit
--      that shows on every client dashboard. Supports a {first_name} token.
--
-- After running, redeploy the app.

-- ---------------------------------------------------------------
-- 1. clients.weight_unit
-- ---------------------------------------------------------------
alter table clients
  add column if not exists weight_unit text not null default 'lbs'
  check (weight_unit in ('lbs', 'kg'));

-- ---------------------------------------------------------------
-- 2. app_settings (key/value table; one row per setting)
-- ---------------------------------------------------------------
-- Generic key/value table so future global settings (rest timer default,
-- accent color, etc.) can be added without new migrations.
create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- Seed the welcome message with a friendly default Meg can edit.
insert into app_settings (key, value)
values ('welcome_message', '"Welcome back, {first_name} 💪"'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- RLS for app_settings
-- ---------------------------------------------------------------
alter table app_settings enable row level security;

-- Anyone signed in (coach OR client) can read settings — they're global.
drop policy if exists "app_settings read for all authed" on app_settings;
create policy "app_settings read for all authed"
  on app_settings for select
  to authenticated
  using (true);

-- Only the coach (admin role) can write.
drop policy if exists "app_settings write for admin" on app_settings;
create policy "app_settings write for admin"
  on app_settings for all
  to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- ---------------------------------------------------------------
-- RLS for clients.weight_unit update
-- ---------------------------------------------------------------
-- Existing client RLS already lets a client update their own row
-- (where user_id = auth.uid()). The new column inherits that — no extra
-- policy needed. Just verify by running:
--   update clients set weight_unit = 'kg' where user_id = auth.uid();
-- as a logged-in client.

-- Sanity check after running:
--   select key, value from app_settings;
--   select first_name, weight_unit from clients;
