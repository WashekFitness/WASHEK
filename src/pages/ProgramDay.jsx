import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabaseApi } from '@/lib/supabaseApi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DayWorkout from '@/components/program/DayWorkout';
import { expandMicrocycles } from '@/lib/expandMicrocycles';
import { toast } from 'sonner';

export default function ProgramDay() {
  const { dayIndex } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [userEmail, setUserEmail] = useState(null);
  useEffect(() => { supabaseApi.auth.me().then(u => setUserEmail(u?.email)); }, []);

  const { data: programs = [], isLoading } = useQuery({
    queryKey: ['programs', userEmail],
    queryFn: () => supabaseApi.entities.WorkoutProgram.filter({ status: 'active', created_by: userEmail }, '-created_date', 1),
    enabled: !!userEmail,
  });

  const logMutation = useMutation({
    mutationFn: (data) => supabaseApi.entities.WorkoutLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      toast.success('Workout logged! Great job 💪');
    },
  });

  const program = programs[0] ? expandMicrocycles(programs[0]) : null;
  const weekNumber = location.state?.week || program?.current_week || 1;
  const microcycle = program?.microcycles?.find(m => m.week_number === weekNumber);
  const day = microcycle?.days?.[parseInt(dayIndex)];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <p className="text-muted-foreground">No active program found.</p>
      </div>
    );
  }

  if (!day) {
    return (
      <div className="px-5 pt-12">
        <p className="text-muted-foreground">Day not found.</p>
      </div>
    );
  }

  return (
    <div className="px-5 pb-4">
      <DayWorkout
        day={day}
        weekNumber={weekNumber}
        onBack={() => navigate(-1)}
        onComplete={(logData) => {
          logMutation.mutate({ ...logData, program_id: program.id });
          navigate(-1);
        }}
      />
    </div>
  );
}