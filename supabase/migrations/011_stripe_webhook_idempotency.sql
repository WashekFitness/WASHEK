/*
 * WASHEK — STRIPE WEBHOOK IDEMPOTENCY
 *
 * Stripe may deliver the same webhook more than once.
 * This table gives each Stripe event one processing record so
 * duplicate deliveries cannot apply the same subscription change twice.
 */

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  event_created bigint not null default 0,
  status text not null default 'processing'
    check (status in ('processing', 'succeeded', 'failed')),
  locked_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_status_locked_idx
  on public.stripe_webhook_events (status, locked_at);

alter table public.stripe_webhook_events enable row level security;

revoke all on public.stripe_webhook_events from anon, authenticated;

drop function if exists public.claim_stripe_webhook_event(text, text, bigint);

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_event_created bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  insert into public.stripe_webhook_events (
    event_id,
    event_type,
    event_created,
    status,
    locked_at,
    last_error
  )
  values (
    p_event_id,
    p_event_type,
    coalesce(p_event_created, 0),
    'processing',
    now(),
    null
  )
  on conflict (event_id) do update
    set
      event_type = excluded.event_type,
      event_created = excluded.event_created,
      status = 'processing',
      locked_at = now(),
      last_error = null,
      processed_at = null
    where public.stripe_webhook_events.status = 'failed'
       or (
         public.stripe_webhook_events.status = 'processing'
         and public.stripe_webhook_events.locked_at < now() - interval '10 minutes'
       )
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text, bigint)
  from public, anon, authenticated;

grant execute on function public.claim_stripe_webhook_event(text, text, bigint)
  to service_role;
