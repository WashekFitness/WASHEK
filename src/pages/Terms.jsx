import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ShieldAlert, FileText, CheckCircle2 } from 'lucide-react';

export default function Terms() {
  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
          <FileText className="w-3.5 h-3.5" />
          WASHEK Legal
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight font-heading">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: October 2026</p>
      </div>

      {/* Critical Medical Disclaimer Banner */}
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="pt-6 flex gap-4 items-start">
          <ShieldAlert className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="font-bold text-sm text-amber-500 uppercase tracking-wide">
              Important Health & Medical Disclaimer
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              WASHEK and Coach Kael provide intelligent fitness programming, calisthenics technique coaching, and nutritional estimation for athletic educational purposes only. They are not licensed medical providers and do not provide medical diagnosis, physical therapy, or healthcare treatment. Always consult a physician or qualified healthcare provider before beginning any strenuous workout regimen.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">1. Acceptance of Terms</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            By accessing or using the WASHEK application, you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use the platform.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">2. Subscription Plans & Billing</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3 leading-relaxed">
          <p>
            WASHEK offers tiered subscription access (Free, Progress, Performance, and Elite). Paid tiers are billed on a recurring monthly basis through our payment processor, Stripe.
          </p>
          <ul className="space-y-1.5 list-disc list-inside text-xs">
            <li><strong>Monthly Message Quotas:</strong> Reset on the 1st of each calendar month according to your timezone.</li>
            <li><strong>Cancellations:</strong> You can manage or cancel your subscription at any time in your athlete Profile. Access remains active through the end of your prepaid billing period.</li>
            <li><strong>Refunds:</strong> Subscription fees are non-refundable once the billing period has commenced, except where mandated by applicable consumer protection laws.</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">3. User Conduct & Media Uploads</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            When submitting workout videos for calisthenics form analysis or progress photos for body composition estimation, you represent that you hold all rights to the uploaded media and that the content contains no illegal, offensive, or infringing material.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">4. AI Coaching Limitation</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            Coach Kael utilizes state-of-the-art multimodal AI for biomechanical feedback and periodization calibration. While engineered for scientific precision, AI outputs are probabilistic guidance and should be verified with your personal physical capabilities. You assume full responsibility for your exercise selection, lifting loads, and physical safety.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
