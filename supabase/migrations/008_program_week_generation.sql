-- ============================================================
-- 008 PROGRAM WEEK GENERATION
--
-- Generates program weeks one at a time.
--
-- Week 1 is generated during onboarding.
-- Later weeks are generated automatically as the calendar
-- advances.
--
-- The database is authoritative for generation ownership so
-- multiple browser tabs/devices cannot generate the same week
-- simultaneously.
-- ============================================================


-- ============================================================
-- TABLE
-- ============================================================

create table if not exists public.program_week_generation (
  program_id uuid not null
    references public.workout_programs(id)
    on delete cascade,

  week_number integer not null,

  status text not null
    check (
      status in (
        'generating',
        'completed',
        'failed'
      )
    ),

  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),

  primary key (
    program_id,
    week_number
  )
);


-- ============================================================
-- INDEX
-- ============================================================

create index if not exists
  program_week_generation_status_idx
on public.program_week_generation (
  status,
  updated_at
);


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function
public.touch_program_week_generation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


drop trigger if exists
  trg_touch_program_week_generation
on public.program_week_generation;


create trigger
  trg_touch_program_week_generation
before update
on public.program_week_generation
for each row
execute function
public.touch_program_week_generation();


-- ============================================================
-- RLS
--
-- Clients do NOT receive direct table policies.
-- Generation happens through SECURITY DEFINER RPCs below.
-- ============================================================

alter table public.program_week_generation
enable row level security;


drop policy if exists
  "Users cannot directly access program week generation"
on public.program_week_generation;


-- Revoke direct table access from normal authenticated users.
revoke all
on public.program_week_generation
from anon, authenticated;


-- ============================================================
-- CALENDAR WEEK
--
-- Week 1 begins on the Monday of the program's creation week.
-- Each following Monday advances the calendar week by one.
-- ============================================================

create or replace function
public.get_program_calendar_week(
  program_created_at timestamptz,
  duration_weeks integer
)
returns integer
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  program_monday date;
  current_monday date;
  calculated_week integer;
begin
  if program_created_at is null then
    return 1;
  end if;

  program_monday :=
    (
      program_created_at
      at time zone 'UTC'
    )::date
    -
    (
      extract(
        isodow
        from (
          program_created_at
          at time zone 'UTC'
        )::date
      )::integer
      - 1
    );

  current_monday :=
    current_date
    -
    (
      extract(
        isodow
        from current_date
      )::integer
      - 1
    );

  calculated_week :=
    floor(
      (
        current_monday -
        program_monday
      ) / 7.0
    )::integer
    + 1;

  if duration_weeks is not null
     and duration_weeks > 0 then
    calculated_week :=
      least(
        calculated_week,
        duration_weeks
      );
  end if;

  return greatest(
    calculated_week,
    1
  );
end;
$$;


-- ============================================================
-- CLAIM A WEEK
--
-- Returns true when this caller owns generation of the week.
--
-- Existing completed week:
--   false
--
-- Existing active generation:
--   false
--
-- Stale generation:
--   previous generation can be reclaimed.
-- ============================================================

