import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ShieldCheck, Lock, EyeOff, ArrowLeft } from 'lucide-react';
import { BRAND_LOGO_SRC, handleBrandLogoError } from '@/lib/brandLogo';

export default function Privacy() {
  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="hidden sm:flex items-center gap-3 mb-2">
        <Link
          to="/"
          aria-label="Back to home"
          className="flex items-center justify-center w-10 h-10 -ml-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 active:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Link to="/" className="flex items-center gap-2.5">
          <img
            src={BRAND_LOGO_SRC}
            onError={handleBrandLogoError}
            alt="WASHEK"
            className="w-8 h-8 rounded-xl object-contain shadow-sm"
          />
          <span className="font-heading font-bold text-base tracking-wide text-foreground">
            WASHEK
          </span>
        </Link>
      </div>

      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
          <ShieldCheck className="w-3.5 h-3.5" />
          WASHEK Privacy
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight font-heading">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: November 2026</p>
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
            WASHEK collects only the information necessary to deliver personalized strength programming, AI coaching, nutrition tracking, and account security:
          </p>
          <ul className="space-y-1.5 list-disc list-inside text-xs">
            <li>
              <strong>Account &amp; Preferences:</strong> Name, email address, hashed authentication credentials, timezone (used for midnight resets and monthly message quotas), language, and preferred units (imperial or metric).
            </li>
            <li>
              <strong>Training Metrics:</strong> Training style, fitness goals, 12-week workout programs, completed workout logs, weights, rep counts, movement baselines, manual rest days, and post-workout check-ins.
            </li>
            <li>
              <strong>Nutrition &amp; Weight Logs:</strong> Logged meals, custom/saved meal presets, macro targets, scanned food images, barcode queries, and weight check-in history.
            </li>
            <li>
              <strong>Form Lab &amp; Progress Media:</strong> Workout video clips or extracted frames submitted to Form Lab and voluntary progress photos uploaded for physique tracking or body composition analysis.
            </li>
            <li>
              <strong>Coach Kael Conversations &amp; Support Inquiries:</strong> Your chat threads with Coach Kael and any messages submitted via the Contact form or email.
            </li>
            <li>
              <strong>Subscription Status Metadata:</strong> Plan tier, active/trialing/cancelled status, and trial eligibility synced from Stripe. WASHEK never receives or stores your raw payment card number or CVV.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <EyeOff className="w-5 h-5 text-primary" />
            2. How Your Data, Media &amp; AI Prompts Are Handled
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2.5 leading-relaxed">
          <p>
            We use your data strictly to personalize your workouts and calorie/macro targets, give Coach Kael accurate live context (only within your active subscription tier), analyze submitted Form Lab clips or progress photos, process subscriptions, and respond to support requests.
          </p>
          <p className="text-xs">
            When you message Coach Kael, scan food, or submit media to Form Lab or Progress Photos, requests are routed through encrypted server endpoints to enterprise AI inference providers (Google Gemini). Your private workout logs, training videos, chat messages, and progress photos are{' '}
            <strong>never sold, never published publicly, and never used to train public AI models</strong>.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">3. Trusted Service Providers</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            We share only the minimum data needed with essential infrastructure partners under confidentiality and security obligations:
          </p>
          <ul className="space-y-1.5 list-disc list-inside text-xs">
            <li><strong>Supabase:</strong> Encrypted authentication, cloud database storage, and private media storage buckets.</li>
            <li><strong>Stripe:</strong> Secure payment processing, 7-day trial handling, and subscription lifecycle billing.</li>
            <li><strong>AI Inference Providers:</strong> Encrypted server-side AI processing for Coach Kael, Form Lab, nutrition parsing, and adaptive programming.</li>
            <li><strong>Transactional Email Services:</strong> Password resets, account verification, and routing Contact form submissions to support.</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">4. Data Security &amp; Local Offline Caching</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2.5 leading-relaxed">
          <p>
            All cloud records are protected in transit via HTTPS/TLS and in our database using strict Row-Level Security (RLS) policies, ensuring only requests authenticated to your account ID can access or modify your private records and media.
          </p>
          <p className="text-xs">
            To keep WASHEK responsive and usable offline as a Progressive Web App (PWA), your active program, recent workout/nutrition logs, settings, and Coach Kael threads may be cached locally in your browser or device storage. Signing out or deleting your account clears local session state.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">5. Your Rights, Retention &amp; Account Deletion</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            You retain full ownership of your fitness and nutritional records and may update your profile details anytime inside the app. We retain your data only as long as your account remains active or as required to resolve billing/legal obligations.
          </p>
          <p className="text-xs">
            You may permanently delete your account and associated records (which also cancels any active Stripe subscription) at any time directly inside <strong>Settings → Delete Account</strong>, via the in-app{' '}
            <Link to="/contact" className="text-primary underline hover:text-primary/80">
              Contact form
            </Link>
            , or by emailing <span className="text-primary font-mono text-xs">washekfitness@gmail.com</span>. See also our{' '}
            <Link to="/terms" className="text-primary underline hover:text-primary/80">
              Terms of Service
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

