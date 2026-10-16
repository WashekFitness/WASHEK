import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ShieldCheck, Lock, EyeOff } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
          <ShieldCheck className="w-3.5 h-3.5" />
          WASHEK Privacy
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight font-heading">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: October 2026</p>
      </div>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            1. Information We Collect
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3 leading-relaxed">
          <p>
            WASHEK collects minimal information strictly necessary to provide your personalized athletic training and nutrition experience:
          </p>
          <ul className="space-y-1.5 list-disc list-inside text-xs">
            <li><strong>Account Profile:</strong> Name, email address, password hash, and timezone.</li>
            <li><strong>Training Metrics:</strong> Completed workouts, weight lifted, rep counts, and baseline movement capabilities.</li>
            <li><strong>Nutrition Logs:</strong> Logged meals, macro targets, and food scan images.</li>
            <li><strong>Form & Body Media:</strong> Video clips and photos submitted voluntarily for biomechanical form analysis or body composition tracking.</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <EyeOff className="w-5 h-5 text-primary" />
            2. How Your Media & AI Prompts Are Handled
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            When you chat with Coach Kael, scan a nutrition item, or submit video frames to Form Lab, your data is processed through secure, enterprise-grade AI models.
          </p>
          <p className="text-xs">
            Your private training videos and progress photos are <strong>never sold, never made public, and never used to train public models</strong> without explicit consent.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">3. Data Security & Storage</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            All user data is stored within encrypted cloud storage and databases utilizing strict Row-Level Security (RLS) policies. Only authenticated requests matching your account ID can access your private workout records and logs.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">4. Your Rights & Account Deletion</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            You retain ownership of your fitness and nutritional data. You may export or request complete deletion of your account and associated media at any time by contacting support at <span className="text-primary font-mono text-xs">washekfitness@gmail.com</span> or via the in-app Contact form.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
