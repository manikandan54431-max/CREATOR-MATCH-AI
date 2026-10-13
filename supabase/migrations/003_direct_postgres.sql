-- Direct PostgreSQL schema for CreatorHub AI.
-- Run against the selected PostgreSQL database with DATABASE_URL.
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('creator','brand','admin')),
  bio text not null default '',
  specialization text not null default '',
  skills text[] not null default '{}',
  tools text[] not null default '{}',
  company_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists portfolio_items (
  id uuid primary key default gen_random_uuid(), creator_id uuid not null references profiles(id) on delete cascade,
  title text not null, description text not null default '', media_type text not null default 'image', tool_used text, external_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists creative_briefs (
  id uuid primary key default gen_random_uuid(), brand_id uuid not null references profiles(id) on delete cascade,
  title text not null, description text not null, target_audience text, deliverables text, content_type text not null default 'video',
  style_direction text, platform text, budget numeric, deadline text, status text not null default 'open', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists project_invitations (
  id uuid primary key default gen_random_uuid(), brand_id uuid not null references profiles(id) on delete cascade,
  creator_id uuid not null references profiles(id) on delete cascade, brief_id uuid not null references creative_briefs(id) on delete cascade,
  status text not null default 'pending', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists sessions_token_idx on sessions(token_hash);
create index if not exists portfolio_creator_idx on portfolio_items(creator_id);
create index if not exists briefs_brand_idx on creative_briefs(brand_id, created_at desc);
create index if not exists invitations_creator_idx on project_invitations(creator_id, created_at desc);
