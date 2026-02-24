-- Run this in the Supabase SQL Editor to create the user_data table for Herd Ledger.
-- Table: one row per user per key (animals, gestations, notes, offspring); data stored as JSONB.

create table if not exists public.user_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  data jsonb not null default '[]'::jsonb,
  primary key (user_id, key)
);

alter table public.user_data enable row level security;

create policy "Users can read own data"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "Users can insert own data"
  on public.user_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update own data"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own data"
  on public.user_data for delete
  using (auth.uid() = user_id);
