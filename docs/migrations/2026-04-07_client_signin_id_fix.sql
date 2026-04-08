-- 2026-04-07: Fix "column reference 'id' is ambiguous" in client_signin.
--
-- The previous version of client_signin used `RETURNS TABLE (id uuid, ...)`,
-- which declares an OUT parameter named `id`. Inside the function body,
-- `update clients set ... where id = v_client_id` then becomes ambiguous
-- because Postgres can't tell whether `id` means the OUT parameter or the
-- clients.id column.
--
-- Fix: rename the OUT columns and fully qualify the update.
-- Must DROP first because changing the return type of an existing function
-- isn't allowed by CREATE OR REPLACE.

drop function if exists client_signin(text);

create or replace function client_signin(p_code text)
returns table (client_id uuid, first_name text, last_name text)
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
  from   public.clients c
  where  c.access_code = upper(trim(p_code))
    and  c.status = 'active'
  limit 1;

  if v_client_id is null then
    raise exception 'Invalid sign-in code';
  end if;

  update public.clients
     set user_id = v_caller_uid
   where public.clients.id = v_client_id;

  if v_old_uid is not null and v_old_uid <> v_caller_uid then
    begin
      delete from auth.users where auth.users.id = v_old_uid and is_anonymous = true;
    exception when others then
      null;
    end;
  end if;

  client_id  := v_client_id;
  first_name := v_first;
  last_name  := v_last;
  return next;
end;
$$;

grant execute on function client_signin(text) to anon, authenticated;
