-- MohammadOS account roles
-- Run this once in Supabase SQL Editor.
-- Create users first from Authentication > Users.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'guest' check (role in ('owner', 'guest')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant select on public.profiles to authenticated;

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'owner'
      and is_active = true
  );
$$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Owners can read all profiles" on public.profiles;
create policy "Owners can read all profiles"
  on public.profiles for select
  to authenticated
  using ((select public.is_owner()));

drop policy if exists "Owners can update profiles" on public.profiles;
create policy "Owners can update profiles"
  on public.profiles for update
  to authenticated
  using ((select public.is_owner()))
  with check (role in ('owner', 'guest'));

-- Insert exactly the two accounts created in Authentication > Users.
-- Replace the email addresses before running.
insert into public.profiles (id, display_name, role)
select id, 'مالک', 'owner'
from auth.users
where email = 'OWNER_EMAIL_HERE'
on conflict (id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    is_active = true,
    updated_at = now();

insert into public.profiles (id, display_name, role)
select id, 'مهمان', 'guest'
from auth.users
where email = 'GUEST_EMAIL_HERE'
on conflict (id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    is_active = true,
    updated_at = now();
