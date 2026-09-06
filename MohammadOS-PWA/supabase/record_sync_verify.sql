-- Read-only verification for the record-level sync installation.
-- Run this after supabase/record_sync_schema.sql in the Supabase SQL Editor.
-- A healthy result has PASS for every row in the first result set.

with required_tables(table_name, expected_rls) as (
  values
    ('sync_records', true),
    ('sync_operations', true),
    ('sync_baselines', true)
)
select
  required_tables.table_name,
  (pg_tables.tablename is not null) as exists,
  coalesce(pg_tables.rowsecurity, false) as rls_enabled,
  case
    when pg_tables.tablename is not null
      and coalesce(pg_tables.rowsecurity, false) = required_tables.expected_rls
    then 'PASS'
    else 'FAIL'
  end as result
from required_tables
left join pg_tables
  on pg_tables.schemaname = 'public'
 and pg_tables.tablename = required_tables.table_name
order by required_tables.table_name;

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  (p.prosecdef) as security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  case
    when p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    then 'PASS'
    else 'FAIL'
  end as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_sync_record_status',
    'pull_sync_records',
    'seed_sync_records',
    'apply_sync_mutations'
  )
order by p.proname, arguments;

select
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename in ('sync_records', 'sync_operations', 'sync_baselines')
order by tablename, policyname;

select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('sync_records', 'sync_operations', 'sync_baselines')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- Expected client table grants:
--   authenticated: SELECT on sync_records and sync_baselines only
--   anon: no grants on any record-sync table
--   sync_operations: no client table grants; it is written through RPC only
