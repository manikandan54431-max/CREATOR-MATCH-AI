-- CreatorHub AI initial schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create type public.account_role as enum ('creator', 'brand');
create type public.content_kind as enum ('video', 'image', 'animation', 'graphics', 'social');
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'in_progress', 'completed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  role public.account_role not null,
  bio text not null default '' check (char_length(bio) <= 600),
  specialization text not null default '' check (char_length(specialization) <= 100),
  skills text[] not null default '{}',
  tools text[] not null default '{}',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role);
create index profiles_skills_gin_idx on public.profiles using gin(skills);
create index profiles_tools_gin_idx on public.profiles using gin(tools);

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  media_type public.content_kind not null,
  tool_used text not null default '' check (char_length(tool_used) <= 100),
  external_url text not null default '' check (char_length(external_url) <= 500),
  media_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index portfolio_creator_idx on public.portfolio_items(creator_id);
create index portfolio_type_idx on public.portfolio_items(media_type);

create table public.creative_briefs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 20 and 3000),
  target_audience text not null default '' check (char_length(target_audience) <= 300),
  deliverables text not null check (char_length(deliverables) between 3 and 1000),
  content_type public.content_kind not null,
  style_direction text not null default '' check (char_length(style_direction) <= 500),
  platform text not null default '' check (char_length(platform) <= 100),
  budget numeric(12,2) check (budget is null or budget >= 0),
  deadline date,
  status text not null default 'open' check (status in ('open','in_progress','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index briefs_brand_idx on public.creative_briefs(brand_id, created_at desc);
create index briefs_type_idx on public.creative_briefs(content_type);

create table public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  brief_id uuid not null references public.creative_briefs(id) on delete cascade,
  status public.invitation_status not null default 'pending',
  response_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitation_not_self check (brand_id <> creator_id),
  constraint invitation_unique_per_brief unique (brief_id, creator_id)
);
create index invitations_creator_idx on public.project_invitations(creator_id, created_at desc);
create index invitations_brand_idx on public.project_invitations(brand_id, created_at desc);
create index invitations_brief_idx on public.project_invitations(brief_id);

create table public.project_activity (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.project_invitations(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 2 and 50),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index project_activity_invitation_idx on public.project_activity(invitation_id, created_at);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger portfolio_updated_at before update on public.portfolio_items for each row execute function public.set_updated_at();
create trigger briefs_updated_at before update on public.creative_briefs for each row execute function public.set_updated_at();
create trigger invitations_updated_at before update on public.project_invitations for each row execute function public.set_updated_at();

-- User metadata may request the initial role only at signup. Existing users cannot self-change role:
create or replace function public.prevent_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() = old.id then
    raise exception 'Account role cannot be changed by the account owner';
  end if;
  return new;
end; $$;
create trigger profiles_role_immutable before update on public.profiles for each row execute function public.prevent_role_change();

-- Create profile on signup. Role is constrained to known values; never trust client role changes later.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare chosen_role public.account_role;
begin
  chosen_role := case when new.raw_user_meta_data->>'role' = 'creator' then 'creator'::public.account_role else 'brand'::public.account_role end;
  insert into public.profiles(id, display_name, role)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)), 80), chosen_role)
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.creative_briefs enable row level security;
alter table public.project_invitations enable row level security;
alter table public.project_activity enable row level security;

-- Public creator profiles are discoverable; profile owner can edit non-role fields.
create policy "Profiles are visible to signed-in users" on public.profiles
for select to authenticated using (true);
create policy "Users can update own profile except role" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "Users can insert own profile" on public.profiles
for insert to authenticated with check (id = auth.uid());

-- Portfolio entries are visible to authenticated users; only owner can mutate.
create policy "Portfolio visible to authenticated users" on public.portfolio_items
for select to authenticated using (true);
create policy "Creator inserts own portfolio" on public.portfolio_items
for insert to authenticated with check (creator_id = auth.uid() and exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'creator'));
create policy "Creator updates own portfolio" on public.portfolio_items
for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy "Creator deletes own portfolio" on public.portfolio_items
for delete to authenticated using (creator_id = auth.uid());

-- Brands can only view and manage their own briefs.
create policy "Brand sees own briefs" on public.creative_briefs
for select to authenticated using (brand_id = auth.uid());
create policy "Brand creates own briefs" on public.creative_briefs
for insert to authenticated with check (brand_id = auth.uid() and exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'brand'));
create policy "Brand updates own briefs" on public.creative_briefs
for update to authenticated using (brand_id = auth.uid()) with check (brand_id = auth.uid());
create policy "Brand deletes own briefs" on public.creative_briefs
for delete to authenticated using (brand_id = auth.uid());

-- Each participant sees an invitation; brand owns invite creation. Creator can respond; brand can track status.
create policy "Participants see invitations" on public.project_invitations
for select to authenticated using (brand_id = auth.uid() or creator_id = auth.uid());
create policy "Brand creates invitations for own briefs" on public.project_invitations
for insert to authenticated with check (
  brand_id = auth.uid()
  and exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'brand')
  and exists(select 1 from public.creative_briefs b where b.id = brief_id and b.brand_id = auth.uid())
  and exists(select 1 from public.profiles p where p.id = creator_id and p.role = 'creator')
);
create policy "Participants update invitation workflow" on public.project_invitations
for update to authenticated using (brand_id = auth.uid() or creator_id = auth.uid())
with check (brand_id = auth.uid() or creator_id = auth.uid());

-- Protect relationship fields and enforce actor-specific workflow transitions in the database.
create or replace function public.guard_invitation_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.brand_id <> old.brand_id or new.creator_id <> old.creator_id or new.brief_id <> old.brief_id then
    raise exception 'Invitation participants and brief cannot be changed';
  end if;
  if auth.uid() = old.creator_id then
    if old.status <> 'pending' or new.status not in ('accepted','declined') then
      raise exception 'Creators can only accept or decline pending invitations';
    end if;
    new.response_at := now();
  elsif auth.uid() = old.brand_id then
    if not (
      (old.status = 'accepted' and new.status = 'in_progress') or
      (old.status = 'in_progress' and new.status = 'completed') or
      (new.status = old.status)
    ) then
      raise exception 'Brands can only move accepted projects to in progress and in-progress projects to completed';
    end if;
  else
    raise exception 'Not authorized to update this invitation';
  end if;
  return new;
end; $$;
create trigger guard_invitation_update before update on public.project_invitations
for each row execute function public.guard_invitation_update();
create policy "Participants view activity" on public.project_activity
for select to authenticated using (exists(select 1 from public.project_invitations i where i.id = invitation_id and (i.brand_id = auth.uid() or i.creator_id = auth.uid())));
create policy "Participants add activity" on public.project_activity
for insert to authenticated with check (actor_id = auth.uid() and exists(select 1 from public.project_invitations i where i.id = invitation_id and (i.brand_id = auth.uid() or i.creator_id = auth.uid())));

-- Storage bucket for creator portfolio media. Private bucket: serve files via authenticated access or signed URLs.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('creator-portfolio', 'creator-portfolio', false, 10485760, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict (id) do nothing;
create policy "Authenticated users read portfolio media" on storage.objects
for select to authenticated using (bucket_id = 'creator-portfolio');
create policy "Creators upload own portfolio media" on storage.objects
for insert to authenticated with check (
  bucket_id = 'creator-portfolio'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'creator')
);
create policy "Creators update own portfolio media" on storage.objects
for update to authenticated using (bucket_id = 'creator-portfolio' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'creator-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Creators delete own portfolio media" on storage.objects
for delete to authenticated using (bucket_id = 'creator-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);