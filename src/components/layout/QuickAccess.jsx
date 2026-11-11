import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Camera, Eye, Activity, ArrowUpRight } from 'lucide-react';

export default function QuickAccess() {
  return (
    <div className="space-y-2.5 pt-1">
      <h3 className="font-heading font-bold text-xs text-muted-foreground uppercase tracking-widest px-1">
        Performance Tools
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link to="/photos" className="group">
          <Card className="p-4 h-full flex flex-col justify-between gap-3 bg-gradient-to-br from-primary/[0.08] via-card to-card border border-primary/25 hover:border-primary/60 hover:shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 transition-all duration-300 rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-28 h-28 bg-primary/15 rounded-full blur-xl pointer-events-none -mr-6 -mt-6 group-hover:bg-primary/25 transition-all" />
            <div className="flex items-start justify-between w-full relative z-10">
              <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary group-hover:scale-110 group-hover:bg-primary/25 transition-all duration-300 shadow-[0_0_12px_rgba(37,99,235,0.25)]">
                <Camera className="w-5 h-5 text-primary" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>
            <div className="relative z-10">
              <p className="font-heading font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                Progress Photos
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Track visual change
              </p>
            </div>
          </Card>
        </Link>
        <Link to="/formlab" className="group">
          <Card className="p-4 h-full flex flex-col justify-between gap-3 bg-gradient-to-br from-chart-4/[0.08] via-card to-card border border-chart-4/25 hover:border-chart-4/60 hover:shadow-[0_0_30px_rgba(245,158,11,0.3)] hover:-translate-y-0.5 transition-all duration-300 rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-28 h-28 bg-chart-4/15 rounded-full blur-xl pointer-events-none -mr-6 -mt-6 group-hover:bg-chart-4/25 transition-all" />
            <div className="flex items-start justify-between w-full relative z-10">
              <div className="w-10 h-10 rounded-2xl bg-chart-4/15 border border-chart-4/30 flex items-center justify-center text-chart-4 group-hover:scale-110 group-hover:bg-chart-4/25 transition-all duration-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                <Eye className="w-5 h-5 text-chart-4" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-chart-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>
            <div className="relative z-10">
              <p className="font-heading font-bold text-sm text-foreground group-hover:text-chart-4 transition-colors">
                Form Lab
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                AI biomechanics
              </p>
            </div>
          </Card>
        </Link>
        <Link to="/muscle-heatmap" className="group">
          <Card className="p-4 h-full flex flex-col justify-between gap-3 bg-gradient-to-br from-emerald-500/[0.08] via-card to-card border border-emerald-500/25 hover:border-emerald-500/60 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 transition-all duration-300 rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/15 rounded-full blur-xl pointer-events-none -mr-6 -mt-6 group-hover:bg-emerald-500/25 transition-all" />
            <div className="flex items-start justify-between w-full relative z-10">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 group-hover:bg-emerald-500/25 transition-all duration-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]">
                <Activity className="w-5 h-5 text-emerald-500" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-emerald-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>
            <div className="relative z-10">
              <p className="font-heading font-bold text-sm text-foreground group-hover:text-emerald-500 transition-colors">
                Muscle Heatmap
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Volume & fatigue
              </p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}