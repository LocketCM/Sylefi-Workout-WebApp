-- 2026-04-07: Persistent client sign-in codes
-- Each active client gets a permanent 12-char access_code that lets them
-- sign back in from any device without needing a new invite. The original
-- 6-char invite_code remains single-use for first-time onboarding.
--
-- After running, redeploy the app (npm run deploy).

-- 1. Column.
alter table clients add column if not exists access_code text unique;

-- 2. Trigger: auto-generate an access_code the first time a client is bound
--    to an auth user (i.e. when user_id transitions from null to not-null).
create or replace function clients_generate_access_code()
returns trigger language plpgsql as $$
begin
  if new.user_id is not null and (new.access_code is null or new.access_code = '') then
    new.access_code := upper(
      substr(
        translate(
          encode(gen_random_bytes(9), 'base64'),
          '+/=', 'XYZ'
        ),
        1, 12
      )
    );
  end if;
  return new;
end $$;

drop trigger if exists clients_set_access_code on clients;
create trigger clients_set_access_code
  before insert or update on clients
  for each row execute function clients_generate_access_code();

-- 3. Backfill: every claimed client should have a code now.
update clients
set access_code = upper(
  substr(translate(encode(gen_random_bytes(9), 'base64'), '+/=', 'XYZ'), 1, 12)
)
where user_id is not null and (access_code is null or access_code = '');

-- 4. Sign-in RPC. SECURITY DEFINER so it can re-bind clients.user_id to the
--    current anonymous session, even though RLS would normally block it.
--
--    Flow on the client:
--      1. supabase.auth.signInAnonymously()  → fresh anonymous user
--      2. supabase.rpc('client_signin', { p_code: 'AB12CD34EF56' })
--      3. The RPC validates the code, then sets clients.user_id = auth.uid()
--      4. Client now has access to their own row + programs/logs/messages
--         via existing RLS policies that already check user_id = auth.uid()
create or replace function client_signin(p_code text)
returns table (id uuid, first_name text, last_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id  uuid;
  v_first      text;
  v_last       text;
  v_old_uid    uuid;
  v_caller_uid uuid := auth.uid();
begin
  if v_caller_uid is null then
    raise exception 'No active session — sign in anonymously first';
  end if;

  select c.id, c.first_name, c.last_name, c.user_id
  into   v_client_id, v_first, v_last, v_old_uid
  from   clients c
  where  c.access_code = upper(trim(p_code))
    and  c.status = 'active'
  limit 1;

  if v_client_id is null then
    raise exception 'Invalid sign-in code';
  end if;

  -- Re-bind to the current anonymous session.
  update clients set user_id = v_caller_uid where id = v_client_id;

  -- Best-effort: clean up the orphaned old anonymous user, if any.
  -- (Ignored if it fails — not critical, just keeps auth.users tidy.)
  if v_old_uid is not null and v_old_uid <> v_caller_uid then
    begin
      delete from auth.users where id = v_old_uid and is_anonymous = true;
    exception when others then
      -- swallow; orphan cleanup is not load-bearing
      null;
    end;
  end if;

  return query select v_client_id, v_first, v_last;
end;
$$;

-- 5. Allow anonymous (just-signed-in) users to call this RPC.
grant execute on function client_signin(text) to anon, authenticated;

-- Sanity check after running:
--   select first_name, last_name, access_code from clients where status = 'active';
--   You should see a 12-character code for every active client.
