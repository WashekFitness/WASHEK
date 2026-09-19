/*
 * WASHEK
 * Migration 017 — Ensure program_week_generation(s) table compatibility
 *
 * Provides compatibility between singular `program_week_generation`
 * and plural `program_week_generations` references.
 */

create table if not exists public.program_week_generation (
  program_id uuid not null references public.workout_programs(id) on delete cascade,
  week_number integer not null,
  status text not null check (status in ('generating', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (program_id, week_number)
);

create table if not exists public.program_week_generations (
  program_id uuid not null references public.workout_programs(id) on delete cascade,
  week_number integer not null,
  status text not null check (status in ('generating', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (program_id, week_number)
);

-- RLS Policies
alter table public.program_week_generation enable row level security;
alter table public.program_week_generations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'program_week_generation' 
    and policyname = 'program_week_generation_select_policy'
  ) then
    create policy program_week_generation_select_policy
    on public.program_week_generation
    for select
    using (
      exists (
        select 1 from public.workout_programs wp
        where wp.id = program_week_generation.program_id
        and wp.user_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies 
    where tablename = 'program_week_generations' 
    and policyname = 'program_week_generations_select_policy'
  ) then
    create policy program_week_generations_select_policy
    on public.program_week_generations
    for select
    using (
      exists (
        select 1 from public.workout_programs wp
        where wp.id = program_week_generations.program_id
        and wp.user_id = auth.uid()
      )
    );
  end if;
end $$;
