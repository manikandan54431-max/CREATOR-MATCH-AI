-- Admin console extension. Run after 001_initial_schema.sql in Supabase SQL Editor.
-- Public signup remains limited to creator/brand; admin is assigned manually by an owner.
alter type public.account_role add value if not exists 'admin';

alter table public.profiles
  add column if not exists company_name text not null default '' check (char_length(company_name) <= 100),
  add column if not exists company_website text not null default '' check (char_length(company_website) <= 300);

-- Admins may inspect campaign briefs for platform moderation and hackathon reporting.
create policy "Admins can view all campaign briefs" on public.creative_briefs
for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin'));

-- Allow an approved admin to read activity for platform support. No client-side role escalation.
create policy "Admins can view project activity" on public.project_activity
for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin'));

-- Extend the signup trigger to store optional brand display metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare chosen_role public.account_role;
begin
  chosen_role := case when new.raw_user_meta_data->>'role' = 'creator' then 'creator'::public.account_role else 'brand'::public.account_role end;
  insert into public.profiles(id, display_name, role, company_name, company_website)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)), 80),
    chosen_role,
    left(coalesce(new.raw_user_meta_data->>'company_name', ''), 100),
    left(coalesce(new.raw_user_meta_data->>'company_website', ''), 300)
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- IMPORTANT: after creating the intended admin's account, run a one-time promotion:
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL');
-- Replace YOUR_ADMIN_EMAIL in SQL Editor; never expose the admin role in public signup.
