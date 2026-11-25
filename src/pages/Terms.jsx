import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ShieldAlert, FileText, ArrowLeft } from 'lucide-react';
import { BRAND_LOGO_SRC, handleBrandLogoError } from '@/lib/brandLogo';

export default function Terms() {
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
          <FileText className="w-3.5 h-3.5" />
          WASHEK Legal
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight font-heading">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: November 2026</p>
      </div>

      {/* Critical Medical Disclaimer Banner */}
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="pt-6 flex gap-4 items-start">
          <ShieldAlert className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <h2 className="font-bold text-sm text-amber-500 uppercase tracking-wide">
              Important Health &amp; Medical Disclaimer
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              WASHEK, Coach Kael, and Form Lab provide fitness programming, movement technique coaching, and nutritional estimations strictly for athletic and educational purposes. WASHEK is not a licensed medical provider, physician, dietitian, or physical therapist, and does not provide medical diagnosis, rehabilitation, or healthcare treatment. Always consult a qualified physician before beginning or modifying any strenuous exercise or nutrition plan, and stop training immediately if you experience sharp pain, dizziness, chest tightness, or shortness of breath.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">1. Acceptance of Terms &amp; Eligibility</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2.5 leading-relaxed">
          <p>
            By creating an account or accessing the WASHEK application, you agree to be bound by these Terms of Service and our{' '}
            <Link to="/privacy" className="text-primary underline hover:text-primary/80">
              Privacy Policy
            </Link>
            . If you do not agree to these terms, you must discontinue use of the platform.
          </p>
          <p className="text-xs">
            You represent that you meet the minimum legal age of consent in your jurisdiction (or have verified parent/guardian authorization) and are responsible for maintaining the confidentiality of your account credentials and all activity performed under your account.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">2. Subscription Plans, Trials, Quotas &amp; Billing</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3 leading-relaxed">
          <p>
            WASHEK offers tiered access across four plans: Free, Progress, Performance, and Elite. Paid subscriptions are billed on a recurring monthly basis through Stripe.
          </p>
          <ul className="space-y-1.5 list-disc list-inside text-xs">
            <li>
              <strong>Free Trial:</strong> Eligible first-time subscribers receive a 7-day free trial ($0 due at signup) on supported paid tiers, after which monthly recurring billing begins automatically unless cancelled before the trial ends. Trial eligibility is limited to one trial per athlete.
            </li>
            <li>
              <strong>Monthly Coach Kael Quotas:</strong> Monthly message allowances scale by tier (Free: 100, Progress: 300, Performance: 800, Elite: 2,000) and reset on the 1st of each calendar month based on your configured timezone.
            </li>
            <li>
              <strong>Cancellations &amp; Switching Plans:</strong> You may cancel anytime from your Athlete Profile. Cancelling stops all future recurring charges, ends paid tier access immediately, and returns your account to the Free baseline plan. To switch between paid tiers cleanly and avoid double billing, cancel your active plan before subscribing to a new tier.
            </li>
            <li>
              <strong>Refunds:</strong> Subscription fees already charged for a billing cycle that has commenced are non-refundable, except where required by applicable consumer protection laws.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">3. AI Coaching, Vision Analysis &amp; Nutrition Estimations</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2.5 leading-relaxed">
          <p>
            Coach Kael, live workout adjustments, Form Lab video reviews, progress photo insights, and food/barcode scanners rely on probabilistic AI and external nutritional data sources.
          </p>
          <ul className="space-y-1.5 list-disc list-inside text-xs">
            <li>
              <strong>Verification &amp; Physical Safety:</strong> AI coaching guidance and exercise loads are informational recommendations. You remain solely responsible for verifying exercise selection, lifting loads, spotting/equipment setup, and your physical readiness before every set.
            </li>
            <li>
              <strong>Body Composition &amp; Form Metrics:</strong> Visual body-fat estimates, physique insights, rep counts, and joint angle cues are software approximations and do not replace clinical DEXA scans or in-person biomechanical evaluation.
            </li>
            <li>
              <strong>Food Scans &amp; Allergens:</strong> Photo food recognition and barcode lookups provide estimated calories and macros. Always inspect physical packaging and ingredient labels directly for allergens, dietary restrictions, or medical nutrition requirements.
            </li>
            <li>
              <strong>Permission Before App Changes:</strong> Coach Kael asks for your permission before making changes such as logging food or marking a rest day unless you explicitly instruct it to act. You are responsible for reviewing and managing your logged entries.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">4. User Conduct &amp; Media Uploads</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2.5 leading-relaxed">
          <p>
            When uploading workout videos for Form Lab analysis, meal photos, or progress photos, you represent that you own or have all necessary rights to the media and that your content contains no illegal, abusive, explicit non-fitness, harassing, or infringing material.
          </p>
          <p className="text-xs">
            You agree not to misuse the platform, attempt to bypass subscription gates or usage limits, scrape content, automate unauthorized traffic, or reverse-engineer platform services.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">5. Intellectual Property &amp; Limitation of Liability</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2.5 leading-relaxed">
          <p>
            You retain ownership of the training logs, nutrition records, photos, and videos you submit. All WASHEK software, branding, interface designs, and periodization systems remain the property of WASHEK.
          </p>
          <p className="text-xs">
            To the fullest extent permitted by applicable law, the platform is provided on an &quot;as is&quot; and &quot;as available&quot; basis without warranties of specific athletic outcomes. WASHEK is not liable for indirect, incidental, or consequential damages, training injuries, or dietary reactions resulting from platform use. Features may be updated or modified over time to maintain safety and performance.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">6. Account Termination &amp; Contact</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            You may permanently delete your account at any time from Settings. We may suspend or terminate accounts that violate these Terms or engage in fraudulent billing or abusive conduct. For legal or support inquiries, reach out via the{' '}
            <Link to="/contact" className="text-primary underline hover:text-primary/80">
              Contact page
            </Link>{' '}
            or email <span className="text-primary font-mono text-xs">washekfitness@gmail.com</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

