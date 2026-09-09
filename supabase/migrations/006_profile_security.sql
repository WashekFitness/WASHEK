-- ============================================================
-- WASHEK
-- Migration 006: Profile Creation + Subscription Security
--
-- Purpose:
-- 1. Automatically create a profile whenever a new auth user
--    is created.
-- 2. Ensure every new profile starts as FREE / INACTIVE.
-- 3. Prevent authenticated users from inserting themselves
--    as Elite or otherwise assigning Stripe subscription data.
-- 4. Preserve Stripe/service-role ability to write subscription
--    fields.
-- 5. Preserve the existing onboarding flow.
--
-- IMPORTANT:
-- This migration does NOT modify the AI Edge Function.
-- ============================================================


-- ============================================================
-- 1. Make sure subscription columns exist
-- ============================================================

alter table public.profiles
  add column if not exists stripe_customer_id text;

alter table public.profiles
  add column if not exists stripe_subscription_id text;

alter table public.profiles
  add column if not exists stripe_price_id text;

alter table public.profiles
  add column if not exists subscription_status text default 'inactive';

alter table public.profiles
  add column if not exists subscription_updated_at timestamptz;

alter table public.profiles
  add column if not exists subscription_cancelled_at timestamptz;


-- ============================================================
-- 2. Make sure subscription indexes exist
-- ============================================================

create unique index if not exists profiles_stripe_customer_id_idx
  on public.profiles(stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists profiles_stripe_subscription_id_idx
  on public.profiles(stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists profiles_subscription_plan_idx
  on public.profiles(subscription_plan);

create index if not exists profiles_subscription_status_idx
  on public.profiles(subscription_status);


-- ============================================================
-- 3. Automatically create a profile for every new auth user
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    first_name,
    full_name,
    role,
    onboarded,
    subscription_plan,
    subscription_status
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    'user',
    false,
    'free',
    'inactive'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- ============================================================
-- 4. Attach the auth.users trigger
-- ============================================================

drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();


-- ============================================================
-- 5. Protect profile INSERTs
--
-- Authenticated users are allowed to create their own profile,
-- but they can NEVER insert privileged subscription information.
--
-- Service-role/backend operations have auth.uid() = NULL,
-- so Stripe/webhook/backend operations are allowed to supply
-- the real subscription values.
-- ============================================================

create or replace function public.protect_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  -- Requests coming from an authenticated user inserting
  -- their own profile are forced to safe values.
  if auth.uid() is not null
     and auth.uid() = new.id then

    new.role := 'user';

    new.subscription_plan := 'free';
    new.subscription_status := 'inactive';

    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    new.stripe_price_id := null;

    new.subscription_updated_at := null;
    new.subscription_cancelled_at := null;

    new.onboarded := false;
  end if;

  new.updated_at := now();

  return new;
end;
$$;


-- ============================================================
-- 6. Attach the profile INSERT protection trigger
-- ============================================================

drop trigger if exists protect_profile_insert_trigger
on public.profiles;

create trigger protect_profile_insert_trigger
before insert on public.profiles
for each row
execute function public.protect_profile_insert();


-- ============================================================
-- 7. Make sure existing NULL subscription statuses are safe
-- ============================================================

update public.profiles
set subscription_status = 'inactive'
where subscription_status is null;


-- ============================================================
-- 8. Make sure the existing UPDATE protection is present
--
-- Browser users must not be able to modify:
-- - subscription_plan
-- - subscription_status
-- - Stripe customer ID
-- - Stripe subscription ID
-- - Stripe price ID
-- - subscription timestamps
--
-- Backend/service-role operations remain unrestricted.
-- ============================================================

create or replace function public.protect_subscription_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  if auth.uid() is not null
     and auth.uid() = old.id then

    new.subscription_plan := old.subscription_plan;
    new.subscription_status := old.subscription_status;

    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.stripe_price_id := old.stripe_price_id;

    new.subscription_updated_at := old.subscription_updated_at;
    new.subscription_cancelled_at := old.subscription_cancelled_at;

  end if;

  new.updated_at := now();

  return new;
end;
$$;


-- ============================================================
-- 9. Recreate the UPDATE protection trigger
-- ============================================================

drop trigger if exists protect_subscription_fields_trigger
on public.profiles;

create trigger protect_subscription_fields_trigger
before update on public.profiles
for each row
execute function public.protect_subscription_fields();


-- ============================================================
-- 10. Ensure profiles RLS is enabled
-- ============================================================

alter table public.profiles enable row level security;


-- ============================================================
-- 11. Recreate profile policies
--
-- Users can:
--   SELECT their own profile
--   INSERT their own profile
--   UPDATE their own profile
--
-- The INSERT trigger above prevents them from assigning
-- themselves Elite/active/Stripe subscription information.
-- ============================================================

drop policy if exists "profile_select_own"
on public.profiles;

drop policy if exists "profile_insert_own"
on public.profiles;

drop policy if exists "profile_update_own"
on public.profiles;


create policy "profile_select_own"
  on public.profiles
  for select
  using (id = auth.uid());


create policy "profile_insert_own"
  on public.profiles
  for insert
  with check (id = auth.uid());


create policy "profile_update_own"
  on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());


-- ============================================================
-- 12. Backfill profiles for existing auth users that somehow
--     don't have a profile yet.
--
-- Existing profiles are NOT overwritten.
-- Existing subscription information is NOT changed.
-- ============================================================

insert into public.profiles (
  id,
  first_name,
  full_name,
  role,
  onboarded,
  subscription_plan,
  subscription_status
)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'first_name', ''),
  coalesce(u.raw_user_meta_data ->> 'first_name', ''),
  'user',
  false,
  'free',
  'inactive'
from auth.users u
left join public.profiles p
  on p.id = u.id
where p.id is null
on conflict (id) do nothing;


-- ============================================================
-- 13. Documentation comments
-- ============================================================

comment on function public.handle_new_user()
is 'Automatically creates a safe FREE/INACTIVE WASHEK profile for every new auth user.';

comment on function public.protect_profile_insert()
is 'Prevents authenticated clients from inserting privileged subscription, Stripe, or admin role fields into profiles.';

comment on function public.protect_subscription_fields()
is 'Prevents authenticated clients from modifying Stripe-controlled subscription fields while allowing service-role/backend updates.';
