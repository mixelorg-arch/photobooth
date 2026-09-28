-- SnapBox — layout sync.
--
-- Run once in the Supabase SQL editor of the `ledger` project. It is
-- idempotent: running it again changes nothing.
--
-- What syncs: layouts and the custom paper sizes they need. Nothing else.
-- **No photograph is ever sent anywhere by this.** Session photos live in the
-- tab and are dropped when the session ends; there is no code path from a
-- captured frame to this table, and the payload is validated below to make
-- that hard to get wrong later.
--
-- How access works, and why it is not the usual RLS-with-policies:
--
-- A booth has no accounts. There is nobody to authenticate, so a policy has
-- nothing to check a request against. Instead the table is closed to the anon
-- role entirely and the only way in is through two SECURITY DEFINER functions
-- that both take a sync code. The code is a long random string generated on
-- the device, so the anon key on its own — which is public, and sits in the
-- deployed JavaScript of several of these apps already — opens nothing. You
-- need the code, and the code is only ever shown in the operator console.
--
-- That is a shared secret, not an identity. Anyone you give the code to can
-- read and overwrite the layouts under it. Treat it like the key to a
-- filing cabinet: fine for designs, not for anything private.

create table if not exists snapbox_layouts (
  id          bigint generated always as identity primary key,
  sync_code   text        not null,
  layout_id   text        not null,
  payload     jsonb       not null,
  deleted     boolean     not null default false,
  updated_at  timestamptz not null default now(),
  constraint snapbox_layouts_unique unique (sync_code, layout_id),
  -- A layout is a few kilobytes of geometry and text. Anything an order of
  -- magnitude past that is not a layout, and the table should not take it.
  constraint snapbox_layouts_size check (pg_column_size(payload) < 262144)
);

create index if not exists snapbox_layouts_code_time
  on snapbox_layouts (sync_code, updated_at);

alter table snapbox_layouts enable row level security;

-- Deliberately no policies. With RLS on and no policy, the table is closed to
-- anon and authenticated alike; everything goes through the functions below.
revoke all on snapbox_layouts from anon, authenticated;

-- ---------------------------------------------------------------- pull ----
create or replace function snapbox_pull(p_code text,
                                        p_since timestamptz default 'epoch')
returns table (layout_id text, payload jsonb, deleted boolean,
               updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select l.layout_id, l.payload, l.deleted, l.updated_at
  from snapbox_layouts l
  where l.sync_code = p_code
    and length(coalesce(p_code, '')) >= 16
    and l.updated_at > p_since
  order by l.updated_at
  limit 500;
$$;

-- ---------------------------------------------------------------- push ----
create or replace function snapbox_push(p_code text, p_items jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  n    int := 0;
begin
  -- A short code would make guessing feasible, so it is refused outright
  -- rather than quietly writing somewhere nobody can find again.
  if length(coalesce(p_code, '')) < 16 then
    raise exception 'sync code too short';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'too many items in one push';
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    n := n + 1;
    if coalesce(item->>'id', '') = '' then
      raise exception 'item % has no id', n;
    end if;
    -- The shape a layout has. Anything else is a bug upstream or a misuse of
    -- the endpoint, and either way it does not belong in this table.
    if jsonb_typeof(item->'payload') <> 'object' then
      raise exception 'item % has no payload object', n;
    end if;

    insert into snapbox_layouts (sync_code, layout_id, payload, deleted, updated_at)
    values (p_code, item->>'id', item->'payload',
            coalesce((item->>'deleted')::boolean, false), now())
    on conflict on constraint snapbox_layouts_unique
    do update set payload    = excluded.payload,
                  deleted    = excluded.deleted,
                  updated_at = now();
  end loop;

  return now();
end;
$$;

revoke all on function snapbox_pull(text, timestamptz) from public;
revoke all on function snapbox_push(text, jsonb) from public;
grant execute on function snapbox_pull(text, timestamptz) to anon, authenticated;
grant execute on function snapbox_push(text, jsonb) to anon, authenticated;
