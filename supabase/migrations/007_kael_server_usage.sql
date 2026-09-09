-- WASHEK
-- Migration 007: Server-side Kael Monthly Usage Enforcement
--
-- The browser must never be trusted to enforce Kael usage limits.
-- This table is intentionally inaccessible to normal clients.
-- SECURITY DEFINER RPCs are the only way an authenticated user can
-- read or increment their own usage.

create table if not exists public.kael_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  month_key text not null,
  message_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kael_usage_message_count_nonnegative
    check (message_count >= 0)
);

alter table public.kael_usage enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policies are granted to clients.
-- The RPCs below run as SECURITY DEFINER and perform the controlled access.

drop policy if exists "kael_usage_select_own" on public.kael_usage;
drop policy if exists "kael_usage_insert_own" on public.kael_usage;
drop policy if exists "kael_usage_update_own" on public.kael_usage;
drop policy if exists "kael_usage_delete_own" on public.kael_usage;

create or replace function public.kael_plan_limit(plan_value text)
returns integer
language plpgsql
immutable
set search_path = public
as $$
begin
  return case lower(coalesce(plan_value, 'free'))
    when 'elite' then 2000
    when 'performance' then 800
    when 'progress' then 300
    else 100
  end;
end;
$$;

create or replace function public.kael_effective_plan(profile_plan text, profile_status text)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if lower(coalesce(profile_status, '')) in ('active', 'trialing', 'past_due', 'unpaid') then
    if lower(coalesce(profile_plan, '')) in ('free', 'progress', 'performance', 'elite') then
      return lower(profile_plan);
    end if;
  end if;

  return 'free';
end;
$$;

create or replace function public.get_kael_usage()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_month text := to_char(timezone('utc', now()), 'YYYY-MM');
  current_count integer := 0;
  effective_plan text := 'free';
  usage_limit integer := 100;
begin
  if current_user_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  select public.kael_effective_plan(
    p.subscription_plan,
    p.subscription_status
  )
  into effective_plan
  from public.profiles p
  where p.id = current_user_id;

  usage_limit := public.kael_plan_limit(effective_plan);

  select u.message_count
  into current_count
  from public.kael_usage u
  where u.user_id = current_user_id
    and u.month_key = current_month;

  current_count := coalesce(current_count, 0);

  return jsonb_build_object(
    'used', current_count,
    'limit', usage_limit,
    'remaining', greatest(usage_limit - current_count, 0),
    'monthKey', current_month,
    'plan', effective_plan
  );
end;
$$;

create or replace function public.claim_kael_message()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_month text := to_char(timezone('utc', now()), 'YYYY-MM');
  effective_plan text := 'free';
  usage_limit integer := 100;
  current_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  select public.kael_effective_plan(
    p.subscription_plan,
    p.subscription_status
  )
  into effective_plan
  from public.profiles p
  where p.id = current_user_id;

  usage_limit := public.kael_plan_limit(effective_plan);

  -- Serialize claims for this user. This prevents two simultaneous
  -- requests from both seeing the same remaining slot.
  insert into public.kael_usage (
    user_id,
    month_key,
    message_count
  )
  values (
    current_user_id,
    current_month,
    0
  )
  on conflict (user_id) do nothing;

  select u.message_count, u.month_key
  into current_count, current_month
  from public.kael_usage u
  where u.user_id = current_user_id
  for update;

  -- The row is locked above, so only this transaction can change this
  -- user's quota while the claim is being decided.
  if current_month <> to_char(timezone('utc', now()), 'YYYY-MM') then
    current_month := to_char(timezone('utc', now()), 'YYYY-MM');

    update public.kael_usage
    set
      month_key = current_month,
      message_count = 1,
      updated_at = now()
    where user_id = current_user_id;

    current_count := 1;
  elsif current_count >= usage_limit then
    return jsonb_build_object(
      'allowed', false,
      'used', current_count,
      'limit', usage_limit,
      'remaining', 0,
      'monthKey', current_month,
      'plan', effective_plan
    );
  else
    update public.kael_usage
    set
      message_count = message_count + 1,
      updated_at = now()
    where user_id = current_user_id
    returning message_count into current_count;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'used', current_count,
    'limit', usage_limit,
    'remaining', greatest(usage_limit - current_count, 0),
    'monthKey', current_month,
    'plan', effective_plan
  );
end;
$$;

revoke all on table public.kael_usage from anon, authenticated;
revoke all on function public.kael_plan_limit(text) from public, anon, authenticated;
revoke all on function public.kael_effective_plan(text, text) from public, anon, authenticated;
revoke all on function public.get_kael_usage() from public, anon, authenticated;
revoke all on function public.claim_kael_message() from public, anon, authenticated;

grant execute on function public.get_kael_usage() to authenticated;
grant execute on function public.claim_kael_message() to authenticated;

comment on table public.kael_usage is
  'Server-authoritative monthly Kael usage. Direct client table access is disabled; usage is controlled by SECURITY DEFINER RPCs.';

comment on function public.claim_kael_message() is
  'Atomically reserves one Kael message slot for the authenticated user. It cannot exceed the server-side monthly plan limit.';
