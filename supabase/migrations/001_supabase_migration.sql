-- WASHEK: Supabase replacement for the former hosted app backend.
-- Run this in Supabase SQL Editor before deploying the Edge Functions.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  full_name text,
  role text default 'user',
  training_type text,
  fitness_level text,
  primary_goal text,
  goal_timeframe text,
  available_equipment text,
  training_requirements text,
  weight_goals jsonb default '[]'::jsonb,
  fitness_goals jsonb default '[]'::jsonb,
  current_skills text,
  age integer,
  gender text,
  weight_lbs numeric,
  height_inches numeric,
  height_cm numeric,
  country text,
  language text default 'English',
  unit text default 'imperial',
  onboarded boolean default false,
  subscription_plan text default 'free',
  kael_msg_count integer default 0,
  kael_msg_month text,
  deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text default 'user';
alter table public.profiles add column if not exists training_type text;
alter table public.profiles add column if not exists fitness_level text;
alter table public.profiles add column if not exists primary_goal text;
alter table public.profiles add column if not exists goal_timeframe text;
alter table public.profiles add column if not exists available_equipment text;
alter table public.profiles add column if not exists training_requirements text;
alter table public.profiles add column if not exists weight_goals jsonb default '[]'::jsonb;
alter table public.profiles add column if not exists fitness_goals jsonb default '[]'::jsonb;
alter table public.profiles add column if not exists current_skills text;
alter table public.profiles add column if not exists age integer;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists weight_lbs numeric;
alter table public.profiles add column if not exists height_inches numeric;
alter table public.profiles add column if not exists height_cm numeric;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists language text default 'English';
alter table public.profiles add column if not exists unit text default 'imperial';
alter table public.profiles add column if not exists onboarded boolean default false;
alter table public.profiles add column if not exists subscription_plan text default 'free';
alter table public.profiles add column if not exists kael_msg_count integer default 0;
alter table public.profiles add column if not exists kael_msg_month text;
alter table public.profiles add column if not exists deleted boolean default false;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

create table if not exists public.workout_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  created_by text,
  program_name text not null,
  duration_weeks integer,
  macrocycle jsonb default '{}'::jsonb,
  mesocycles jsonb default '[]'::jsonb,
  microcycles jsonb default '[]'::jsonb,
  training_type text,
  fitness_level text,
  goal text,
  current_week integer default 1,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.workout_programs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_programs add column if not exists created_by text;
alter table public.workout_programs add column if not exists program_name text;
alter table public.workout_programs add column if not exists duration_weeks integer;
alter table public.workout_programs add column if not exists macrocycle jsonb default '{}'::jsonb;
alter table public.workout_programs add column if not exists mesocycles jsonb default '[]'::jsonb;
alter table public.workout_programs add column if not exists microcycles jsonb default '[]'::jsonb;
alter table public.workout_programs add column if not exists training_type text;
alter table public.workout_programs add column if not exists fitness_level text;
alter table public.workout_programs add column if not exists goal text;
alter table public.workout_programs add column if not exists current_week integer default 1;
alter table public.workout_programs add column if not exists status text default 'active';
alter table public.workout_programs add column if not exists created_at timestamptz default now();
alter table public.workout_programs add column if not exists updated_at timestamptz default now();

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  created_by text,
  program_id uuid references public.workout_programs(id) on delete set null,
  date date default current_date,
  week_number integer,
  day_name text,
  exercises_completed jsonb default '[]'::jsonb,
  duration_minutes integer default 0,
  post_workout_checkin text,
  ai_adjustment_notes text,
  created_at timestamptz default now()
);
alter table public.workout_logs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_logs add column if not exists created_by text;
alter table public.workout_logs add column if not exists program_id uuid references public.workout_programs(id) on delete set null;
alter table public.workout_logs add column if not exists date date default current_date;
alter table public.workout_logs add column if not exists week_number integer;
alter table public.workout_logs add column if not exists day_name text;
alter table public.workout_logs add column if not exists exercises_completed jsonb default '[]'::jsonb;
alter table public.workout_logs add column if not exists duration_minutes integer default 0;
alter table public.workout_logs add column if not exists post_workout_checkin text;
alter table public.workout_logs add column if not exists ai_adjustment_notes text;
alter table public.workout_logs add column if not exists created_at timestamptz default now();

create table if not exists public.nutrition_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  created_by text,
  date date default current_date,
  meal_type text,
  food_name text,
  serving_size text,
  calories numeric default 0,
  protein_g numeric default 0,
  carbs_g numeric default 0,
  fat_g numeric default 0,
  created_at timestamptz default now()
);
alter table public.nutrition_entries add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.nutrition_entries add column if not exists created_by text;
alter table public.nutrition_entries add column if not exists date date default current_date;
alter table public.nutrition_entries add column if not exists meal_type text;
alter table public.nutrition_entries add column if not exists food_name text;
alter table public.nutrition_entries add column if not exists serving_size text;
alter table public.nutrition_entries add column if not exists calories numeric default 0;
alter table public.nutrition_entries add column if not exists protein_g numeric default 0;
alter table public.nutrition_entries add column if not exists carbs_g numeric default 0;
alter table public.nutrition_entries add column if not exists fat_g numeric default 0;
alter table public.nutrition_entries add column if not exists created_at timestamptz default now();

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  created_by text,
  photo_url text not null,
  date date default current_date,
  weight_lbs numeric,
  body_fat_estimate text,
  body_fat_numeric numeric,
  ai_insights text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.progress_photos add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.progress_photos add column if not exists created_by text;
