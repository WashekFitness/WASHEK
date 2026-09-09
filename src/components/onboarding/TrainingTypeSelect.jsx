import { PersonStanding, Dumbbell, Trophy, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TRAINING_TYPES } from '@/lib/trainingTypes';

const ICONS = { PersonStanding, Dumbbell, Trophy, Layers };

export default function TrainingTypeSelect({ value, onChange }) {
  return (
    <div className="space-y-3">
      {TRAINING_TYPES.map(({ value: v, label, iconName, desc }) => {
        const Icon = ICONS[iconName];
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={cn(
              'w-full p-4 rounded-2xl border-2 text-left transition-all',
              value === v
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card hover:border-muted-foreground/30'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                value === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}>
                {Icon && <Icon className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">{label}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}