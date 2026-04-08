-- 2026-04-08: Coach-only "Clear conversation" action.
--
-- Lets Meg wipe all messages for a single client. Wrapped in a
-- SECURITY DEFINER function so the delete doesn't have to fight whatever
-- RLS policies exist on the messages table — we explicitly check the caller
-- is the admin/coach inside the function.
--
-- After running, redeploy.

create or replace function clear_client_messages(p_client_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    text := (auth.jwt() -> 'user_metadata' ->> 'role');
  v_deleted integer;
begin
  if v_role is distinct from 'admin' then
    raise exception 'Only the coach can clear conversations';
  end if;

  delete from messages where client_id = p_client_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function clear_client_messages(uuid) to authenticated;
