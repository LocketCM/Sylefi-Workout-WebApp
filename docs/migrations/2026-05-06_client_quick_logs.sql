-- 2026-05-06: Quick Log — let clients record extra activities.
--
-- Clients have asked for a way to log things they do outside their structured
-- program (walks, hikes, a yoga class, a quick run). Up to now the only
-- place to record activity was inside Meg's curated workouts, which made
-- those one-off bits feel out of place.
--
-- This adds a tiny standalone table the client owns. Each row is a free-text
-- exercise name, an optional sets count, and a notes field. Meg's Activity
-- feed merges these in alongside completed workouts so she sees what her
-- clients are doing on their own time.
--
-- After running, redeploy.

create table if not exists client_quick_logs (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  exercise    text not null,
  sets        integer,           -- nullable: optional
  notes       text,
  coach_seen  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists client_quick_logs_client_id_created_at_idx
  on client_quick_logs (client_id, created_at desc);

create index if not exists client_quick_logs_unseen_idx
  on client_quick_logs (created_at desc) where coach_seen = false;

alter table client_quick_logs enable row level security;

-- Coach (admin) — full access. Keyed off app_metadata so end users can't
-- spoof admin via supabase.auth.updateUser (see 2026-05-12 migration).
drop policy if exists "client_quick_logs admin full access" on client_quick_logs;
create policy "client_quick_logs admin full access"
  on client_quick_logs for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Client — read/insert/delete their own rows. No update path: a quick log is
-- a fire-and-forget entry. If the client wants to fix something, they delete
-- and re-add. Keeps the data simple.
drop policy if exists "client_quick_logs client read own" on client_quick_logs;
create policy "client_quick_logs client read own"
  on client_quick_logs for select
  using (client_id = (select id from clients where user_id = auth.uid()));

drop policy if exists "client_quick_logs client insert own" on client_quick_logs;
create policy "client_quick_logs client insert own"
  on client_quick_logs for insert
  with check (client_id = (select id from clients where user_id = auth.uid()));

drop policy if exists "client_quick_logs client delete own" on client_quick_logs;
create policy "client_quick_logs client delete own"
  on client_quick_logs for delete
  using (client_id = (select id from clients where user_id = auth.uid()));

-- Sanity check after running:
--   select id, client_id, exercise, sets, notes, coach_seen, created_at
--   from client_quick_logs order by created_at desc limit 20;
