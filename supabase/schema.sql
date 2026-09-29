-- Boarding demo schema for Supabase (Postgres).
-- Run in the Supabase SQL editor on a free project (region eu-west-2).
--
-- Design notes
--   * boardings are anonymous: only a 32-bit hash of the card UID is stored, never the UID.
--   * rows are per dataset so several demos can share one project.
--   * inserts require the x-boarding-token request header; reads are public for the demo.
--   * a tap is attributed to the first departure at or after tapped_at, so no reset job
--     is needed: each new bus simply starts counting from zero on the client.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Ingest tokens
-- ---------------------------------------------------------------------------
-- Store a SHA-256 hash, never the token itself. Rotate by inserting a new row and
-- revoking the old one.
create table if not exists public.ingest_tokens (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

-- The revoke below is the primary lock; RLS means an accidentally granted privilege
-- still cannot expose the token hashes.
alter table public.ingest_tokens enable row level security;

-- Ingest token
-- -------------
-- Replace seed_token below with the same value you paste into the kiosk panel.
-- Generate one with:  openssl rand -hex 32
--
-- The guard aborts if you forget. A plain INSERT would instead seed a real,
-- working write token that anyone who has read this file already knows, and since
-- kiosk.html is published the anonymous key is public too, so nothing else guards it.
do $$
declare
  seed_token constant text := 'CHANGE_ME';
begin
  if seed_token = 'CHANGE_ME' then
    raise exception
      'Ingest token not set. Change seed_token in this file to a value from "openssl rand -hex 32" and run it again.';
  end if;

  insert into public.ingest_tokens (label, token_hash)
  select
    'default',
    encode(digest(seed_token, 'sha256'), 'hex')
  where not exists (select 1 from public.ingest_tokens);
end
$$;

revoke all on table public.ingest_tokens from anon, authenticated;

create or replace function public.boarding_token_is_valid(candidate text)
returns boolean
language sql
stable
security definer
-- extensions is listed because Supabase installs pgcrypto there, so unqualified
-- digest() is not visible under `public` alone. The token lookup below is the only
-- thing this function reaches, and anon/authenticated have no create rights in
-- extensions, so there is nothing to hijack.
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.ingest_tokens
    where token_hash = encode(digest(coalesce(candidate, ''), 'sha256'), 'hex')
  );
$$;

revoke all on function public.boarding_token_is_valid(text) from public;
grant execute on function public.boarding_token_is_valid(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Boardings
-- ---------------------------------------------------------------------------
create table if not exists public.boardings (
  id uuid primary key default gen_random_uuid(),
  dataset text not null default 'expo-demo',
  stop text not null check (stop in ('bristo', 'kings')),
  service_id text,
  service_kind text check (service_kind in ('shuttle', 'bus9')),
  card_id text not null,
  tapped_at timestamptz not null default now()
);

create index if not exists boardings_dataset_stop_tapped_at_idx
  on public.boardings (dataset, stop, tapped_at desc);

create index if not exists boardings_dataset_service_idx
  on public.boardings (dataset, service_id);

alter table public.boardings enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.boardings to anon, authenticated;
grant insert on public.boardings to anon, authenticated;

-- Visitors and the kiosk can read counts for any dataset.
drop policy if exists "boardings are publicly readable" on public.boardings;
create policy "boardings are publicly readable"
  on public.boardings
  for select
  to anon, authenticated
  using (true);

-- Writing requires a valid ingest token in the x-boarding-token header.
-- The Supabase client on the kiosk page sends it as a PostgREST header.
drop policy if exists "boardings insert requires ingest token" on public.boardings;
create policy "boardings insert requires ingest token"
  on public.boardings
  for insert
  to anon, authenticated
  with check (
    public.boarding_token_is_valid(
      coalesce(current_setting('request.headers', true)::json ->> 'x-boarding-token', '')
    )
  );

-- Updates and deletes are never needed from the client.
revoke update, delete on public.boardings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- The board subscribes to INSERTs so counts update without refreshing.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'boardings'
  ) then
    alter publication supabase_realtime add table public.boardings;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Free-project housekeeping
-- ---------------------------------------------------------------------------
-- Supabase pauses free projects after 7 days of no activity, and a paused
-- project rejects queries for a few minutes after being woken. Nothing to run
-- here: the kiosk retries failed writes from its local outbox on reconnect, and
-- the visitor board falls back to polling. Keeping the browser tab open on a
-- device that runs occasionally is the simplest keep-alive.
--
-- Housekeeping (optional, run occasionally):
--   delete from public.boardings
--    where tapped_at < now() - interval '7 days';