alter table public.progress_photos add column if not exists photo_url text;
alter table public.progress_photos add column if not exists date date default current_date;
alter table public.progress_photos add column if not exists weight_lbs numeric;
alter table public.progress_photos add column if not exists body_fat_estimate text;
alter table public.progress_photos add column if not exists body_fat_numeric numeric;
alter table public.progress_photos add column if not exists ai_insights text;
alter table public.progress_photos add column if not exists created_at timestamptz default now();
alter table public.progress_photos add column if not exists updated_at timestamptz default now();

create table if not exists public.movement_baselines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  created_by text,
  recorded_date date default current_date,
  custom_entries jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.movement_baselines add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.movement_baselines add column if not exists created_by text;
alter table public.movement_baselines add column if not exists recorded_date date default current_date;
alter table public.movement_baselines add column if not exists custom_entries jsonb default '{}'::jsonb;
alter table public.movement_baselines add column if not exists created_at timestamptz default now();
alter table public.movement_baselines add column if not exists updated_at timestamptz default now();

create table if not exists public.form_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  created_by text,
  video_url text,
  exercise_name text,
  exercise_category text,
  score numeric,
  rep_count numeric,
  hold_time_seconds numeric,
  analysis text,
  issues jsonb default '[]'::jsonb,
  priority_focus jsonb default '[]'::jsonb,
  date date default current_date,
  created_at timestamptz default now()
);
alter table public.form_analyses add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.form_analyses add column if not exists created_by text;
alter table public.form_analyses add column if not exists video_url text;
alter table public.form_analyses add column if not exists exercise_name text;
alter table public.form_analyses add column if not exists exercise_category text;
alter table public.form_analyses add column if not exists score numeric;
alter table public.form_analyses add column if not exists rep_count numeric;
alter table public.form_analyses add column if not exists hold_time_seconds numeric;
alter table public.form_analyses add column if not exists analysis text;
alter table public.form_analyses add column if not exists issues jsonb default '[]'::jsonb;
alter table public.form_analyses add column if not exists priority_focus jsonb default '[]'::jsonb;
alter table public.form_analyses add column if not exists date date default current_date;
alter table public.form_analyses add column if not exists created_at timestamptz default now();

create table if not exists public.kael_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  created_by text,
  role text not null,
  content text not null,
  is_edit boolean default false,
  created_at timestamptz default now()
);
alter table public.kael_messages add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.kael_messages add column if not exists created_by text;
alter table public.kael_messages add column if not exists role text;
alter table public.kael_messages add column if not exists content text;
alter table public.kael_messages add column if not exists is_edit boolean default false;
alter table public.kael_messages add column if not exists created_at timestamptz default now();

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz default now()
);

-- Backfill user_id from the old owner email where that legacy column exists.
do $$
declare
  t text;
begin
  foreach t in array array['workout_programs','workout_logs','nutrition_entries','progress_photos','movement_baselines','form_analyses','kael_messages'] loop
    execute format('update public.%I x set user_id = u.id from auth.users u where x.user_id is null and x.created_by = u.email', t);
  end loop;
exception when undefined_column then
  null;
end $$;

-- RLS: users can only access their own application data.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['workout_programs','workout_logs','nutrition_entries','progress_photos','movement_baselines','form_analyses','kael_messages'] LOOP
    EXECUTE format('alter table public.%I enable row level security', t);
    EXECUTE format('drop policy if exists "owner_select" on public.%I', t);
    EXECUTE format('drop policy if exists "owner_insert" on public.%I', t);
    EXECUTE format('drop policy if exists "owner_update" on public.%I', t);
    EXECUTE format('drop policy if exists "owner_delete" on public.%I', t);
    EXECUTE format('create policy "owner_select" on public.%I for select using (user_id = auth.uid())', t);
    EXECUTE format('create policy "owner_insert" on public.%I for insert with check (user_id = auth.uid())', t);
    EXECUTE format('create policy "owner_update" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    EXECUTE format('create policy "owner_delete" on public.%I for delete using (user_id = auth.uid())', t);
  END LOOP;
END $$;

alter table public.profiles enable row level security;
drop policy if exists "profile_select_own" on public.profiles;
drop policy if exists "profile_insert_own" on public.profiles;
drop policy if exists "profile_update_own" on public.profiles;
create policy "profile_select_own" on public.profiles for select using (id = auth.uid());
create policy "profile_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profile_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

alter table public.contact_messages enable row level security;
drop policy if exists "contact_insert_authenticated" on public.contact_messages;
create policy "contact_insert_authenticated" on public.contact_messages for insert with check (user_id = auth.uid());

create index if not exists workout_programs_user_status_idx on public.workout_programs(user_id, status, created_at desc);
create index if not exists workout_logs_user_date_idx on public.workout_logs(user_id, date desc);
create index if not exists nutrition_entries_user_date_idx on public.nutrition_entries(user_id, date desc);
create index if not exists progress_photos_user_date_idx on public.progress_photos(user_id, date desc);
create index if not exists movement_baselines_user_recorded_idx on public.movement_baselines(user_id, recorded_date desc);
create index if not exists kael_messages_user_created_idx on public.kael_messages(user_id, created_at asc);

-- Public storage bucket used by the frontend upload helper.
insert into storage.buckets (id, name, public)
values ('user-media', 'user-media', true)
on conflict (id) do update set public = true;

DROP POLICY IF EXISTS "user_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "user_media_update" ON storage.objects;
DROP POLICY IF EXISTS "user_media_delete" ON storage.objects;
CREATE POLICY "user_media_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'user-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user_media_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'user-media' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'user-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user_media_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'user-media' AND (storage.foldername(name))[1] = auth.uid()::text);
