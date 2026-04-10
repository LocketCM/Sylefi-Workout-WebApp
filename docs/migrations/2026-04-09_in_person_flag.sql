-- 2026-04-09: Mark clients Meg trains in person.
--
-- Some of Meg's clients follow the app remotely, some she sees in the
-- studio, and a bunch are both ("I give you a program AND I see you
-- Tuesdays"). She wants a quick way to filter the Clients page down to
-- just the in-person folks so she can see at a glance who's on the
-- studio schedule this week.
--
-- Kept this as a boolean (not a 3-way enum) because the distinction
-- that actually matters is "do I need to physically show up for this
-- person?" — everything else is ratio. Easy to promote later.
--
-- After running, redeploy so the new tab + toggle appear in the UI.

alter table clients
  add column if not exists trains_in_person boolean not null default false;

-- Sanity check:
--   select first_name, last_name, trains_in_person from clients order by first_name;
