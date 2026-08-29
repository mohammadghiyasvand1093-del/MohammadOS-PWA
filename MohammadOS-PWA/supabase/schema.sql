-- MohammadOS account roles
-- Run this once in Supabase SQL Editor.
-- Create users first from Authentication > Users.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  role text not null default 'guest' check (role in ('owner', 'guest')),
  is_active boolean not null default true,
  profile_setup_completed boolean not null default false,
  last_login_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text not null default '',
  add column if not exists profile_setup_completed boolean not null default false,
  add column if not exists last_login_at timestamptz,
  add column if not exists last_seen_at timestamptz;

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

create or replace function public.touch_profile_presence(
  target_user_id uuid,
  record_login boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
volatile
as $$
begin
  if target_user_id <> (select auth.uid()) then
    raise exception 'cannot update another profile';
  end if;

  update public.profiles
  set
    last_seen_at = now(),
    last_login_at = case
      when record_login then now()
      else last_login_at
    end,
    updated_at = now()
  where id = target_user_id
    and is_active = true;
end;
$$;

revoke all on function public.touch_profile_presence(uuid, boolean) from public;
grant execute on function public.touch_profile_presence(uuid, boolean) to authenticated;

create or replace function public.update_own_profile(new_display_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  updated_profile public.profiles;
begin
  if (select auth.uid()) is null or length(trim(new_display_name)) < 2 then
    raise exception 'invalid profile update';
  end if;

  update public.profiles
  set display_name = left(trim(new_display_name), 80),
      profile_setup_completed = true,
      updated_at = now()
  where id = (select auth.uid())
    and is_active = true
  returning * into updated_profile;

  return updated_profile;
end;
$$;

revoke all on function public.update_own_profile(text) from public;
grant execute on function public.update_own_profile(text) to authenticated;

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
insert into public.profiles (id, email, display_name, role)
select id, coalesce(email, ''), 'مالک', 'owner'
from auth.users
where email = 'OWNER_EMAIL_HERE'
on conflict (id) do update
set display_name = excluded.display_name,
    email = excluded.email,
    profile_setup_completed = true,
    role = excluded.role,
    is_active = true,
    updated_at = now();

insert into public.profiles (id, email, display_name, role)
select id, coalesce(email, ''), 'مهمان', 'guest'
from auth.users
where email = 'GUEST_EMAIL_HERE'
on conflict (id) do update
set display_name = excluded.display_name,
    email = excluded.email,
    profile_setup_completed = false,
    role = excluded.role,
    is_active = true,
    updated_at = now();
