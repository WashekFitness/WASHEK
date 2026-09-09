/*
 * WASHEK
 * Migration 014 — Fix automatic program calendar-week calculation
 */

DROP FUNCTION IF EXISTS public.get_current_program_week(uuid);

create function public.get_current_program_week(
  p_program_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  program_row public.workout_programs%rowtype;
  calendar_week integer;
begin
  /*
   * Only the owner of the program may ask for its calendar week.
   */
  select *
  into program_row
  from public.workout_programs
  where id = p_program_id
    and user_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'Program not found or access denied.';
  end if;

  /*
   * Week 1 begins in the calendar week containing the program's
   * creation timestamp.
   *
   * PostgreSQL date_trunc('week', ...) uses Monday as the
   * beginning of the week.
   */
  calendar_week :=
    greatest(
      1,
      (
        extract(
          epoch from (
            date_trunc('week', now())
            - date_trunc('week', program_row.created_at)
          )
        ) / 604800
      )::integer + 1
    );

  /*
   * Never generate beyond the program's configured duration.
   */
  calendar_week :=
    least(
      calendar_week,
      greatest(
        1,
        coalesce(program_row.duration_weeks, 12)
      )
    );

  return calendar_week;
end;
$$;

revoke all on function public.get_current_program_week(uuid)
  from public, anon;

grant execute on function public.get_current_program_week(uuid)
  to authenticated;
