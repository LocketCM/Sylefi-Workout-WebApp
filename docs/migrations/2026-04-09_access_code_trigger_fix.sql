-- 2026-04-09: Fix "function gen_random_bytes(integer) does not exist"
--
-- The original clients_generate_access_code() trigger called
-- pgcrypto's gen_random_bytes(9) without qualifying the schema.
-- On Supabase, pgcrypto lives in the `extensions` schema, not `public`,
-- so the unqualified call blows up whenever the trigger fires — which
-- happens during claim_invite, making the Join flow fail.
--
-- Fix: use the built-in gen_random_uuid() (native to Postgres 13+, no
-- extension needed), strip the dashes, uppercase, and take 12 chars.
-- This gives the same 12-character A–Z/0–9 code format clients already
-- have, with no extension dependency.
--
-- After running, redeploy is NOT required — this is a DB-only fix.

create or replace function clients_generate_access_code()
returns trigger language plpgsql as $$
begin
  if new.user_id is not null and (new.access_code is null or new.access_code = '') then
    new.access_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  end if;
  return new;
end $$;

-- Also backfill any row that might have ended up with a null access_code
-- because the trigger errored previously. (Shouldn't be any, but safe.)
update clients
set access_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
where user_id is not null and (access_code is null or access_code = '');

-- Sanity check after running:
--   select first_name, last_name, access_code from clients where status = 'active';
