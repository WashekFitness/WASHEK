-- ============================================================
-- WASHEK - Stripe Subscription Support
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

-- ------------------------------------------------------------
-- IMPORTANT:
-- Subscription/billing fields must NOT be writable by the
-- browser. The Stripe webhook uses the Supabase service role
-- and can still update them.
-- ------------------------------------------------------------

create or replace function public.protect_subscription_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id then
    new.subscription_plan := old.subscription_plan;
    new.subscription_status := old.subscription_status;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.stripe_price_id := old.stripe_price_id;
    new.subscription_updated_at := old.subscription_updated_at;
  end if;

  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists protect_subscription_fields_trigger
on public.profiles;

create trigger protect_subscription_fields_trigger
before update on public.profiles
for each row
execute function public.protect_subscription_fields();
