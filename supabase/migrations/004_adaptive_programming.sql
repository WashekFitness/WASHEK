-- Adaptive Programming (Progress+)
-- Stores meaningful edits made to a user's generated workout program so
-- future program generation can use repeated preferences and programming feedback.

alter table public.workout_programs
  add column if not exists adaptation_history jsonb not null default '[]'::jsonb;

comment on column public.workout_programs.adaptation_history is
  'Progress+ workout-program edits used as adaptive programming feedback for future Kael-generated programs.';
