-- ============================================================
-- WASHEK: Allow User Cancellation & Add Email to Profiles
-- ============================================================

-- 1. Add email column to public.profiles if not exists
alter table public.profiles add column if not exists email text;

-- 2. Backfill existing emails from auth.users
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and (p.email is null or p.email = '');

create index if not exists profiles_email_idx on public.profiles(lower(email));

-- 3. Trigger to keep email in sync on user creation/update
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_sync on auth.users;
create trigger on_auth_user_email_sync
after insert or update of email on auth.users
for each row execute function public.sync_profile_email();

-- 4. Update protect_subscription_fields trigger:
-- ALLOW users to downgrade to 'free' and 'canceled' (cancellation),
-- but PREVENT users from self-upgrading to paid tiers without Stripe webhook.
create or replace function public.protect_subscription_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id then
    -- If user is attempting to cancel (setting plan to free or status to canceled/inactive), ALLOW IT!
    if new.subscription_plan = 'free' or new.subscription_status in ('canceled', 'inactive') then
      new.subscription_plan := 'free';
      new.subscription_status := 'canceled';
      new.stripe_subscription_id := null;
      new.stripe_price_id := null;
      new.subscription_cancelled_at := coalesce(new.subscription_cancelled_at, now());
    else
      -- Prevent self-upgrades to paid tiers (must come from Stripe webhook or service role)
      new.subscription_plan := old.subscription_plan;
      new.subscription_status := old.subscription_status;
      new.stripe_customer_id := old.stripe_customer_id;
      new.stripe_subscription_id := old.stripe_subscription_id;
      new.stripe_price_id := old.stripe_price_id;
      new.subscription_updated_at := old.subscription_updated_at;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- 5. Reset washekfitness@gmail.com account back to Free Plan cleanly
update public.profiles
set subscription_plan = 'free',
    subscription_status = 'canceled',
    stripe_subscription_id = null,
    stripe_customer_id = null,
    stripe_price_id = null,
    subscription_cancelled_at = now(),
    subscription_updated_at = now()
where id in (
  select id from auth.users where lower(email) = 'washekfitness@gmail.com'
);
