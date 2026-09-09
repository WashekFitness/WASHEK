import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CalendarDays, Layers, Zap, ChevronRight, ChevronDown, TrendingDown, Target, Eye } from 'lucide-react';

const cycleColors = ['border-l-primary', 'border-l-accent', 'border-l-chart-4', 'border-l-chart-3'];
const dotColors = ['bg-primary', 'bg-accent', 'bg-chart-4', 'bg-chart-3'];
const badgeColors = ['bg-primary/15 text-primary border-primary/20', 'bg-accent/15 text-accent border-accent/20', 'bg-chart-4/15 text-chart-4 border-chart-4/20', 'bg-chart-3/15 text-chart-3 border-chart-3/20'];
const headerColors = ['text-primary', 'text-accent', 'text-chart-4', 'text-chart-3'];

const weekTypeBadge = {
  foundation: 'bg-accent/10 text-accent',
  accumulation: 'bg-primary/10 text-primary',
  intensification: 'bg-chart-4/10 text-chart-4',
  peak: 'bg-chart-3/10 text-chart-3',
  taper: 'bg-chart-3/10 text-chart-3',
  deload: 'bg-muted text-muted-foreground',
};

function getWeekTypeBadge(weekType) {
  if (!weekType) return 'bg-muted text-muted-foreground';
  return weekTypeBadge[weekType.toLowerCase()] || 'bg-muted text-muted-foreground';
}

