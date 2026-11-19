-- ============================================================
-- WASHEK — Migration 021: Complete Stripe Sync Schema & Trial Tracking
-- ============================================================

-- 1. Ensure all Stripe & trial tracking columns exist on public.profiles
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists has_used_trial boolean default false;
alter table public.profiles add column if not exists trial_used boolean default false;
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists stripe_price_id text;
alter table public.profiles add column if not exists subscription_plan text default 'free';
alter table public.profiles add column if not exists subscription_status text default 'inactive';
alter table public.profiles add column if not exists subscription_grace_until timestamptz;
alter table public.profiles add column if not exists subscription_updated_at timestamptz;
alter table public.profiles add column if not exists subscription_cancelled_at timestamptz;

-- 2. Backfill emails from auth.users and create missing profile rows
insert into public.profiles (id, email, subscription_plan, subscription_status)
select u.id, u.email, 'free', 'inactive'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and (p.email is null or p.email = '');

create index if not exists profiles_email_idx on public.profiles(lower(email));

-- 3. Keep profile email synced when auth.users changes
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
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

-- 4. Fast O(1) service-role RPC to resolve user ID from email in auth.users
create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.get_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;

-- 5. Protect subscription fields trigger:
--    - Blocks browser users from self-upgrading to paid plans
--    - Allows browser users to cancel/downgrade to free
--    - Allows Stripe webhook & service_role (auth.uid() IS NULL) full write access
create or replace function public.protect_subscription_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id then
    if new.subscription_plan = 'free' or new.subscription_status in ('canceled', 'inactive') then
      new.subscription_plan := 'free';
      new.subscription_status := 'canceled';
      new.stripe_subscription_id := null;
      new.stripe_price_id := null;
      new.subscription_grace_until := null;
      new.subscription_cancelled_at := coalesce(new.subscription_cancelled_at, now());
    else
      new.subscription_plan := old.subscription_plan;
      new.subscription_status := old.subscription_status;
      new.stripe_customer_id := old.stripe_customer_id;
      new.stripe_subscription_id := old.stripe_subscription_id;
      new.stripe_price_id := old.stripe_price_id;
      new.has_used_trial := old.has_used_trial;
      new.trial_used := old.trial_used;
      new.subscription_grace_until := old.subscription_grace_until;
      new.subscription_updated_at := old.subscription_updated_at;
      new.subscription_cancelled_at := old.subscription_cancelled_at;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_subscription_fields_trigger on public.profiles;
create trigger protect_subscription_fields_trigger
before update on public.profiles
for each row execute function public.protect_subscription_fields();
