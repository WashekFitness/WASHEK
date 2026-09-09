-- ============================================================
-- 010 WEEKLY UPDATE USAGE
--
-- Weekly Update is FREE for every subscription plan.
--
-- A user may successfully generate one Weekly Update per
-- Monday review cycle.
--
-- The database is authoritative.
-- localStorage is NOT used for entitlement enforcement.
-- ============================================================


-- ============================================================
-- TABLE
-- ============================================================

create table if not exists public.weekly_update_usage (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  week_start date not null,

  claimed_at timestamptz not null default now(),

  primary key (
    user_id,
    week_start
  )
);


-- ============================================================
-- RLS
--
-- No direct authenticated-user policies.
-- Access happens through SECURITY DEFINER RPCs.
-- ============================================================

alter table public.weekly_update_usage
enable row level security;


revoke all
on public.weekly_update_usage
from anon, authenticated;


-- ============================================================
-- HELPER
--
-- Returns the Monday that represents the current weekly
-- update cycle.
-- ============================================================

create or replace function
public.get_weekly_update_cycle_start()
returns date
language sql
stable
security invoker
set search_path = public
as $$
  select
    current_date
    -
    (
      extract(
        isodow
        from current_date
      )::integer
      - 1
    );
$$;


-- ============================================================
-- STATUS
--
-- Returns whether the current Monday-cycle update has already
-- been claimed.
-- ============================================================

create or replace function
public.get_weekly_update_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cycle_start date;
  already_claimed boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  cycle_start :=
    public.get_weekly_update_cycle_start();

  select exists (
    select 1
    from public.weekly_update_usage
    where user_id = auth.uid()
      and week_start = cycle_start
  )
  into already_claimed;

  return jsonb_build_object(
    'week_start',
    cycle_start,

    'claimed',
    already_claimed,

    'available',
    not already_claimed
  );
end;
$$;


-- ============================================================
-- CLAIM
--
-- Atomic insert.
--
-- If another request already claimed this week's update,
-- PostgreSQL's primary key prevents a second successful claim.
-- ============================================================

create or replace function
public.claim_weekly_update()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle_start date;
  inserted boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  cycle_start :=
    public.get_weekly_update_cycle_start();

  insert into public.weekly_update_usage (
    user_id,
    week_start,
    claimed_at
  )
  values (
    auth.uid(),
    cycle_start,
    now()
  )
  on conflict (
    user_id,
    week_start
  )
  do nothing;

  inserted :=
    found;

  return jsonb_build_object(
    'week_start',
    cycle_start,

    'claimed',
    inserted,

    'available',
    not exists (
      select 1
      from public.weekly_update_usage
      where user_id = auth.uid()
        and week_start = cycle_start
    ) or inserted
  );
end;
$$;


-- ============================================================
-- PERMISSIONS
-- ============================================================

grant execute
on function public.get_weekly_update_cycle_start()
to authenticated;


grant execute
on function public.get_weekly_update_status()
to authenticated;


grant execute
on function public.claim_weekly_update()
to authenticated;
