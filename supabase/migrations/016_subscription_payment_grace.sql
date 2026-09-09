-- ============================================================
-- WASHEK
-- Migration 016: 3-Day Subscription Payment Grace Period
--
-- Failed recurring payment:
--
--   1. Paid access remains available for 3 days.
--   2. The grace deadline is established once.
--   3. Repeated payment failures DO NOT extend the deadline.
--   4. Stripe is scheduled to cancel at the deadline.
--   5. Successful payment clears the grace deadline.
--   6. Stripe cancellation changes the account to Free.
-- ============================================================


alter table public.profiles
  add column if not exists
    subscription_grace_until timestamptz;


create index if not exists
  profiles_subscription_grace_until_idx
on public.profiles (
  subscription_grace_until
);


-- ============================================================
-- PROTECT SUBSCRIPTION FIELDS
-- ============================================================

create or replace function
public.protect_subscription_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  if auth.uid() is not null
     and auth.uid() = old.id then

    new.subscription_plan :=
      old.subscription_plan;

    new.subscription_status :=
      old.subscription_status;

    new.stripe_customer_id :=
      old.stripe_customer_id;

    new.stripe_subscription_id :=
      old.stripe_subscription_id;

    new.stripe_price_id :=
      old.stripe_price_id;

    new.subscription_updated_at :=
      old.subscription_updated_at;

    new.subscription_cancelled_at :=
      old.subscription_cancelled_at;

    new.subscription_grace_until :=
      old.subscription_grace_until;

  end if;


  new.updated_at :=
    now();

  return new;

end;
$$;


-- ============================================================
-- REMOVE BOTH POSSIBLE OLD FUNCTION SIGNATURES
-- ============================================================

drop function if exists
public.kael_effective_plan(
  text,
  text
);

drop function if exists
public.kael_effective_plan(
  text,
  text,
  timestamptz
);


-- ============================================================
-- SERVER-SIDE KAEL ENTITLEMENT
-- ============================================================

create or replace function
public.kael_effective_plan(
  profile_plan text,
  profile_status text,
  profile_grace_until timestamptz
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  normalized_status text :=
    lower(
      coalesce(
        profile_status,
        ''
      )
    );

  normalized_plan text :=
    lower(
      coalesce(
        profile_plan,
        ''
      )
    );
begin

  /*
   * Fully paid subscriptions.
   */
  if normalized_status in (
    'active',
    'trialing'
  ) then

    if normalized_plan in (
      'free',
      'progress',
      'performance',
      'elite'
    ) then

      return normalized_plan;

    end if;

  end if;


  /*
   * Payment failure grace period.
   *
   * past_due and unpaid retain the paid plan
   * ONLY while the explicit deadline is still
   * in the future.
   */
  if normalized_status in (
    'past_due',
    'unpaid'
  )
  and profile_grace_until is not null
  and profile_grace_until > now()
  then

    if normalized_plan in (
      'free',
      'progress',
      'performance',
      'elite'
    ) then

      return normalized_plan;

    end if;

  end if;


  /*
   * Everything else is Free.
   */
  return 'free';

end;
$$;


-- ============================================================
-- KAEL USAGE
-- ============================================================

create or replace function
public.get_kael_usage()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare

  current_user_id uuid :=
    auth.uid();

  current_month text :=
    to_char(
      timezone(
        'utc',
        now()
      ),
      'YYYY-MM'
    );

  current_count integer :=
    0;

  effective_plan text :=
    'free';

  usage_limit integer :=
    100;

begin

  if current_user_id is null then

    raise exception
      'Not authenticated.'
      using errcode = '42501';

  end if;


  select public.kael_effective_plan(
    p.subscription_plan,
    p.subscription_status,
    p.subscription_grace_until
  )
  into effective_plan
  from public.profiles p
  where p.id =
    current_user_id;


  usage_limit :=
    public.kael_plan_limit(
      effective_plan
    );


  select u.message_count
  into current_count
  from public.kael_usage u
  where u.user_id =
    current_user_id
    and u.month_key =
      current_month;


  current_count :=
    coalesce(
      current_count,
      0
    );


  return jsonb_build_object(
    'used',
    current_count,

    'limit',
    usage_limit,

    'remaining',
    greatest(
      usage_limit -
      current_count,
      0
    ),

    'monthKey',
    current_month,

    'plan',
    effective_plan
  );

end;
$$;


-- ============================================================
-- ATOMIC KAEL MESSAGE CLAIM
-- ============================================================

create or replace function
public.claim_kael_message()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare

  current_user_id uuid :=
    auth.uid();

  current_month text :=
    to_char(
      timezone(
        'utc',
        now()
      ),
      'YYYY-MM'
    );

  effective_plan text :=
    'free';

  usage_limit integer :=
    100;

  current_count integer :=
    0;

begin

  if current_user_id is null then

    raise exception
      'Not authenticated.'
      using errcode = '42501';

  end if;


  select public.kael_effective_plan(
    p.subscription_plan,
    p.subscription_status,
    p.subscription_grace_until
  )
  into effective_plan
  from public.profiles p
  where p.id =
    current_user_id;


  usage_limit :=
    public.kael_plan_limit(
      effective_plan
    );


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
  on conflict (
    user_id
  )
  do nothing;


  select
    u.message_count,
    u.month_key

  into
    current_count,
    current_month

  from public.kael_usage u

  where u.user_id =
    current_user_id

  for update;


  /*
   * Monthly rollover.
   */
  if current_month <>
     to_char(
       timezone(
         'utc',
         now()
       ),
       'YYYY-MM'
     )
  then

    current_month :=
      to_char(
        timezone(
          'utc',
          now()
        ),
        'YYYY-MM'
      );


    update public.kael_usage

    set
      month_key =
        current_month,

      message_count =
        1,

      updated_at =
        now()

    where user_id =
      current_user_id;


    current_count :=
      1;


  elsif current_count >=
        usage_limit
  then

    return jsonb_build_object(

      'allowed',
      false,

      'used',
      current_count,

      'limit',
      usage_limit,

      'remaining',
      0,

      'monthKey',
      current_month,

      'plan',
      effective_plan

    );


  else

    update public.kael_usage

    set
      message_count =
        message_count + 1,

      updated_at =
        now()

    where user_id =
      current_user_id

    returning
      message_count
    into
      current_count;

  end if;


  return jsonb_build_object(

    'allowed',
    true,

    'used',
    current_count,

    'limit',
    usage_limit,

    'remaining',
    greatest(
      usage_limit -
      current_count,
      0
    ),

    'monthKey',
    current_month,

    'plan',
    effective_plan

  );

end;
$$;


-- ============================================================
-- FUNCTION PERMISSIONS
-- ============================================================

revoke all on function
public.kael_effective_plan(
  text,
  text,
  timestamptz
)
from
  public,
  anon,
  authenticated;


grant execute on function
public.get_kael_usage()
to authenticated;


grant execute on function
public.claim_kael_message()
to authenticated;
