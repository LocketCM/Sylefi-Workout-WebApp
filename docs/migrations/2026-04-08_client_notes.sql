-- 2026-04-08: Add a free-form notes column to clients so Meg can jot down
-- contact info, preferences, emergency contacts, etc. Coach-only field.
--
-- Existing RLS already restricts client updates to the row owner OR an admin,
-- so no extra policy is needed. The client can technically read this if they
-- query their own row, so don't put anything truly private here.
--
-- After running, redeploy.

alter table clients
  add column if not exists notes text;