create or replace function
public.claim_program_week_generation(
  p_program_id uuid,
  p_week_number integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_row public.program_week_generation%rowtype;
  program_row public.workout_programs%rowtype;
  stale_after interval := interval '10 minutes';
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if p_program_id is null then
    raise exception 'Program ID is required.';
  end if;

  if p_week_number is null
     or p_week_number < 1 then
    raise exception 'Invalid program week.';
  end if;

  select *
  into program_row
  from public.workout_programs
  where id = p_program_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Program not found.';
  end if;

  if coalesce(
    program_row.status,
    ''
  ) <> 'active' then
    raise exception 'Program is not active.';
  end if;

  if coalesce(
    program_row.duration_weeks,
    12
  ) < p_week_number then
    return false;
  end if;

  select *
  into existing_row
  from public.program_week_generation
  where program_id = p_program_id
    and week_number = p_week_number
  for update;

  if found then

    if existing_row.status = 'completed' then
      return false;
    end if;

    if existing_row.status = 'generating'
       and existing_row.updated_at >
           now() - stale_after then
      return false;
    end if;

    update public.program_week_generation
    set
      status = 'generating',
      started_at = now(),
      completed_at = null,
      updated_at = now()
    where program_id = p_program_id
      and week_number = p_week_number;

    return true;
  end if;

  insert into public.program_week_generation (
    program_id,
    week_number,
    status,
    started_at,
    updated_at
  )
  values (
    p_program_id,
    p_week_number,
    'generating',
    now(),
    now()
  );

  return true;
end;
$$;


-- ============================================================
-- COMPLETE WEEK
--
-- Appends the generated microcycle into the program.
--
-- IMPORTANT:
-- current_week only advances to the newly completed week.
-- It never jumps over missing weeks.
-- ============================================================

create or replace function
public.complete_program_week_generation(
  p_program_id uuid,
  p_week_number integer,
  p_microcycle jsonb
)
returns public.workout_programs
language plpgsql
security definer
set search_path = public
as $$
declare
  program_row public.workout_programs%rowtype;
  updated_microcycles jsonb;
  existing_microcycles jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if p_microcycle is null
     or jsonb_typeof(p_microcycle) <> 'object' then
    raise exception 'A valid microcycle is required.';
  end if;

  select *
  into program_row
  from public.workout_programs
  where id = p_program_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Program not found.';
  end if;

  existing_microcycles :=
    case
      when jsonb_typeof(
        coalesce(
          program_row.microcycles,
          '[]'::jsonb
        )
      ) = 'array'
      then coalesce(
        program_row.microcycles,
        '[]'::jsonb
      )
      else '[]'::jsonb
    end;

  /*
   * Remove an existing copy of this week first.
   * This makes completion safely retryable.
   */
  updated_microcycles :=
    (
      select coalesce(
        jsonb_agg(item order by week_num),
        '[]'::jsonb
      )
      from (
        select
          item,
          case
            when item->>'week_number' ~ '^[0-9]+$'
            then (
              item->>'week_number'
            )::integer
            else 999999
          end as week_num
        from jsonb_array_elements(
          existing_microcycles
        ) as item

        where coalesce(
          (
            case
              when item->>'week_number'
                ~ '^[0-9]+$'
              then (
                item->>'week_number'
              )::integer
              else null
            end
          ),
          -1
        ) <> p_week_number

        union all

        select
          p_microcycle,
          p_week_number
      ) ordered_items
    );

  update public.workout_programs
  set
    microcycles = updated_microcycles,

    /*
     * Only move current_week forward by exactly one
     * successfully generated week.
     */
    current_week =
      greatest(
        coalesce(
          current_week,
          1
        ),
        case
          when p_week_number =
               coalesce(
                 current_week,
                 1
               ) + 1
          then p_week_number
          else coalesce(
            current_week,
            1
          )
        end
      ),

    updated_at = now()

  where id = p_program_id
    and user_id = auth.uid();

  update public.program_week_generation
  set
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  where program_id = p_program_id
    and week_number = p_week_number;

  select *
  into program_row
  from public.workout_programs
  where id = p_program_id
    and user_id = auth.uid();

  return program_row;
end;
$$;


-- ============================================================
-- FAIL WEEK
-- ============================================================

create or replace function
public.fail_program_week_generation(
  p_program_id uuid,
  p_week_number integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  update public.program_week_generation
  set
    status = 'failed',
    completed_at = null,
    updated_at = now()
  where program_id = p_program_id
    and week_number = p_week_number
    and exists (
      select 1
      from public.workout_programs p
      where p.id = p_program_id
        and p.user_id = auth.uid()
    );

  return found;
end;
$$;


-- ============================================================
-- GET CURRENT PROGRAM WEEK
-- ============================================================

create or replace function
public.get_current_program_week(
  p_program_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  program_row public.workout_programs%rowtype;
  calendar_week integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into program_row
  from public.workout_programs
  where id = p_program_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Program not found.';
  end if;

  calendar_week :=
    public.get_program_calendar_week(
      program_row.created_at,
      coalesce(
        program_row.duration_weeks,
        12
      )
    );

  return least(
    greatest(
      coalesce(
        program_row.current_week,
        1
      ),
      1
    ),
    calendar_week
  );
end;
$$;


-- ============================================================
-- RPC PERMISSIONS
-- ============================================================

grant execute
on function public.get_program_calendar_week(
  timestamptz,
  integer
)
to authenticated;


grant execute
on function public.claim_program_week_generation(
  uuid,
  integer
)
to authenticated;


grant execute
on function public.complete_program_week_generation(
  uuid,
  integer,
  jsonb
)
to authenticated;


grant execute
on function public.fail_program_week_generation(
  uuid,
  integer
)
to authenticated;


grant execute
on function public.get_current_program_week(
  uuid
)
to authenticated;
