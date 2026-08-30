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
  reauth_required_at timestamptz,
  last_login_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text not null default '',
  add column if not exists profile_setup_completed boolean not null default false,
  add column if not exists reauth_required_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists last_seen_at timestamptz;

-- Automatically create a guest profile when an Auth user is created.
-- The owner can promote or rename the profile later. This avoids a second
-- manual INSERT after creating a user in Authentication > Users.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    role,
    is_active,
    profile_setup_completed
  )
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80),
    'guest',
    true,
    false
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

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
    reauth_required_at = case
      when record_login then null
      else reauth_required_at
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

-- Public account requests.
-- The request never stores a password. The owner creates the final Auth user
-- from Supabase Authentication > Users after approving it.
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 2 and 80),
  email text not null,
  note text check (note is null or length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

alter table public.access_requests enable row level security;

-- Enable live INSERT events for the owner panel.
do $$
begin
  alter publication supabase_realtime add table public.access_requests;
exception
  when duplicate_object then null;
end;
$$;

create unique index if not exists access_requests_one_pending_email
  on public.access_requests (lower(email))
  where status = 'pending';

grant insert on public.access_requests to anon, authenticated;
grant select on public.access_requests to authenticated;

drop policy if exists "Anyone can submit an access request" on public.access_requests;
create policy "Anyone can submit an access request"
  on public.access_requests for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
  );

drop policy if exists "Owners can read access requests" on public.access_requests;
create policy "Owners can read access requests"
  on public.access_requests for select
  to authenticated
  using ((select public.is_owner()));

create or replace function public.review_access_request(
  target_request_id uuid,
  next_status text
)
returns public.access_requests
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  reviewed_request public.access_requests;
begin
  if not (select public.is_owner()) then
    raise exception 'only the owner can review access requests';
  end if;

  if next_status not in ('approved', 'rejected') then
    raise exception 'invalid access request status';
  end if;

  update public.access_requests
  set status = next_status,
      reviewed_at = now(),
      reviewed_by = (select auth.uid())
  where id = target_request_id
    and status = 'pending'
  returning * into reviewed_request;

  if reviewed_request.id is null then
    raise exception 'access request not found or already reviewed';
  end if;

  return reviewed_request;
end;
$$;

revoke all on function public.review_access_request(uuid, text) from public;
grant execute on function public.review_access_request(uuid, text) to authenticated;


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
