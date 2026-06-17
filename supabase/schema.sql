-- ─────────────────────────────────────────────────────────────────────────────
-- RIFTBRAWL — Supabase schema (an Archway Games title)
--
-- Run this once against your Supabase project (SQL Editor, or `supabase db
-- push`). It replaces the old on-disk SQLite store:
--
--   auth.users          ← Supabase Auth ("your Archway account") — owns email,
--                          password, and the access tokens the game verifies.
--   public.profiles     ← the in-game identity: fighter tag + W/L record,
--                          keyed 1:1 to an auth user.
--   public.friendships  ← bidirectional friend edges (a→b and b→a both stored).
--   public.friend_requests ← pending requests (from → to).
--
-- The game server talks to all of this with the service-role key, so RLS is
-- mostly a safety net — but we enable it and grant the minimum the browser
-- client needs (a username-availability check during sign-up).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists citext;

-- ── profiles ────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   citext not null unique,
  wins       integer not null default 0,
  losses     integer not null default 0,
  is_admin   boolean not null default false,   -- grants /design (Skin Forge) access
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,16}$')
);

-- bring already-created projects up to date (no-op once the column exists)
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Grant /design access to a fighter (run by hand after the table exists):
--   update public.profiles set is_admin = true where username = 'YourTag';

-- ── friendships (stored both directions for cheap lookups) ───────────────────

create table if not exists public.friendships (
  a uuid not null references public.profiles (id) on delete cascade,
  b uuid not null references public.profiles (id) on delete cascade,
  primary key (a, b)
);

-- ── friend requests (from → to) ──────────────────────────────────────────────

create table if not exists public.friend_requests (
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id   uuid not null references public.profiles (id) on delete cascade,
  primary key (from_id, to_id)
);

create index if not exists friend_requests_to_idx on public.friend_requests (to_id);

-- ── auto-create a profile when an Archway account signs up ───────────────────
-- The fighter tag is passed in user_metadata.username at sign-up time. Because
-- this AFTER INSERT trigger runs in the same transaction as the auth.users
-- insert, a duplicate/invalid tag aborts the whole sign-up — no orphan account.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tag text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
begin
  if tag is null then
    -- account created without a tag (e.g. via the dashboard) — synthesize one
    tag := 'Fighter' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  insert into public.profiles (id, username) values (new.id, tag);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── is_username_available(tag) — public, for nice sign-up UX ──────────────────
-- Lets the (anon) browser client check a tag before sign-up. The UNIQUE
-- constraint above is the real guarantee; this is only for instant feedback.

create or replace function public.is_username_available(tag text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select tag ~ '^[A-Za-z0-9_]{3,16}$'
     and not exists (select 1 from public.profiles where username = tag::citext);
$$;

-- ── record_match_result(winner, loser) — atomic W/L bump ─────────────────────

create or replace function public.record_match_result(winner uuid, loser uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set wins   = wins   + 1 where id = winner;
  update public.profiles set losses = losses + 1 where id = loser;
$$;

-- ── row-level security ───────────────────────────────────────────────────────
-- The server uses the service-role key (bypasses RLS). We still enable RLS so
-- the anon/public keys can't read or mutate the social graph directly.

alter table public.profiles        enable row level security;
alter table public.friendships     enable row level security;
alter table public.friend_requests enable row level security;

-- A signed-in player may read their own profile (handy if you ever query the
-- client directly); everything else goes through the server's service role.
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);

revoke all on function public.record_match_result(uuid, uuid) from anon, authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;
