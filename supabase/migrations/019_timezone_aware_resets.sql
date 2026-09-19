-- WASHEK
-- Migration 019: Timezone-Aware Daily & Monthly Resets
--
-- Guarantees:
-- 1. Adds timezone support to profiles table so each user's local timezone is respected.
-- 2. Calculates monthly Kael message quota using the user's calendar month in their timezone.
-- 3. Resets automatically at 12:00:00 AM on the 1st of the month in the user's specific timezone.

alter table public.profiles add column if not exists timezone text default 'UTC';

-- Drop previous zero-arg signatures if needed to avoid overload ambiguities
drop function if exists public.get_kael_usage();
drop function if exists public.claim_kael_message();
drop function if exists public.get_kael_usage(text);
drop function if exists public.claim_kael_message(text);

create or replace function public.get_kael_usage(p_timezone text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  user_tz text := 'UTC';
  current_month text;
  current_count integer := 0;
  effective_plan text := 'free';
  usage_limit integer := 100;
begin
  if current_user_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  -- Determine authoritative user plan and stored timezone from profiles
  select
    public.kael_effective_plan(
      p.subscription_plan,
      p.subscription_status,
      p.subscription_grace_until
    ),
    coalesce(nullif(trim(p_timezone), ''), nullif(trim(p.timezone), ''), 'UTC')
  into
    effective_plan,
    user_tz
  from public.profiles p
  where p.id = current_user_id;

  if user_tz is null or user_tz = '' then
    user_tz := 'UTC';
  end if;

  -- Safely calculate current calendar month in the user's timezone
  begin
    current_month := to_char(timezone(user_tz, now()), 'YYYY-MM');
  exception when others then
    user_tz := 'UTC';
    current_month := to_char(timezone('UTC', now()), 'YYYY-MM');
  end;

  usage_limit := public.kael_plan_limit(effective_plan);

  -- Retrieve current month's usage from kael_usage
  select u.message_count
  into current_count
  from public.kael_usage u
  where u.user_id = current_user_id
    and u.month_key = current_month;

  current_count := coalesce(current_count, 0);

  -- Ensure profiles table mirror stays synchronized
  update public.profiles
  set
    kael_msg_count = current_count,
    kael_msg_month = current_month,
    timezone = coalesce(nullif(trim(p_timezone), ''), profiles.timezone, user_tz)
  where id = current_user_id
    and (kael_msg_count is distinct from current_count or kael_msg_month is distinct from current_month);

  return jsonb_build_object(
    'used', current_count,
    'limit', usage_limit,
    'remaining', greatest(usage_limit - current_count, 0),
    'monthKey', current_month,
    'plan', effective_plan,
    'timezone', user_tz
  );
end;
$$;


create or replace function public.claim_kael_message(p_timezone text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  user_tz text := 'UTC';
  current_month text;
  effective_plan text := 'free';
  usage_limit integer := 100;
  current_count integer := 0;
  saved_month text;
begin
  if current_user_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  -- Read plan and timezone authoritatively from profiles table
  select
    public.kael_effective_plan(
      p.subscription_plan,
      p.subscription_status,
      p.subscription_grace_until
    ),
    coalesce(nullif(trim(p_timezone), ''), nullif(trim(p.timezone), ''), 'UTC')
  into
    effective_plan,
    user_tz
  from public.profiles p
  where p.id = current_user_id;

  if user_tz is null or user_tz = '' then
    user_tz := 'UTC';
  end if;

  -- Safely calculate current calendar month in the user's timezone
  begin
    current_month := to_char(timezone(user_tz, now()), 'YYYY-MM');
  exception when others then
    user_tz := 'UTC';
    current_month := to_char(timezone('UTC', now()), 'YYYY-MM');
  end;

  usage_limit := public.kael_plan_limit(effective_plan);

  -- Ensure row exists
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
  on conflict (user_id)
  do nothing;

  -- Lock row to prevent race conditions & double-claims
  select
    u.message_count,
    u.month_key
  into
    current_count,
    saved_month
  from public.kael_usage u
  where u.user_id = current_user_id
  for update;

  /*
   * Monthly rollover:
   * If the stored month does not match the current month in user's timezone (e.g. 1st of month at 12:00 AM),
   * renew the user's quota back to 0 (with this claim being message 1).
   */
  if saved_month is distinct from current_month then
    update public.kael_usage
    set
      month_key = current_month,
      message_count = 1,
      updated_at = now()
    where user_id = current_user_id;

    current_count := 1;

    update public.profiles
    set
      kael_msg_count = 1,
      kael_msg_month = current_month
    where id = current_user_id;

    return jsonb_build_object(
      'allowed', true,
      'used', 1,
      'limit', usage_limit,
      'remaining', greatest(usage_limit - 1, 0),
      'monthKey', current_month,
      'plan', effective_plan,
      'timezone', user_tz
    );

  /*
   * Strict backend quota enforcement:
   * Reject request immediately if the user has reached their monthly limit.
   */
  elsif current_count >= usage_limit then
    -- Keep profile in sync
    update public.profiles
    set
      kael_msg_count = current_count,
      kael_msg_month = current_month
    where id = current_user_id
      and (kael_msg_count is distinct from current_count or kael_msg_month is distinct from current_month);

    return jsonb_build_object(
      'allowed', false,
      'used', current_count,
      'limit', usage_limit,
      'remaining', 0,
      'monthKey', current_month,
      'plan', effective_plan,
      'timezone', user_tz
    );

  /*
   * Claim message slot atomically.
   */
  else
    update public.kael_usage
    set
      message_count = message_count + 1,
      updated_at = now()
    where user_id = current_user_id
    returning message_count into current_count;

    update public.profiles
    set
      kael_msg_count = current_count,
      kael_msg_month = current_month
    where id = current_user_id;

    return jsonb_build_object(
      'allowed', true,
      'used', current_count,
      'limit', usage_limit,
      'remaining', greatest(usage_limit - current_count, 0),
      'monthKey', current_month,
      'plan', effective_plan,
      'timezone', user_tz
    );
  end if;
end;
$$;

revoke all on function public.get_kael_usage(text) from public, anon;
revoke all on function public.claim_kael_message(text) from public, anon;
grant execute on function public.get_kael_usage(text) to authenticated;
grant execute on function public.claim_kael_message(text) to authenticated;
