-- MohammadOS record-level sync phase
-- Run after supabase/schema.sql and supabase/sync_schema.sql.
-- Snapshot sync remains available while this protocol is introduced.

create table if not exists public.sync_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null check (
    entity in (
      'habits',
      'courses',
      'courseSessions',
      'fixedEvents',
      'schedules',
      'dayLogs',
      'gates',
      'lifeWheelScores'
    )
  ),
  entity_id text not null check (length(trim(entity_id)) between 1 and 240),
  payload jsonb,
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by_device text not null check (length(trim(updated_by_device)) between 1 and 160),
  created_at timestamptz not null default now(),
  primary key (user_id, entity, entity_id)
);

create table if not exists public.sync_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  op_id text not null check (length(trim(op_id)) between 1 and 240),
  entity text not null,
  entity_id text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, op_id)
);

-- This marker also records an intentionally empty workspace as initialized.
create table if not exists public.sync_baselines (
  user_id uuid primary key references auth.users(id) on delete cascade,
  format_version integer not null default 1 check (format_version > 0),
  seeded_at timestamptz not null default now(),
  seeded_by_device text not null check (length(trim(seeded_by_device)) between 1 and 160)
);

alter table public.sync_records enable row level security;
alter table public.sync_baselines enable row level security;

revoke all on table public.sync_records from anon, authenticated;
grant select on table public.sync_records to authenticated;
revoke all on table public.sync_operations from anon, authenticated;
revoke all on table public.sync_baselines from anon, authenticated;
grant select on table public.sync_baselines to authenticated;

drop policy if exists "Users can read their own sync records" on public.sync_records;
create policy "Users can read their own sync records"
  on public.sync_records for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own sync baseline" on public.sync_baselines;
create policy "Users can read their own sync baseline"
  on public.sync_baselines for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.get_sync_record_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  current_user_id uuid := (select auth.uid());
  baseline public.sync_baselines;
  record_count bigint;
  latest_record_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
    into baseline
    from public.sync_baselines
   where user_id = current_user_id;

  select count(*), max(updated_at)
    into record_count, latest_record_at
    from public.sync_records
   where user_id = current_user_id;

  return jsonb_build_object(
    'state', case
      when baseline.user_id is not null or record_count > 0 then 'seeded'
      else 'not_seeded'
    end,
    'seeded', (baseline.user_id is not null or record_count > 0),
    'formatVersion', coalesce(baseline.format_version, 1),
    'baselineAt', baseline.seeded_at,
    'seededByDevice', baseline.seeded_by_device,
    'recordCount', record_count,
    'latestRecordAt', latest_record_at
  );
end;
$$;

revoke all on function public.get_sync_record_status() from public;
revoke all on function public.get_sync_record_status() from anon;
grant execute on function public.get_sync_record_status() to authenticated;

