/*
 * WASHEK — STRIPE CHECKOUT CONCURRENCY PROTECTION
 *
 * Prevents two simultaneous create-checkout-session requests for the same
 * authenticated user from creating two Stripe Checkout Sessions.
 */

create table if not exists public.stripe_checkout_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null,
  status text not null default 'creating'
    check (status in ('creating', 'created')),
  stripe_session_id text,
  checkout_url text,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_checkout_locks_expires_idx
  on public.stripe_checkout_locks (expires_at);

alter table public.stripe_checkout_locks enable row level security;
revoke all on public.stripe_checkout_locks from anon, authenticated;

/*
 * Atomically claims a user's checkout slot.
 *
 * Returns:
 *   locked = false  -> this request owns the slot
 *   locked = true   -> another checkout is already being created/used
 *                      and checkout_url/session_id may be reusable
 */
drop function if exists public.claim_checkout_session_lock(uuid, text, integer);

create or replace function public.claim_checkout_session_lock(
  p_user_id uuid,
  p_plan text,
  p_lock_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.stripe_checkout_locks%rowtype;
  inserted_user uuid;
  lock_minutes integer := greatest(coalesce(p_lock_minutes, 30), 1);
begin
  /* Expired locks may be reclaimed before attempting the atomic insert. */
  delete from public.stripe_checkout_locks
   where user_id = p_user_id
     and expires_at <= now();

  /*
   * Atomic claim. The primary key on user_id guarantees that concurrent
   * requests cannot both successfully insert a live checkout lock.
   */
  insert into public.stripe_checkout_locks (
    user_id,
    plan,
    status,
    stripe_session_id,
    checkout_url,
    expires_at,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    p_plan,
    'creating',
    null,
    null,
    now() + make_interval(mins => lock_minutes),
    now(),
    now()
  )
  on conflict (user_id) do nothing
  returning user_id into inserted_user;

  if inserted_user is not null then
    return jsonb_build_object(
      'locked', false,
      'plan', p_plan,
      'status', 'creating'
    );
  end if;

  /* Another live request already owns the slot. */
  select *
    into existing
    from public.stripe_checkout_locks
   where user_id = p_user_id;

  if not found then
    /* Extremely unlikely race after an expired-row cleanup; retry once. */
    insert into public.stripe_checkout_locks (
      user_id,
      plan,
      status,
      expires_at,
      created_at,
      updated_at
    )
    values (
      p_user_id,
      p_plan,
      'creating',
      now() + make_interval(mins => lock_minutes),
      now(),
      now()
    )
    on conflict (user_id) do nothing
    returning user_id into inserted_user;

    if inserted_user is not null then
      return jsonb_build_object(
        'locked', false,
        'plan', p_plan,
        'status', 'creating'
      );
    end if;

    select *
      into existing
      from public.stripe_checkout_locks
     where user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'locked', true,
    'plan', existing.plan,
    'status', existing.status,
    'stripe_session_id', existing.stripe_session_id,
    'checkout_url', existing.checkout_url,
    'expires_at', existing.expires_at
  );
end;
$$;

revoke all on function public.claim_checkout_session_lock(uuid, text, integer)
  from public, anon, authenticated;

grant execute on function public.claim_checkout_session_lock(uuid, text, integer)
  to service_role;
