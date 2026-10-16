import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Dumbbell,
  Bot,
  Video,
  Utensils,
  TrendingUp,
  ShieldCheck,
  Award,
  Sparkles,
  CheckCircle2,
  Brain,
  Zap,
} from 'lucide-react';

export default function About() {
  return (
    <div className="relative z-0 px-4 sm:px-6 pb-12 max-w-3xl mx-auto">
      {/* Top Navigation */}
      <div className="relative z-30 flex items-center justify-between gap-3 mb-8 pt-4 pointer-events-auto">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="Back to home"
            className="flex items-center justify-center w-10 h-10 -ml-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 active:bg-muted transition-colors pointer-events-auto touch-manipulation"
          >
            <ArrowLeft className="w-5 h-5 pointer-events-none" />
          </Link>

          <Link
            to="/"
            className="flex items-center gap-2.5 pointer-events-auto"
          >
            <img
              src="/washek-fitness-logo.jpg"
              alt="WASHEK"
              className="w-8 h-8 rounded-xl object-contain shadow-sm pointer-events-none"
            />
            <span className="font-heading font-bold text-base tracking-wide text-foreground">
              WASHEK
            </span>
          </Link>
        </div>
      </div>

      {/* Hero Section */}
      <div className="space-y-4 mb-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
          <Sparkles className="w-3.5 h-3.5" />
          <span>The Athletic Intelligence Platform</span>
        </div>

        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
          Intelligent training designed for real human performance.
        </h1>

        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          WASHEK is a comprehensive strength and conditioning platform that brings together personalized periodized programming, real-time AI coaching, computer-vision movement analysis, and precision nutrition into one seamless training ecosystem.
        </p>
      </div>

      {/* What is WASHEK? */}
      <section className="rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-sm space-y-4 mb-8">
        <h2 className="font-heading font-bold text-xl text-foreground flex items-center gap-2.5">
          <Brain className="w-5 h-5 text-primary" />
          What is WASHEK?
        </h2>
        <div className="space-y-3.5 text-muted-foreground text-sm sm:text-base leading-relaxed">
          <p>
            If you have never encountered WASHEK before, think of it as an elite personal coach, a sports nutritionist, and a biomechanics lab combined in your pocket. Most workout apps give you rigid, cookie-cutter spreadsheets that never adapt when you are fatigued, cannot see how you move, and offer no guidance when you hit a plateau.
          </p>
          <p>
            On the other end of the spectrum, hiring a dedicated strength coach and nutritionist can cost hundreds or thousands of dollars a month. WASHEK bridges that gap. It creates fully customized 12-week training programs tailored to your current strength, available equipment, and chosen style—then actively guides, tracks, and adapts your workouts as you progress.
          </p>
          <p>
            Whether your goal is mastering your very first push-up, building lean muscle in the gym, adding serious weight to your pull-ups and dips, or unlocking elite calisthenics skills like the planche and front lever, WASHEK meets you exactly where you are today.
          </p>
        </div>
      </section>

      {/* The 5 Core Pillars */}
      <div className="space-y-4 mb-10">
        <div className="space-y-1">
          <h2 className="font-heading font-bold text-2xl text-foreground">
            The Five Core Pillars
          </h2>
          <p className="text-sm text-muted-foreground">
            Every feature in WASHEK is built around real sports science and practical day-to-day utility.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 pt-2">
          {/* Pillar 1: Adaptive 12-Week Programs */}
          <div className="rounded-2xl border border-border bg-card/60 hover:bg-card p-5 sm:p-6 transition-colors space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <Dumbbell className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-semibold text-base sm:text-lg text-foreground">
                  1. Adaptive 12-Week Periodization
                </h3>
                <p className="text-xs text-muted-foreground">
                  Calisthenics • Weighted Calisthenics • Traditional Weights • Hybrid
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              No generic templates. WASHEK generates customized, multi-phase workout programs tailored to your specific training style and equipment. Every microcycle features calculated progressive overload, deliberate exercise pairings, tempo recommendations, and smart deload protocols so you continue gaining strength without burning out.
            </p>
          </div>

          {/* Pillar 2: Coach Kael */}
          <div className="rounded-2xl border border-border bg-card/60 hover:bg-card p-5 sm:p-6 transition-colors space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-semibold text-base sm:text-lg text-foreground">
                  2. Coach Kael — Your 24/7 Athletic Mentor
                </h3>
                <p className="text-xs text-muted-foreground">
                  Contextual Memory • Live Session Adjustments • Clear Guidance
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Kael is your intelligent AI coach. He remembers your conversation history, your current numbers, and your past workouts. Feeling fatigued or short on equipment during a session? Kael can adjust your remaining sets in real time. Have a question about form or recovery? Kael explains the exact cues in simple, intuitive terms anyone can grasp, without dense textbook jargon.
            </p>
          </div>

          {/* Pillar 3: Form Lab */}
          <div className="rounded-2xl border border-border bg-card/60 hover:bg-card p-5 sm:p-6 transition-colors space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <Video className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-semibold text-base sm:text-lg text-foreground">
                  3. Form Lab — Computer-Vision Analysis
                </h3>
                <p className="text-xs text-muted-foreground">
                  Rep Counting • Joint Angle Verification • Static Hold Timing
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Record or upload a video of any set directly inside the app. Form Lab analyzes your movement frame by frame: counting completed repetitions, measuring exact hold durations in seconds, evaluating spinal alignment and joint angles, and prescribing targeted corrective drills to keep you safe and bulletproof against injury.
            </p>
          </div>

          {/* Pillar 4: Nutrition & Macro Tracking */}
          <div className="rounded-2xl border border-border bg-card/60 hover:bg-card p-5 sm:p-6 transition-colors space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <Utensils className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-semibold text-base sm:text-lg text-foreground">
                  4. High-Precision Nutrition &amp; Macro Fueling
                </h3>
                <p className="text-xs text-muted-foreground">
                  Photo Food Scanning • Barcode Lookup • Dynamic Macro Targets
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Training is only half the battle; recovery and body composition depend on how you fuel your body. WASHEK features instant photo food recognition, barcode scanning, and dynamic daily macronutrient targets (calories, protein, carbohydrates, and fats) calculated directly from your body composition and physical goals.
            </p>
          </div>

          {/* Pillar 5: Baselines & Physique Analytics */}
          <div className="rounded-2xl border border-border bg-card/60 hover:bg-card p-5 sm:p-6 transition-colors space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-semibold text-base sm:text-lg text-foreground">
                  5. Strength Baselines &amp; Physique Tracking
                </h3>
                <p className="text-xs text-muted-foreground">
                  Private Progress Photos • Body Composition Trends • Milestones
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Benchmark your raw physical capabilities across key upper body, lower body, and core movements. Store encrypted, date-tagged progress photos alongside AI-assisted body fat estimates to celebrate tangible milestones and ensure your hard work translates into visible results.
            </p>
          </div>
        </div>
      </div>

      {/* Who is WASHEK For? */}
      <section className="rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-sm space-y-4 mb-8">
        <h2 className="font-heading font-bold text-xl text-foreground flex items-center gap-2.5">
          <Award className="w-5 h-5 text-primary" />
          Who WASHEK is Built For
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>
              <strong className="text-foreground">Fitness Beginners:</strong> Clear step-by-step guidance, no confusing jargon, and safe foundational exercises.
            </span>
          </div>
          <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>
              <strong className="text-foreground">Calisthenics Practitioners:</strong> Progressive skill ladders from basic pull-ups to levers, planches, and muscle-ups.
            </span>
          </div>
          <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>
              <strong className="text-foreground">Gym Lifters &amp; Bodybuilders:</strong> Hypertrophy-driven splits, mechanical drop sets, and progressive overload tracking.
            </span>
          </div>
          <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>
              <strong className="text-foreground">Hybrid Athletes:</strong> Blending relative bodyweight power with external barbell and dumbbell resistance.
            </span>
          </div>
        </div>
      </section>

      {/* The Origin Story */}
      <section className="rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-sm space-y-4 mb-8">
        <h2 className="font-heading font-bold text-xl text-foreground flex items-center gap-2.5">
          <Zap className="w-5 h-5 text-primary" />
          The Story Behind WASHEK
        </h2>
        <div className="space-y-3.5 text-muted-foreground text-sm sm:text-base leading-relaxed">
          <p>
            WASHEK was founded by Adrian Washek, a competitive calisthenics athlete who spent years navigating the trial, error, plateaus, and conflicting advice common to self-coached training.
          </p>
          <p>
            Real athletic progress doesn’t come from following a random workout influencer on social media or guessing what to do in the gym each day. It comes from structured progression, consistent technique reinforcement, smart recovery, and dialed-in nutrition.
          </p>
          <p>
            WASHEK was engineered to democratize elite athletic mentorship—giving anyone with the drive to improve access to intelligent, scientific, and truly adaptive coaching without the high cost of a private trainer.
          </p>
        </div>
      </section>

      {/* Privacy and Trust */}
      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2 text-primary font-semibold text-sm sm:text-base">
          <ShieldCheck className="w-5 h-5 shrink-0" />
          <span>Athlete-First Privacy &amp; Data Security</span>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          Your personal data belongs to you. Your workout logs, body composition metrics, and progress photos are stored with enterprise-grade encryption and are never sold or shared with third parties. You have complete control over your training records at all times.
        </p>
      </section>
    </div>
  );
}
