-- 2026-04-07: Program templates + unassigned drafts
-- Lets Meg build programs without picking a client first, and save reusable templates.
--
-- After running, redeploy the app (npm run deploy).

-- 1. Allow programs to exist without a client (unassigned drafts + templates).
alter table programs alter column client_id   drop not null;
alter table programs alter column client_name drop not null;

-- 2. New flag: is this a reusable template?
alter table programs add column if not exists is_template boolean not null default false;

-- 3. Templates and unassigned drafts must never be 'active' (published).
--    Only assigned programs can be published. Enforce in DB so a future bug
--    in the UI can't accidentally publish an unassigned program.
alter table programs drop constraint if exists programs_template_not_active;
alter table programs add  constraint programs_template_not_active
  check (
    (client_id is not null) or (status <> 'active')
  );

-- 4. RLS: coach already has full access via is_coach(). Clients should NEVER
--    see templates or unassigned drafts (they have no client_id, so the
--    existing "client_id = (select id from clients where user_id = auth.uid())"
--    policy already excludes them — null never equals anything). No change needed,
--    but let's verify with a quick sanity-check query you can run manually:
--
--    select id, title, status, is_template, client_id from programs
--    where client_id is null;
--
--    Should only return rows when run as the coach.

-- Done.
