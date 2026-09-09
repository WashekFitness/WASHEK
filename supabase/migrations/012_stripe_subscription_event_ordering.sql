/*
 * WASHEK — STRIPE SUBSCRIPTION EVENT ORDERING
 *
 * Prevents an older Stripe subscription event from overwriting
 * a newer subscription state.
 *
 * This works alongside 011_stripe_webhook_idempotency.sql:
 *
 * 011 = prevents duplicate processing of the same event
 * 012 = prevents out-of-order subscription events from regressing state
 */

create table if not exists public.stripe_subscription_events (
  event_id text primary key,
  event_type text not null,
  subscription_id text not null,
  event_created bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists stripe_subscription_events_subscription_created_idx
  on public.stripe_subscription_events (
    subscription_id,
    event_created desc
  );

alter table public.stripe_subscription_events enable row level security;

revoke all on public.stripe_subscription_events from anon, authenticated;

drop function if exists public.claim_stripe_subscription_event(
  text,
  text,
  text,
  bigint
);

create or replace function public.claim_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_subscription_id text,
  p_event_created bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_created bigint;
  claimed boolean := false;
begin
  /*
   * If this exact event was already recorded, reject it.
   */
  if exists (
    select 1
    from public.stripe_subscription_events
    where event_id = p_event_id
  ) then
    return false;
  end if;

  /*
   * Lock the most recent event for this subscription while
   * determining whether this event is newer.
   */
  select event_created
    into latest_created
  from public.stripe_subscription_events
  where subscription_id = p_subscription_id
  order by event_created desc
  limit 1
  for update;

  /*
   * Reject an event that is older than the newest event
   * already accepted for this subscription.
   */
  if latest_created is not null
     and coalesce(p_event_created, 0) < latest_created then
    return false;
  end if;

  /*
   * Record this event as the newest accepted event.
   */
  insert into public.stripe_subscription_events (
    event_id,
    event_type,
    subscription_id,
    event_created
  )
  values (
    p_event_id,
    p_event_type,
    p_subscription_id,
    coalesce(p_event_created, 0)
  );

  claimed := true;

  return claimed;
end;
$$;

revoke all on function public.claim_stripe_subscription_event(
  text,
  text,
  text,
  bigint
)
from public, anon, authenticated;

grant execute on function public.claim_stripe_subscription_event(
  text,
  text,
  text,
  bigint
)
to service_role;
