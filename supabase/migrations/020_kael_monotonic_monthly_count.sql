-- WASHEK
-- Migration 020: Monotonic Monthly Kael Usage (Never Reset Mid-Month)
--
-- Guarantees:
-- 1. get_kael_usage and claim_kael_message reconcile BOTH public.kael_usage and public.profiles
--    for the current calendar month (YYYY-MM in user's timezone) using greatest(...), so a stale
--    or missing row in either table can NEVER wipe the other back to 0 mid-month.
-- 2. Monthly count ONLY resets back to 0 (or 1 on first claim) when the calendar month
--    actually changes on the 1st of the month in the user's timezone.

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
  u_count integer := 0;
  u_month text;
  p_count integer := 0;
  p_month text;
  current_count integer := 0;
  effective_plan text := 'free';
  usage_limit integer := 100;
begin
  if current_user_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  select
    public.kael_effective_plan(
      p.subscription_plan,
      p.subscription_status,
      p.subscription_grace_until
    ),
    coalesce(nullif(trim(p_timezone), ''), nullif(trim(p.timezone), ''), 'UTC'),
    coalesce(p.kael_msg_count, 0),
    p.kael_msg_month
  into
    effective_plan,
    user_tz,
    p_count,
    p_month
  from public.profiles p
  where p.id = current_user_id;

  if user_tz is null or user_tz = '' then
    user_tz := 'UTC';
  end if;

  begin
    current_month := to_char(timezone(user_tz, now()), 'YYYY-MM');
  exception when others then
    user_tz := 'UTC';
    current_month := to_char(timezone('UTC', now()), 'YYYY-MM');
  end;

  usage_limit := public.kael_plan_limit(effective_plan);

  select u.message_count, u.month_key
  into u_count, u_month
  from public.kael_usage u
  where u.user_id = current_user_id;

  current_count := greatest(
    case when u_month = current_month then coalesce(u_count, 0) else 0 end,
    case when p_month = current_month then coalesce(p_count, 0) else 0 end
  );

  -- Keep kael_usage synchronized up to current_count (only resetting when current_month is genuinely new)
  insert into public.kael_usage (user_id, month_key, message_count, updated_at)
  values (current_user_id, current_month, current_count, now())
  on conflict (user_id)
  do update set
    month_key = current_month,
    message_count = greatest(
      case when public.kael_usage.month_key = current_month then coalesce(public.kael_usage.message_count, 0) else 0 end,
      current_count
    ),
    updated_at = now()
  where public.kael_usage.month_key is distinct from current_month
     or coalesce(public.kael_usage.message_count, 0) < current_count;

  -- Keep profiles mirror synchronized monotonically within the same calendar month
  update public.profiles
  set
    kael_msg_count = current_count,
    kael_msg_month = current_month,
    timezone = coalesce(nullif(trim(p_timezone), ''), profiles.timezone, user_tz)
  where id = current_user_id
    and (
      kael_msg_month is distinct from current_month
      or coalesce(kael_msg_count, 0) < current_count
    );

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
  u_count integer := 0;
  saved_month text;
  p_count integer := 0;
  p_month text;
  current_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  select
    public.kael_effective_plan(
      p.subscription_plan,
      p.subscription_status,
      p.subscription_grace_until
    ),
    coalesce(nullif(trim(p_timezone), ''), nullif(trim(p.timezone), ''), 'UTC'),
    coalesce(p.kael_msg_count, 0),
    p.kael_msg_month
  into
    effective_plan,
    user_tz,
    p_count,
    p_month
  from public.profiles p
  where p.id = current_user_id;

  if user_tz is null or user_tz = '' then
    user_tz := 'UTC';
  end if;

  begin
    current_month := to_char(timezone(user_tz, now()), 'YYYY-MM');
  exception when others then
    user_tz := 'UTC';
    current_month := to_char(timezone('UTC', now()), 'YYYY-MM');
  end;

  usage_limit := public.kael_plan_limit(effective_plan);

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

  select
    u.message_count,
    u.month_key
  into
    u_count,
    saved_month
  from public.kael_usage u
  where u.user_id = current_user_id
  for update;

  -- Reconcile both kael_usage and profiles for current_month; never lose counts mid-month
  current_count := greatest(
    case when saved_month = current_month then coalesce(u_count, 0) else 0 end,
    case when p_month = current_month then coalesce(p_count, 0) else 0 end
  );

  if current_count >= usage_limit then
    update public.kael_usage
    set
      month_key = current_month,
      message_count = current_count,
      updated_at = now()
    where user_id = current_user_id;

    update public.profiles
    set
      kael_msg_count = current_count,
      kael_msg_month = current_month
    where id = current_user_id
      and (kael_msg_month is distinct from current_month or coalesce(kael_msg_count, 0) < current_count);

    return jsonb_build_object(
      'allowed', false,
      'used', current_count,
      'limit', usage_limit,
      'remaining', 0,
      'monthKey', current_month,
      'plan', effective_plan,
      'timezone', user_tz
    );
  end if;

  current_count := current_count + 1;

  update public.kael_usage
  set
    month_key = current_month,
    message_count = current_count,
    updated_at = now()
  where user_id = current_user_id;

  update public.profiles
  set
    kael_msg_count = current_count,
    kael_msg_month = current_month,
    timezone = coalesce(nullif(trim(p_timezone), ''), profiles.timezone, user_tz)
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
end;
$$;

revoke all on function public.get_kael_usage(text) from public, anon;
revoke all on function public.claim_kael_message(text) from public, anon;
grant execute on function public.get_kael_usage(text) to authenticated;
grant execute on function public.claim_kael_message(text) to authenticated;
