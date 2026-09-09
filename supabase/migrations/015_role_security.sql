-- ============================================================
-- WASHEK
-- Migration 015: Profile Role Security
--
-- Purpose:
-- Prevent authenticated users from changing their own
-- authorization role through the profiles table.
--
-- Security model:
-- - The database profile is the source of truth for role.
-- - Authenticated users may update normal profile information.
-- - Authenticated users may NOT promote/demote themselves.
-- - Backend/service-role operations remain able to manage roles.
--
-- This migration intentionally does NOT modify subscription
-- security. Subscription fields are already protected by the
-- existing profile security migration.
-- ============================================================


-- ============================================================
-- 1. Protect the profile role during authenticated updates
-- ============================================================
--
-- If an authenticated user is updating their own profile,
-- preserve the existing role from OLD.
--
-- This means a malicious request such as:
--
--   UPDATE profiles
--   SET role = 'admin'
--   WHERE id = auth.uid();
--
-- cannot change the role.
--
-- Backend/service-role operations have auth.uid() = NULL,
-- so they are not subject to this client-side protection.
-- ============================================================

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  /*
   * Only protect the role when the caller is an authenticated
   * user updating their own profile.
   */
  if auth.uid() is not null
     and auth.uid() = old.id then

    new.role := old.role;

  end if;

  return new;
end;
$$;


-- ============================================================
-- 2. Attach the role protection to profiles
-- ============================================================

drop trigger if exists protect_profile_role_trigger
on public.profiles;

create trigger protect_profile_role_trigger
before update on public.profiles
for each row
execute function public.protect_profile_role();


-- ============================================================
-- 3. Restrict direct execution of the security function
-- ============================================================
--
-- The function is only intended to run as a trigger.
-- It should not be callable directly through the Data API.
-- ============================================================

revoke all on function public.protect_profile_role()
from public, anon, authenticated;


-- ============================================================
-- 4. Documentation
-- ============================================================

comment on function public.protect_profile_role()
is 'Prevents authenticated users from changing their own WASHEK profile authorization role while preserving backend/service-role ability to manage roles.';
