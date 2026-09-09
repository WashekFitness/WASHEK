import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Check, Timer, MessageSquare, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DayWorkout({ day, weekNumber, onBack, onComplete }) {
  const [completedSets, setCompletedSets] = useState({});
  const [startTime] = useState(Date.now());

  const toggleSet = (exIdx, setIdx) => {
    setCompletedSets(prev => {
      const key = `${exIdx}-${setIdx}`;
      const next = { ...prev };
      next[key] = !next[key];
      return next;
    });
  };

  const isExerciseComplete = (exIdx, totalSets) => {
    return Array.from({ length: totalSets }, (_, i) => completedSets[`${exIdx}-${i}`]).every(Boolean);
  };

  const allComplete = day.exercises?.every((ex, i) => isExerciseComplete(i, ex.sets));

  const handleFinish = () => {
    const duration = Math.round((Date.now() - startTime) / 60000);
    onComplete({
      date: new Date().toISOString().split('T')[0],
      week_number: weekNumber,
      day_name: day.day_name,
      exercises_completed: day.exercises?.map((ex, i) => ({
        name: ex.name,
        sets_completed: Array.from({ length: ex.sets }, (_, si) => completedSets[`${i}-${si}`]).filter(Boolean).length,
        reps_achieved: ex.reps,
      })),
      duration_minutes: duration || 1,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h3 className="font-heading font-bold text-lg">{day.day_name}</h3>
          <p className="text-sm text-muted-foreground">{day.workout_type}</p>
        </div>
      </div>

      <div className="space-y-3">
        {day.exercises?.map((ex, exIdx) => (
          <Card key={exIdx} className={cn(
            'p-4 transition-all',
            isExerciseComplete(exIdx, ex.sets) && 'bg-primary/5 border-primary/20'
          )}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <p className="font-heading font-bold">{ex.name}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{ex.sets} sets × {ex.reps}</span>
                  <span className="flex items-center gap-0.5">
                    <Timer className="w-3 h-3" />
                    {ex.rest_seconds}s rest
                  </span>
                </div>
              </div>
              {isExerciseComplete(exIdx, ex.sets) && (
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
              )}
            </div>

            {ex.notes && (
              <div className="flex items-start gap-1.5 mb-3 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{ex.notes}</span>
              </div>
            )}
            {ex.activation_cue && (
              <div className="flex items-start gap-1.5 mb-3 text-xs bg-primary/5 border border-primary/20 rounded-lg p-2">
                <Zap className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                <div>
                  <span className="font-bold text-primary">Activation Cue: </span>
                  <span className="text-foreground">{ex.activation_cue}</span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {Array.from({ length: ex.sets }, (_, setIdx) => (
                <button
                  key={setIdx}
                  onClick={() => toggleSet(exIdx, setIdx)}
                  className={cn(
                    'flex-1 h-10 rounded-xl text-xs font-bold transition-all active:scale-95',
                    completedSets[`${exIdx}-${setIdx}`]
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  Set {setIdx + 1}
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Button
        className="w-full h-14 font-heading font-semibold text-lg"
        disabled={!allComplete}
        onClick={handleFinish}
      >
        <Check className="w-5 h-5 mr-2" />
        Complete Workout
      </Button>
    </div>
  );
}