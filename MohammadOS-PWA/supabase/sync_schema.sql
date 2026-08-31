-- MohammadOS secure cloud snapshot phase
-- Run once in Supabase SQL Editor after the existing schema.sql.
-- The browser uses only the publishable key; RLS and this RPC enforce ownership.

create table if not exists public.sync_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by_device text not null check (length(trim(updated_by_device)) between 1 and 160),
  created_at timestamptz not null default now()
);

alter table public.sync_snapshots enable row level security;

revoke all on table public.sync_snapshots from anon, authenticated;
grant select on table public.sync_snapshots to authenticated;

drop policy if exists "Users can read their own sync snapshot" on public.sync_snapshots;
create policy "Users can read their own sync snapshot"
  on public.sync_snapshots for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create or replace function public.save_sync_snapshot(
  next_payload jsonb,
  expected_version bigint,
  device_id text
)
returns public.sync_snapshots
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  current_snapshot public.sync_snapshots;
  saved_snapshot public.sync_snapshots;
  next_version bigint;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if jsonb_typeof(next_payload) <> 'object' then
    raise exception 'invalid_sync_payload';
  end if;

  if device_id is null or length(trim(device_id)) not between 1 and 160 then
    raise exception 'invalid_sync_device';
  end if;

  select *
  into current_snapshot
  from public.sync_snapshots
  where user_id = current_user_id
  for update;

  if current_snapshot.user_id is not null then
    if expected_version is null or expected_version <> current_snapshot.version then
      raise exception 'sync_conflict';
    end if;
    next_version := current_snapshot.version + 1;
  else
    if expected_version is not null and expected_version <> 0 then
      raise exception 'sync_conflict';
    end if;
    next_version := 1;
  end if;

  insert into public.sync_snapshots (
    user_id, payload, version, updated_at, updated_by_device
  )
  values (
    current_user_id, next_payload, next_version, now(), trim(device_id)
  )
  on conflict (user_id) do update
  set payload = excluded.payload,
      version = excluded.version,
      updated_at = excluded.updated_at,
      updated_by_device = excluded.updated_by_device
  returning * into saved_snapshot;

  return saved_snapshot;
end;
$$;

revoke all on function public.save_sync_snapshot(jsonb, bigint, text) from public;
grant execute on function public.save_sync_snapshot(jsonb, bigint, text) to authenticated;
