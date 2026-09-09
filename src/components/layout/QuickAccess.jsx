import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Camera, Eye } from 'lucide-react';

export default function QuickAccess() {
  return (
    <div className="space-y-2">
      <h3 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider px-1">Quick Access</h3>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/photos">
          <Card className="p-4 h-full flex flex-col items-start gap-2 hover:border-primary/40 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Camera className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-heading font-bold text-sm">Progress Photos</p>
              <p className="text-xs text-muted-foreground">Track your transformation</p>
            </div>
          </Card>
        </Link>
        <Link to="/formlab">
          <Card className="p-4 h-full flex flex-col items-start gap-2 hover:border-chart-4/40 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-chart-4/15 flex items-center justify-center">
              <Eye className="w-5 h-5 text-chart-4" />
            </div>
            <div>
              <p className="font-heading font-bold text-sm">Form Lab</p>
              <p className="text-xs text-muted-foreground">AI form analysis</p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}