export default function CycleOverview({ program }) {
  const [expandedMeso, setExpandedMeso] = useState(null);

  if (!program) return null;

  // Group microcycles by mesocycle index
  const microsByMeso = {};
  (program.microcycles || []).forEach(micro => {
    const idx = micro.mesocycle_index ?? 0;
    if (!microsByMeso[idx]) microsByMeso[idx] = [];
    microsByMeso[idx].push(micro);
  });

  return (
    <div className="space-y-6 pb-4">

      {/* MACROCYCLE */}
      <section>
        <div className="flex items-center gap-2 mb-2 px-1">
          <CalendarDays className="w-4 h-4 text-primary" />
          <h3 className="font-heading font-bold text-base">Macrocycle</h3>
          <Badge className="text-[10px] bg-muted text-muted-foreground border-0 ml-auto">{program.duration_weeks} weeks total</Badge>
        </div>
        <p className="text-xs text-muted-foreground px-1 mb-3">
          Your <span className="text-foreground font-medium">macrocycle</span> is the full training plan from start to finish — the big picture roadmap to your goal.
        </p>
        <Card className="p-4">
          <p className="text-sm text-foreground/80 leading-relaxed mb-3">{program.macrocycle?.overview}</p>
          <div className="space-y-2">
            {program.macrocycle?.phases?.map((phase, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', dotColors[i % dotColors.length])} />
                <span className="font-semibold">{phase.name}</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground text-xs flex-1">{phase.focus}</span>
                <span className="text-xs font-medium text-foreground/70 bg-muted px-2 py-0.5 rounded-full">{phase.weeks}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* MESOCYCLES — expandable to show weekly breakdown */}
      <section>
        <div className="flex items-center gap-2 mb-2 px-1">
          <Layers className="w-4 h-4 text-accent" />
          <h3 className="font-heading font-bold text-base">Mesocycles</h3>
          <Badge className="text-[10px] bg-muted text-muted-foreground border-0 ml-auto">{program.mesocycles?.length} blocks</Badge>
        </div>
        <p className="text-xs text-muted-foreground px-1 mb-3">
          <span className="text-foreground font-medium">Mesocycles</span> are the training blocks inside your plan. Tap any block to see the weekly breakdown and what each week targets.
        </p>
        <div className="space-y-3">
          {program.mesocycles?.map((meso, i) => {
            const mesoMicros = microsByMeso[i] || [];
            const isExpanded = expandedMeso === i;
            const weekRange = mesoMicros.length > 0
              ? `Wks ${Math.min(...mesoMicros.map(m => m.week_number))}–${Math.max(...mesoMicros.map(m => m.week_number))}`
              : null;

            return (
              <div key={i}>
                <Card
                  className={cn('p-4 border-l-4 cursor-pointer transition-all hover:bg-card/80', cycleColors[i % cycleColors.length])}
                  onClick={() => setExpandedMeso(isExpanded ? null : i)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className={cn('font-heading font-bold', headerColors[i % headerColors.length])}>{meso.name}</p>
                        {weekRange && <span className="text-[10px] text-muted-foreground font-medium">{weekRange}</span>}
                      </div>
                      <p className="text-sm text-muted-foreground">{meso.focus}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <Badge className={cn('text-[10px] border', badgeColors[i % badgeColors.length])}>{meso.weeks} weeks</Badge>
                      <span className="text-[10px] text-muted-foreground">Intensity: {meso.intensity}</span>
                    </div>
                    <div className="flex items-center ml-1 mt-0.5">
                      <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                    </div>
                  </div>
                </Card>

                {/* Expanded weekly breakdown */}
                {isExpanded && mesoMicros.length > 0 && (
                  <div className="mt-1 ml-3 pl-3 border-l-2 border-border space-y-1.5 pb-1">
                    {mesoMicros.sort((a, b) => a.week_number - b.week_number).map((micro, j) => {
                      const trainingDays = micro.days?.filter(d => d.exercises?.length > 0).length || 0;
                      const isDeload = micro.week_type?.toLowerCase().includes('deload') || micro.week_type?.toLowerCase().includes('taper');
                      return (
                        <div key={j} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            {isDeload ? <TrendingDown className="w-3.5 h-3.5 text-muted-foreground" /> : <Zap className="w-3.5 h-3.5 text-muted-foreground" />}
                            <span className="text-sm font-semibold">Week {micro.week_number}</span>
                            {micro.week_type && (
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', getWeekTypeBadge(micro.week_type))}>
                                {micro.week_type}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{trainingDays} training days</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {isExpanded && mesoMicros.length === 0 && (
                  <div className="mt-1 ml-3 pl-3 border-l-2 border-border py-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Eye className="w-3 h-3" />
                      Weekly details will be available once earlier weeks are tracked.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* MICROCYCLES SUMMARY */}
      <section>
        <div className="flex items-center gap-2 mb-2 px-1">
          <Zap className="w-4 h-4 text-chart-4" />
          <h3 className="font-heading font-bold text-base">All 12 Weeks</h3>
          <Badge className="text-[10px] bg-muted text-muted-foreground border-0 ml-auto">{program.microcycles?.length} weeks detailed</Badge>
        </div>
        <p className="text-xs text-muted-foreground px-1 mb-3">
          Every week is pre-built. Head to <span className="text-foreground font-medium">Weekly Plan</span> to follow along and track live.
        </p>
        <div className="space-y-1.5">
          {program.microcycles?.slice().sort((a, b) => a.week_number - b.week_number).map((micro, i) => {
            const mesoName = program.mesocycles?.[micro.mesocycle_index]?.name;
            const trainingDays = micro.days?.filter(d => d.exercises?.length > 0).length || 0;
            const restDays = (micro.days?.length || 0) - trainingDays;
            const isDeload = micro.week_type?.toLowerCase().includes('deload') || micro.week_type?.toLowerCase().includes('taper');
            const isCurrentWeek = micro.week_number === (program.current_week || 1);
            return (
              <Card key={i} className={cn('p-3 transition-all', isCurrentWeek && 'border-primary/40 bg-primary/5')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isDeload
                      ? <TrendingDown className="w-3.5 h-3.5 text-muted-foreground" />
                      : <Zap className={cn('w-3.5 h-3.5', isCurrentWeek ? 'text-primary' : 'text-muted-foreground')} />
                    }
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className={cn('font-heading font-bold text-sm', isCurrentWeek && 'text-primary')}>Week {micro.week_number}</p>
                        {isCurrentWeek && <span className="text-[9px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">Current</span>}
                      </div>
                      {mesoName && <p className="text-[10px] text-muted-foreground">{mesoName}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-right">
                    {micro.week_type && (
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', getWeekTypeBadge(micro.week_type))}>
                        {micro.week_type}
                      </span>
                    )}
                    <span className="bg-primary/15 text-primary px-2 py-0.5 rounded-full text-[10px] font-medium">{trainingDays}d</span>
                    {restDays > 0 && <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded-full text-[10px]">{restDays}r</span>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}