create or replace function public.seed_sync_records(
  snapshot_payload jsonb,
  device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
volatile
as $$
declare
  current_user_id uuid := (select auth.uid());
  table_entry record;
  record_entry jsonb;
  entity_name text;
  entity_id_value text;
  payload_value jsonb;
  seeded_at_value timestamptz := now();
  inserted_baseline_count integer;
  existing_record_count bigint;
  inserted_record_count bigint := 0;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if jsonb_typeof(snapshot_payload) is distinct from 'object'
    or snapshot_payload->>'formatVersion' is distinct from '1'
    or jsonb_typeof(snapshot_payload->'tables') is distinct from 'object'
    or not (
      snapshot_payload->'tables' ? 'habits'
      and snapshot_payload->'tables' ? 'courses'
      and snapshot_payload->'tables' ? 'courseSessions'
      and snapshot_payload->'tables' ? 'fixedEvents'
      and snapshot_payload->'tables' ? 'schedules'
      and snapshot_payload->'tables' ? 'dayLogs'
      and snapshot_payload->'tables' ? 'gates'
      and snapshot_payload->'tables' ? 'lifeWheelScores'
    )
  then
    raise exception 'invalid_sync_baseline';
  end if;

  if octet_length(snapshot_payload::text) > 5 * 1024 * 1024 then
    raise exception 'sync_baseline_too_large';
  end if;

  if device_id is null or length(trim(device_id)) not between 1 and 160 then
    raise exception 'invalid_sync_device';
  end if;

  select count(*)
    into existing_record_count
    from public.sync_records
   where user_id = current_user_id;

  if exists (
    select 1
      from public.sync_baselines
     where user_id = current_user_id
  ) or existing_record_count > 0 then
    return jsonb_build_object(
      'status', 'already_seeded',
      'recordCount', existing_record_count
    );
  end if;

  insert into public.sync_baselines (
    user_id, format_version, seeded_at, seeded_by_device
  )
  values (
    current_user_id, 1, seeded_at_value, trim(device_id)
  )
  on conflict (user_id) do nothing;

  get diagnostics inserted_baseline_count = row_count;
  if inserted_baseline_count = 0 then
    return jsonb_build_object(
      'status', 'already_seeded',
      'recordCount', existing_record_count
    );
  end if;

  for table_entry in
    select key, value
      from jsonb_each(snapshot_payload->'tables')
  loop
    entity_name := table_entry.key;
    if entity_name not in (
      'habits',
      'courses',
      'courseSessions',
      'fixedEvents',
      'schedules',
      'dayLogs',
      'gates',
      'lifeWheelScores'
    ) then
      raise exception 'invalid_sync_entity';
    end if;

    if jsonb_typeof(table_entry.value) is distinct from 'array' then
      raise exception 'invalid_sync_entity_records';
    end if;

    for record_entry in
      select value
        from jsonb_array_elements(table_entry.value)
    loop
      entity_id_value := nullif(trim(record_entry->>'entityId'), '');
      payload_value := record_entry->'payload';

      if entity_id_value is null
        or length(entity_id_value) > 240
        or jsonb_typeof(payload_value) is distinct from 'object'
      then
        raise exception 'invalid_sync_record';
      end if;

      inserted_record_count := inserted_record_count + 1;
      if inserted_record_count > 10000 then
        raise exception 'too_many_sync_records';
      end if;

      insert into public.sync_records (
        user_id, entity, entity_id, payload, version, deleted_at,
        updated_at, updated_by_device
      )
      values (
        current_user_id, entity_name, entity_id_value, payload_value, 1,
        null, seeded_at_value, trim(device_id)
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'status', 'seeded',
    'recordCount', inserted_record_count,
    'seededAt', seeded_at_value
  );
end;
$$;

revoke all on function public.seed_sync_records(jsonb, text) from public;
revoke all on function public.seed_sync_records(jsonb, text) from anon;
grant execute on function public.seed_sync_records(jsonb, text) to authenticated;

create or replace function public.apply_sync_mutations(
  next_mutations jsonb,
  device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
volatile
as $$
declare
  current_user_id uuid := (select auth.uid());
  mutation jsonb;
  current_record public.sync_records;
  incoming_op_id text;
  entity_name text;
  entity_id_value text;
  operation_name text;
  payload_value jsonb;
  base_version_value bigint;
  next_version bigint;
  accepted_item jsonb;
  accepted jsonb := '[]'::jsonb;
  conflicts jsonb := '[]'::jsonb;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if jsonb_typeof(next_mutations) is distinct from 'array' then
    raise exception 'invalid_sync_mutations';
  end if;

  if jsonb_array_length(next_mutations) > 50 then
    raise exception 'too_many_sync_mutations';
  end if;

  if device_id is null or length(trim(device_id)) not between 1 and 160 then
    raise exception 'invalid_sync_device';
  end if;

  for mutation in select value from jsonb_array_elements(next_mutations)
  loop
    incoming_op_id := nullif(trim(mutation->>'opId'), '');
    entity_name := nullif(trim(mutation->>'entity'), '');
    entity_id_value := nullif(trim(mutation->>'entityId'), '');
    operation_name := nullif(trim(mutation->>'operation'), '');
    payload_value := mutation->'payload';
    base_version_value := case
      when mutation ? 'baseVersion'
        and jsonb_typeof(mutation->'baseVersion') = 'number'
      then (mutation->>'baseVersion')::bigint
      else null
    end;

    if incoming_op_id is null
      or entity_name is null
      or entity_id_value is null
      or operation_name not in ('upsert', 'delete')
      or entity_name not in (
        'habits', 'courses', 'courseSessions', 'fixedEvents',
        'schedules', 'dayLogs', 'gates', 'lifeWheelScores'
      )
      or length(entity_id_value) > 240
      or (
        operation_name = 'upsert'
        and jsonb_typeof(payload_value) is distinct from 'object'
      )
    then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'opId', coalesce(incoming_op_id, 'unknown'),
        'reason', 'invalid_mutation'
      ));
      continue;
    end if;

    select result
      into accepted_item
     from public.sync_operations
     where user_id = current_user_id
       and sync_operations.op_id = incoming_op_id;

    if accepted_item is not null then
      accepted := accepted || jsonb_build_array(accepted_item);
      continue;
    end if;

    select *
      into current_record
      from public.sync_records
     where user_id = current_user_id
       and entity = entity_name
       and entity_id = entity_id_value
     for update;

    if current_record.user_id is not null
      and base_version_value is null
    then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'opId', incoming_op_id,
        'reason', 'base_version_required',
        'version', current_record.version
      ));
      continue;
    end if;

    if current_record.user_id is not null
      and base_version_value is not null
      and base_version_value <> current_record.version
    then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'opId', incoming_op_id,
        'reason', 'sync_conflict',
        'version', current_record.version
      ));
      continue;
    end if;

    if current_record.user_id is null
      and base_version_value is not null
      and base_version_value <> 0
    then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'opId', incoming_op_id,
        'reason', 'record_not_found'
      ));
      continue;
    end if;

    next_version := case
      when current_record.user_id is null then 1
      else current_record.version + 1
    end;

    insert into public.sync_records (
      user_id,
      entity,
      entity_id,
      payload,
      version,
      deleted_at,
      updated_at,
      updated_by_device
    )
    values (
      current_user_id,
      entity_name,
      entity_id_value,
      case when operation_name = 'delete' then null else payload_value end,
      next_version,
      case when operation_name = 'delete' then now() else null end,
      now(),
      trim(device_id)
    )
    on conflict (user_id, entity, entity_id) do update
      set payload = excluded.payload,
          version = excluded.version,
          deleted_at = excluded.deleted_at,
          updated_at = excluded.updated_at,
          updated_by_device = excluded.updated_by_device;

    accepted_item := jsonb_build_object(
      'opId', incoming_op_id,
      'entity', entity_name,
      'entityId', entity_id_value,
      'version', next_version,
      'updatedAt', now()
    );
    insert into public.sync_operations (
      user_id, op_id, entity, entity_id, result
    )
    values (
      current_user_id, incoming_op_id, entity_name, entity_id_value, accepted_item
    )
    on conflict (user_id, op_id) do nothing;
    accepted := accepted || jsonb_build_array(accepted_item);
  end loop;

  return jsonb_build_object(
    'accepted', accepted,
    'conflicts', conflicts
  );
end;
$$;

revoke all on function public.apply_sync_mutations(jsonb, text) from public;
revoke all on function public.apply_sync_mutations(jsonb, text) from anon;
grant execute on function public.apply_sync_mutations(jsonb, text) to authenticated;
