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

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

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
