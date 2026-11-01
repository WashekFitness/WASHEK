import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const app = express();
// Parse CLI flags and environment variables for port and host
const args = process.argv.slice(2);
function parseArg(flag: string): string | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1] && !args[i + 1].startsWith('-')) {
      return args[i + 1];
    }
    if (args[i].startsWith(flag + '=')) {
      return args[i].slice(flag.length + 1);
    }
  }
  return null;
}

const cliPort = parseArg('--port') || parseArg('-p');
const cliHost = parseArg('--host') || parseArg('-h');
const PORT = parseInt(cliPort || process.env.PORT || '3000', 10);
const HOST = cliHost || process.env.HOST || '0.0.0.0';

// Body parsers with generous limits for media & base64 frames
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Supabase configuration for backend authorization and quota enforcement
const SUPABASE_URL =
  process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('YOUR_PROJECT_REF')
    ? process.env.SUPABASE_URL
    : process.env.VITE_SUPABASE_URL && !process.env.VITE_SUPABASE_URL.includes('YOUR_PROJECT_REF')
      ? process.env.VITE_SUPABASE_URL
      : 'https://edvvwnaxmjuvwnxineph.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_ANON_KEY.includes('YOUR_')
    ? process.env.SUPABASE_ANON_KEY
    : process.env.VITE_SUPABASE_ANON_KEY && !process.env.VITE_SUPABASE_ANON_KEY.includes('YOUR_')
      ? process.env.VITE_SUPABASE_ANON_KEY
      : 'sb_publishable_hR5RWMT6qfPKbONf3G783A_Log5r61I';

// Supabase client instance for storage & server-side operations
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Lazy initialization of the Google Gemini AI client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    aiClient = new GoogleGenAI({
      apiKey: apiKey || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// ------------------------------------------------------------
// API ROUTES & REDIRECTS
// ------------------------------------------------------------

// ------------------------------------------------------------
// CHECKOUT & SUBSCRIPTION APIS
// ------------------------------------------------------------

app.post('/api/checkout/process', async (req, res) => {
  try {
    const { userId, email, plan, paymentMethod, sessionId, status } = req.body || {};
    const validPlans = ['progress', 'performance', 'elite'];
    const cleanPlan = String(plan || '').toLowerCase().trim();

    if (!validPlans.includes(cleanPlan)) {
      return res.status(400).json({ success: false, error: 'Invalid subscription plan.' });
    }

    const cleanStatus = status === 'active' ? 'active' : 'trialing';

    console.log('[API] Processing checkout for:', { userId, email, plan: cleanPlan, status: cleanStatus, paymentMethod });

    // Update Supabase profiles table
    if (userId || email) {
      try {
        let query = supabase.from('profiles').update({
          subscription_plan: cleanPlan,
          subscription_status: cleanStatus,
          subscription_tier: cleanPlan,
          stripe_price_id: cleanPlan === 'progress' ? 'price_1TTYrbRuQpZftYKRoSyLbQ0c' : cleanPlan === 'performance' ? 'price_1TTYs8RuQpZftYKR8ZzpNg7x' : 'price_1TTYsWRuQpZftYKRKIm8V10E',
          stripe_subscription_id: sessionId || `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          subscription_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (userId) {
          query = query.eq('id', userId);
        } else if (email) {
          query = query.eq('email', email);
        }
        const { error: dbError } = await query;
        if (dbError) {
          console.debug('[API] checkout profile update note:', dbError.message);
        }
      } catch (dbErr: any) {
        console.debug('[API] checkout db error note:', dbErr?.message);
      }
    }

    res.json({
      success: true,
      message: `Successfully activated ${cleanPlan.charAt(0).toUpperCase() + cleanPlan.slice(1)} plan!`,
      plan: cleanPlan,
      status: cleanStatus,
    });
  } catch (err: any) {
    console.error('[API] checkout error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to process payment' });
  }
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { plan } = req.body || {};
    const validPlans: Record<string, string> = {
      progress: 'https://buy.stripe.com/test_9B67sNcsOaiW1ETgLtg3603',
      performance: 'https://buy.stripe.com/test_8x23cx50m9eS97l52Lg3605',
      elite: 'https://buy.stripe.com/test_28E3cxboK2Qu3N1cvdg3604',
    };

    const cleanPlan = String(plan || '').toLowerCase().trim();
    const fallbackUrl = validPlans[cleanPlan];

    if (!fallbackUrl) {
      return res.status(400).json({ success: false, error: 'Invalid plan' });
    }

    res.json({
      success: true,
      action: 'checkout',
      url: fallbackUrl,
      plan: cleanPlan,
    });
  } catch (err: any) {
    console.error('[API] create-checkout-session error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to create checkout' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    backend: 'Google Gemini',
    model: 'gemini-3.5-flash-lite',
    hasKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

app.post('/api/cancel-subscription', async (req, res) => {
  try {
    const { userId, email } = req.body || {};
    console.log('[API] Processing cancel-subscription for:', { userId, email });

    if (userId || email) {
      try {
        let query = supabase.from('profiles').update({
          subscription_plan: 'free',
          subscription_status: 'canceled',
          stripe_subscription_id: null,
          stripe_price_id: null,
          subscription_cancelled_at: new Date().toISOString(),
          subscription_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (userId) {
          query = query.eq('id', userId);
        } else if (email) {
          query = query.eq('email', email);
        }
        await query;
      } catch (dbErr) {
        console.debug('[API] cancel profile update note:', dbErr);
      }
    }

    res.json({
      success: true,
      message: 'Subscription canceled. Account is now on Free Plan.',
      plan: 'free',
      status: 'canceled',
    });
  } catch (err: any) {
    console.error('[API] cancel-subscription error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to cancel subscription' });
  }
});

const SYSTEM_INSTRUCTIONS: Record<string, string> = {
  kael: 'You are Coach Kael, an elite strength & conditioning coach and fitness mentor for WASHEK. You are direct, scientifically grounded, encouraging, and focused on progressive overload, proper form, recovery, and nutrition. Always communicate in simple, everyday language that any beginner can easily understand, without confusing textbook jargon. Use intuitive real-world analogies when helpful to make concepts click, but never talk down to the athlete or sound like you are explaining things to a baby. Maintain a mature, supportive, and practical coaching presence.',
  structure: 'You are an elite strength & conditioning program architect for WASHEK. Design workout structures and weekly splits tailored to the athlete goals with proactive fatigue management and maximum safe progression velocity. Balance push/pull volume, prioritize high-CNS demands when fresh, and eliminate junk volume. STRICT OUTPUT MANDATE: Return raw JSON ONLY that strictly adheres to the requested schema. Never output conversational intros, explanations, greetings, or markdown code fences.',
  microcycle: 'You are an elite strength & conditioning program architect for WASHEK. Build comprehensive, progressive workout programming for the microcycle with days, exercise sequences, sets, reps, rest intervals, notes, and activation cues. GOAL ACCELERATION & SYSTEMIC FATIGUE MANAGEMENT MANDATE: Program workouts to drive the athlete toward their specific goals as fast as safely possible while actively managing systemic, CNS, and joint fatigue. 1) High Stimulus-to-Fatigue Ratio (SFR): Select high-yield exercises, strictly eliminating junk volume. 2) 1-2 RIR on primary compounds to maximize neuromuscular adaptation without exhausting the CNS. 3) Order high-skill or heavy compound movements first when the athlete is fresh. 4) Prescribe adequate rest periods (90-180s on primary lifts, 60-90s on accessories) for full ATP replenishment. 5) Maintain strict push/pull and joint balance. STRICT OUTPUT MANDATE: Return a single valid JSON object with the "microcycle" key adhering to the requested schema. No markdown code fences, greetings, or preambles.',
  form_analysis: 'You are an elite calisthenics biomechanist and uncompromising judge for WASHEK Form Lab. Analyze the user exercise execution across the provided video frames. ABSOLUTE HONESTY & REAL SCORE MANDATE (NO SUGARCOATING — SCORES RANGE FROM 1% TO 100%): You are an objective, clinical judge. Stop sugarcoating form. If form is bad, sloppy, or dangerous, TELL LITERALLY EVERYTHING WRONG WITH THE FORM. Bad or dangerous form is dangerous and must NEVER be inflated, praised, or excused to protect the athlete ego. Look at every joint and anatomical segment: cervical spine/neck hyperextension, scapular winging/elevation into ears, flared elbows (>60° creating shoulder impingement), lumbar spine sagging/hyperextension ("banana back"), lack of posterior pelvic tilt, knee collapse, hip sagging/piking, cutting range of motion, kipping, swinging, worming up, or asymmetrical drive. SCORE BRACKETS (1%–100%): 1%–20% for dangerous or hazardous execution with extreme injury risk (e.g., collapsing spine under load, severe joint shearing, uncontrolled falling/dropping); 20%–44% for poor, broken, or terrible form (severe lumbar hyperextension/sagging, worming push-ups, heavy swinging/kipping, cutting over half the range of motion, severe asymmetry, collapsed core tension); 45%–69% for sub-par or flawed execution with noticeable breakdown (cutting 20–30% ROM, flared elbows, uncontrolled cadence, soft lockout); 70%–84% for acceptable or moderate execution with clear technical flaws to fix; 85%–94% for high-level execution with 1 minor technical refinement; 95%–100% for rare, flawless, gymnastics-grade textbook execution with full range of motion and locked body tension. Deductions: Minor tip (-5 to -8 pts), Moderate flaw (-15 to -20 pts), Major breakdown (-30 to -45 pts), Critical safety hazard (-50 to -80 pts). MANDATORY ISSUES LIST: If there is ANY breakdown or flaw, you MUST populate the "issues" array with every single flaw, exact problem, severity ("minor", "moderate", "major", "critical"), and fix. Never leave "issues" empty if the form has mistakes! CRITICAL REP & HOLD COUNTER MANDATE (NEVER DROP REPS): Count EVERY attempted repetition across the video frames from start to finish. If a repetition has partial depth, soft lockout, slight momentum, or fatigued form, THAT REPETITION STILL COUNTS AS A REP! Imperfect form reduces the form score; it NEVER subtracts from the rep count. Set "rep_count" to the exact integer total of all repetitions performed; set "hold_time_seconds": null. For static holds (planche, levers, L-sit, handstand, dead hang, etc.): set "rep_count": null; measure the full actual hold duration in seconds ("hold_time_seconds": number). STRICT OUTPUT MANDATE: Return raw JSON ONLY matching the requested structure without markdown code blocks.',
  food_scan: 'You are a sports nutritionist and dietitian for WASHEK. Analyze the food photo or ingredients. Identify the foods, estimate portion sizes, and calculate accurate macronutrients (calories, protein, carbohydrates, fat). STRICT OUTPUT MANDATE: Return raw JSON ONLY. No markdown, preambles, or conversational greetings.',
  food_barcode: 'You are a sports nutritionist for WASHEK. Identify the product from the barcode information and estimate accurate nutritional values and serving sizes. STRICT OUTPUT MANDATE: Return raw JSON ONLY. No markdown, preambles, or conversational greetings.',
  progress_photo: 'You are a physique assessment specialist for WASHEK. Objectively assess the progress photo for body composition, estimated body fat percentage range, visible muscle definition, posture, and symmetry. STRICT OUTPUT MANDATE: Return raw JSON ONLY. No markdown, preambles, or conversational greetings.',
  weekly_update: 'You are Coach Kael conducting a comprehensive weekly athlete check-in for WASHEK. Review the athlete training, nutrition, sleep, and compliance data. Highlight key wins, areas to improve, and provide tailored, actionable advice for the next training week. STRICT OUTPUT MANDATE: Return raw JSON ONLY matching the schema. No markdown code fences or preambles.',
  live_workout: 'You are Coach Kael providing real-time coaching, motivation, and quick technique reminders during an active workout session.',
  live_workout_adjustment: 'You are Coach Kael adjusting a live workout due to fatigue, equipment limitations, or pain. Provide safe, effective exercise alternatives or volume modifications. STRICT OUTPUT MANDATE: Return raw JSON ONLY adhering strictly to the schema. No markdown code fences or preambles.',
};

const JSON_TYPES = new Set([
  'microcycle',
  'structure',
  'form_analysis',
  'food_scan',
  'food_barcode',
  'progress_photo',
  'weekly_update',
  'live_workout_adjustment',
]);

app.post('/api/ai-generate', async (req, res) => {
  try {
    const {
      prompt,
      type = 'general',
      file_urls = [],
      schema = null,
      response_json_schema = null,
      plan = 'free',
    } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'A prompt string is required.',
      });
    }

    const ai = getGeminiClient();

    // Prepare multimodal parts with parallel, fast media fetching
    const parts: any[] = [];

    if (Array.isArray(file_urls) && file_urls.length > 0) {
      const mediaParts = await Promise.all(
        file_urls.map(async (item) => {
          const raw = String(item || '').trim();
          if (!raw) return null;

          let urlToFetch = raw;
          if (!urlToFetch.startsWith('data:') && !urlToFetch.startsWith('http://') && !urlToFetch.startsWith('https://')) {
            try {
              const bucket = process.env.SUPABASE_MEDIA_BUCKET || process.env.VITE_SUPABASE_MEDIA_BUCKET || 'washek-media';
              const { data: signedData } = await supabase.storage.from(bucket).createSignedUrl(urlToFetch, 3600);
              if (signedData?.signedUrl) {
                urlToFetch = signedData.signedUrl;
              }
            } catch (storageErr) {
              console.warn('[Gemini] Could not create signed URL for path:', urlToFetch, storageErr);
            }
          }

          if (urlToFetch.startsWith('data:')) {
            const match = urlToFetch.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              return {
                inlineData: {
                  mimeType: match[1],
                  data: match[2],
                },
              };
            }
          } else if (urlToFetch.startsWith('http://') || urlToFetch.startsWith('https://')) {
            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 4000);
              const mediaRes = await fetch(urlToFetch, { signal: controller.signal });
              clearTimeout(timer);
              if (mediaRes.ok) {
                const arrayBuffer = await mediaRes.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const mimeType = mediaRes.headers.get('content-type') || 'image/jpeg';
                return {
                  inlineData: {
                    mimeType,
                    data: base64,
                  },
                };
              }
            } catch (fetchErr) {
              console.warn('[Gemini] Media fetch error for URL:', urlToFetch, fetchErr);
            }
          }
          return null;
        })
      );

      for (const m of mediaParts) {
        if (m) parts.push(m);
      }
    }

    // Append text prompt
    parts.push({ text: prompt });

    // Strictly identify Coach Kael direct chat messages
    const isKael = type === 'kael';

    let kaelQuota: any = null;
    let kaelUserSession: {
      client: any;
      id: string;
      effectiveTz: string;
      usageLimit: number;
      resolvedPlan: string;
      currentMonthKey: string;
      currentUsage: {
        used: number;
        limit: number;
        remaining: number;
        monthKey: string;
        plan: string;
      };
    } | null = null;
    let effectivePlan = String(plan || 'free').toLowerCase();

    // Server-side Kael monthly message limit enforcement for authenticated users
    if (isKael) {
      const authHeader = req.headers.authorization;
      const clientTimezone = (req.headers['x-timezone'] as string) || (req.body?.timezone as string) || '';

      const getTimezoneMonthKey = (tz?: string): string => {
        if (!tz) return new Date().toISOString().slice(0, 7);
        try {
          return new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
          }).format(new Date()).slice(0, 7);
        } catch {
          return new Date().toISOString().slice(0, 7);
        }
      };

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        try {
          const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          });

          // Verify authentic session with Supabase using token
          const { data: userData, error: userError } = await supabaseUser.auth.getUser(token);
          if (!userError && userData?.user) {
            const userId = userData.user.id;

            // Authoritatively resolve user's profile and subscription plan
            const { data: profileRow } = await supabaseUser
              .from('profiles')
              .select('subscription_plan, subscription_status, subscription_grace_until, kael_msg_count, kael_msg_month, timezone')
              .eq('id', userId)
              .maybeSingle();

            const effectiveTz = clientTimezone || profileRow?.timezone || 'UTC';
            const currentMonthKey = getTimezoneMonthKey(effectiveTz);

            const PLAN_LIMITS: Record<string, number> = {
              free: 100,
              progress: 300,
              performance: 800,
              elite: 2000,
            };

            const rawPlan = String(profileRow?.subscription_plan || effectivePlan || 'free').toLowerCase();
            const resolvedPlan = PLAN_LIMITS[rawPlan] ? rawPlan : 'free';
            effectivePlan = resolvedPlan;
            const usageLimit = PLAN_LIMITS[resolvedPlan] || 100;

            // Check current usage BEFORE generating response via get_kael_usage RPC
            let currentUsage: { used: number; limit: number; remaining: number; monthKey: string; plan: string } | null = null;
            try {
              let { data: rpcUsage, error: rpcErr } = await supabaseUser.rpc('get_kael_usage');
              if (rpcErr && rpcErr.code === 'PGRST202') {
                const fallbackRes = await supabaseUser.rpc('get_kael_usage', {
                  p_timezone: effectiveTz,
                });
                if (!fallbackRes.error) {
                  rpcUsage = fallbackRes.data;
                  rpcErr = null;
                }
              }
              if (!rpcErr && rpcUsage && typeof rpcUsage.used === 'number') {
                currentUsage = {
                  used: rpcUsage.used,
                  limit: rpcUsage.limit || usageLimit,
                  remaining:
                    typeof rpcUsage.remaining === 'number'
                      ? rpcUsage.remaining
                      : Math.max(0, (rpcUsage.limit || usageLimit) - rpcUsage.used),
                  monthKey: rpcUsage.monthKey || currentMonthKey,
                  plan: rpcUsage.plan || resolvedPlan,
                };
              }
            } catch (err) {
              console.warn('[server.ts] get_kael_usage error:', err);
            }

            // Profile table fallback calculation
            if (!currentUsage) {
              const isCurrentMonth = profileRow?.kael_msg_month === currentMonthKey;
              const count = isCurrentMonth ? Number(profileRow?.kael_msg_count || 0) : 0;
              currentUsage = {
                used: count,
                limit: usageLimit,
                remaining: Math.max(0, usageLimit - count),
                monthKey: currentMonthKey,
                plan: resolvedPlan,
              };
            }

            // STRICT BACKEND ENFORCEMENT: If limit reached (0 remaining), reject immediately without calling Gemini
            if (currentUsage.remaining <= 0 || currentUsage.used >= currentUsage.limit) {
              return res.status(429).json({
                success: false,
                error: 'You have reached your monthly message limit for Coach Kael.',
                error_code: 'KAEL_LIMIT_REACHED',
                quota: {
                  allowed: false,
                  used: currentUsage.used,
                  limit: currentUsage.limit,
                  remaining: 0,
                  monthKey: currentUsage.monthKey,
                  plan: currentUsage.plan,
                  timezone: effectiveTz,
                },
                type: 'kael',
              });
            }

            // Store verified user context for atomic deduction once Kael actually answers
            kaelUserSession = {
              client: supabaseUser,
              id: userId,
              effectiveTz,
              usageLimit,
              resolvedPlan,
              currentMonthKey,
              currentUsage,
            };
          }
        } catch (authErr) {
          console.warn('[server.ts] Auth verification note, using free baseline:', authErr);
        }
      }

      // Fallback session handling when token is absent or invalid (e.g. preview mode or local user)
      if (!kaelUserSession) {
        const fallbackUserId = req.body?.user_id || null;
        const effectiveTz = clientTimezone || 'UTC';
        const currentMonthKey = getTimezoneMonthKey(effectiveTz);
        const PLAN_LIMITS: Record<string, number> = {
          free: 100,
          progress: 300,
          performance: 800,
          elite: 2000,
        };

        let profileRow: any = null;
        if (fallbackUserId) {
          try {
            const { data } = await supabase
              .from('profiles')
              .select('subscription_plan, subscription_status, subscription_grace_until, kael_msg_count, kael_msg_month, timezone')
              .eq('id', fallbackUserId)
              .maybeSingle();
            profileRow = data;
          } catch (profileErr) {
            console.warn('[server.ts] Fallback profile lookup note:', profileErr);
          }
        }

        const rawPlan = String(profileRow?.subscription_plan || req.body?.plan || effectivePlan || 'free').toLowerCase();
        const resolvedPlan = PLAN_LIMITS[rawPlan] ? rawPlan : 'free';
        effectivePlan = resolvedPlan;
        const usageLimit = PLAN_LIMITS[resolvedPlan] || 100;

        const isCurrentMonth = profileRow?.kael_msg_month === currentMonthKey;
        const clientUsed = typeof req.body?.current_used === 'number' ? req.body.current_used : 0;
        const count = isCurrentMonth ? Number(profileRow?.kael_msg_count ?? clientUsed) : clientUsed;

        const currentUsage = {
          used: count,
          limit: usageLimit,
          remaining: Math.max(0, usageLimit - count),
          monthKey: currentMonthKey,
          plan: resolvedPlan,
        };

        if (currentUsage.remaining <= 0 || currentUsage.used >= currentUsage.limit) {
          return res.status(429).json({
            success: false,
            error: 'You have reached your monthly message limit for Coach Kael.',
            error_code: 'KAEL_LIMIT_REACHED',
            quota: {
              allowed: false,
              used: currentUsage.used,
              limit: currentUsage.limit,
              remaining: 0,
              monthKey: currentUsage.monthKey,
              plan: currentUsage.plan,
              timezone: effectiveTz,
            },
            type: 'kael',
          });
        }

        kaelUserSession = {
          client: supabase,
          id: fallbackUserId || 'guest',
          effectiveTz,
          usageLimit,
          resolvedPlan,
          currentMonthKey,
          currentUsage,
        };
      }
    }

    const isJsonExpected =
      JSON_TYPES.has(type) ||
      Boolean(schema) ||
      Boolean(response_json_schema);

    // Using Google Gemini high-speed models
    const config: Record<string, unknown> = {};

    if (isJsonExpected) {
      config.responseMimeType = 'application/json';
      if (response_json_schema || schema) {
        config.responseSchema = response_json_schema || schema;
      }
    }

    // For form_analysis, enable thorough reasoning so Gemini inspects joint angles and spinal alignment across all frames
    config.thinkingConfig = {
      thinkingLevel: type === 'form_analysis' ? ThinkingLevel.HIGH : ThinkingLevel.LOW,
    };

    // Tune generation parameters and system instructions based on server-verified plan tier
    if (type === 'kael') {
      const kaelBaseMandate =
        'You are Coach Kael, an elite strength & conditioning coach and fitness mentor for WASHEK. ' +
        'CORE SCIENTIFIC ACCURACY MANDATE (ALL PLANS): You are ALWAYS 100% scientifically accurate, biomechanically sound, and physiologically grounded across every plan tier. Safety, anatomical precision, and evidence-based truth NEVER change on any plan. ' +
        'COMMUNICATION CLARITY & ACCESSIBLE LANGUAGE (CRITICAL): Respond in simple, clear, everyday language that any beginner can easily understand, without dense medical or kinesiology jargon. When explaining how the body moves, translate complex biomechanics into intuitive practical terms (e.g., explain scapular depression as pulling shoulder blades down and away from the ears; explain eccentric control as lowering yourself slowly; explain CNS fatigue as deep whole-body burnout). Use an intuitive real-world analogy whenever it helps make the concept or physical sensation click. Never talk down to the user or sound like you are explaining things to a toddler or baby — find that golden balance of mature, respectful, seasoned coaching with zero confusing jargon. Never make responses shorter than the tier guideline or alter the programming. ';

      if (effectivePlan === 'elite') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: ELITE. Deliver lightning-fast, masterclass coaching depth (~180–350+ words). Break down how muscles and joints work together in clear, vivid terms with intuitive cues or analogies. Always include at least one insider coaching nuance labeled "🔐 Elite tip:" or "⚡ Secret:", and provide deep "🛡️ Elite recovery:" or "🔋 Recovery call:" deload diagnostics when fatigue or rest is relevant, explained in plain language.';
        config.temperature = 0.25;
        config.maxOutputTokens = 3500;
      } else if (effectivePlan === 'performance') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: PERFORMANCE. Deliver high-speed, advanced coaching intelligence (~130–220 words). Break down movement tempo (concentric/eccentric cadence explained simply as lowering, pausing, and pushing), muscle activation cues, exercise synergy, and fueling/recovery timing in straightforward terms.';
        config.temperature = 0.3;
        config.maxOutputTokens = 2500;
      } else if (effectivePlan === 'progress') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: PROGRESS. Deliver faster and smarter coaching answers (~80–140 words). In addition to 100% accurate guidance, explain the practical "why" behind the movement in simple terms, using relatable analogies when helpful, and outline clear actionable progression steps.';
        config.temperature = 0.35;
        config.maxOutputTokens = 1800;
      } else {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: FREE. Deliver 100% scientifically accurate, direct, and concise coaching answers (~40–80 words). Provide the exact recommendation and key execution cue in plain, everyday language without confusing jargon, fluff, or filler.';
        config.temperature = 0.4;
        config.maxOutputTokens = 900;
      }
    } else {
      const systemInstruction = SYSTEM_INSTRUCTIONS[type];
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
    }

    // High visual intelligence model gemini-3.8-flash is prioritized for form_analysis
    const modelsToTry = type === 'form_analysis'
      ? ['gemini-3.8-flash', 'gemini-3.1-flash-lite']
      : ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
    let lastError: any = null;
    let response: any = null;
    let successfulModel = modelsToTry[0];

    for (const currentModel of modelsToTry) {
      try {
        console.log(`[Gemini API] Trying model "${currentModel}" for type="${type}"`);
        const controller = new AbortController();
        const timeoutMs = (type === 'form_analysis') ? 25000 : (isJsonExpected || (Array.isArray(file_urls) && file_urls.length > 0)) ? 15000 : 8000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const callConfig = {
          ...config,
          abortSignal: controller.signal,
        };

        response = await ai.models.generateContent({
          model: currentModel,
          contents: parts,
          config: callConfig,
        });
        clearTimeout(timer);
        successfulModel = currentModel;
        break;
      } catch (modelErr: any) {
        lastError = modelErr;
        console.warn(`[Gemini API] Model "${currentModel}" failed:`, modelErr?.message || modelErr);
        // Continue to fallback model immediately
      }
    }

    if (!response) {
      throw lastError || new Error('All Gemini models failed to respond.');
    }

    const outputText = (response.text || '').trim();
    if (!outputText) {
      throw new Error('Coach Kael generated an empty response.');
    }

    // Now that Kael has actually answered, atomically claim and decrement the message quota
    if (isKael && kaelUserSession) {
      const {
        client,
        id: userId,
        effectiveTz,
        usageLimit,
        resolvedPlan,
        currentMonthKey,
        currentUsage,
      } = kaelUserSession;

      let claimResult: any = null;
      try {
        let { data: claimData, error: claimError } = await client.rpc('claim_kael_message');
        if (claimError && claimError.code === 'PGRST202') {
          const fallbackClaim = await client.rpc('claim_kael_message', {
            p_timezone: effectiveTz,
          });
          if (!fallbackClaim.error) {
            claimData = fallbackClaim.data;
            claimError = null;
          }
        }
        if (!claimError && claimData && typeof claimData.used === 'number') {
          claimResult = claimData;
        }
      } catch (err) {
        console.warn('[server.ts] claim_kael_message RPC error:', err);
      }

      if (!claimResult) {
        // Direct database update fallback to profiles table
        const newCount = currentUsage.used + 1;
        const updatePayload: Record<string, any> = {
          kael_msg_count: newCount,
          kael_msg_month: currentMonthKey,
        };
        if (effectiveTz) {
          updatePayload.timezone = effectiveTz;
        }
        if (userId && userId !== 'guest') {
          try {
            await client
              .from('profiles')
              .update(updatePayload)
              .eq('id', userId);
          } catch (dbErr) {
            console.warn('[server.ts] Profile update fallback note:', dbErr);
          }
        }

        claimResult = {
          allowed: true,
          used: newCount,
          limit: usageLimit,
          remaining: Math.max(0, usageLimit - newCount),
          monthKey: currentMonthKey,
          plan: resolvedPlan,
          timezone: effectiveTz,
        };
      } else {
        claimResult = {
          ...claimResult,
          remaining:
            typeof claimResult.remaining === 'number'
              ? claimResult.remaining
              : Math.max(0, (claimResult.limit || usageLimit) - (claimResult.used || 0)),
          timezone: effectiveTz,
        };
      }

      kaelQuota = claimResult;
    }

    if (!kaelQuota && isKael) {
      const clientUsed = typeof req.body?.current_used === 'number' ? req.body.current_used : 0;
      const newCount = clientUsed + 1;
      const PLAN_LIMITS: Record<string, number> = {
        free: 100,
        progress: 300,
        performance: 800,
        elite: 2000,
      };
      const resolvedPlan = PLAN_LIMITS[effectivePlan] ? effectivePlan : 'free';
      const usageLimit = PLAN_LIMITS[resolvedPlan] || 100;
      const clientTz = (req.headers['x-timezone'] as string) || (req.body?.timezone as string) || 'UTC';
      let monthKey = new Date().toISOString().slice(0, 7);
      try {
        monthKey = new Intl.DateTimeFormat('en-CA', {
          timeZone: clientTz,
          year: 'numeric',
          month: '2-digit',
        }).format(new Date()).slice(0, 7);
      } catch {}

      kaelQuota = {
        allowed: true,
        used: newCount,
        limit: usageLimit,
        remaining: Math.max(0, usageLimit - newCount),
        monthKey,
        plan: resolvedPlan,
        timezone: clientTz,
      };
    }

    let result: any = outputText;
    if (isJsonExpected) {
      try {
        const stripped = outputText
          .replace(/^\uFEFF/, '')
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        result = JSON.parse(stripped);
      } catch (parseErr) {
        console.warn('[Gemini API] JSON parse error, returning raw text:', parseErr);
        result = outputText;
      }
    }

    return res.json({
      success: true,
      result,
      quota: kaelQuota,
      type,
      model: successfulModel,
      provider: 'Google Gemini',
    });
  } catch (error: any) {
    console.error('[Gemini API Error]', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Google Gemini AI generation failed.',
      provider: 'Google Gemini',
      model: 'gemini-3.5-flash-lite',
    });
  }
});

app.post('/api/ai-stream', async (req, res) => {
  try {
    const {
      prompt,
      type = 'general',
      file_urls = [],
      schema = null,
      response_json_schema = null,
      plan = 'free',
    } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'A prompt string is required.',
      });
    }

    const ai = getGeminiClient();

    // Prepare multimodal parts with parallel, fast media fetching
    const parts: any[] = [];

    if (Array.isArray(file_urls) && file_urls.length > 0) {
      const mediaParts = await Promise.all(
        file_urls.map(async (item) => {
          const raw = String(item || '').trim();
          if (!raw) return null;

          let urlToFetch = raw;
          if (!urlToFetch.startsWith('data:') && !urlToFetch.startsWith('http://') && !urlToFetch.startsWith('https://')) {
            try {
              const bucket = process.env.SUPABASE_MEDIA_BUCKET || process.env.VITE_SUPABASE_MEDIA_BUCKET || 'washek-media';
              const { data: signedData } = await supabase.storage.from(bucket).createSignedUrl(urlToFetch, 3600);
              if (signedData?.signedUrl) {
                urlToFetch = signedData.signedUrl;
              }
            } catch (storageErr) {
              console.warn('[Gemini Stream] Could not create signed URL for path:', urlToFetch, storageErr);
            }
          }

          if (urlToFetch.startsWith('data:')) {
            const match = urlToFetch.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              return {
                inlineData: {
                  mimeType: match[1],
                  data: match[2],
                },
              };
            }
          } else if (urlToFetch.startsWith('http://') || urlToFetch.startsWith('https://')) {
            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 4000);
              const mediaRes = await fetch(urlToFetch, { signal: controller.signal });
              clearTimeout(timer);
              if (mediaRes.ok) {
                const arrayBuffer = await mediaRes.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const mimeType = mediaRes.headers.get('content-type') || 'image/jpeg';
                return {
                  inlineData: {
                    mimeType,
                    data: base64,
                  },
                };
              }
            } catch (fetchErr) {
              console.warn('[Gemini Stream] Media fetch error for URL:', urlToFetch, fetchErr);
            }
          }
          return null;
        })
      );

      for (const m of mediaParts) {
        if (m) parts.push(m);
      }
    }

    parts.push({ text: prompt });

    const isKael = type === 'kael';
    let kaelQuota: any = null;
    let kaelUserSession: any = null;
    let effectivePlan = String(plan || 'free').toLowerCase();

    if (isKael) {
      const authHeader = req.headers.authorization;
      const clientTimezone = (req.headers['x-timezone'] as string) || (req.body?.timezone as string) || '';

      const getTimezoneMonthKey = (tz?: string): string => {
        if (!tz) return new Date().toISOString().slice(0, 7);
        try {
          return new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
          }).format(new Date()).slice(0, 7);
        } catch {
          return new Date().toISOString().slice(0, 7);
        }
      };

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const { data: userData, error: userError } = await supabase.auth.getUser(token);

        if (!userError && userData?.user?.id) {
          const authUser = userData.user;
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('subscription_plan, subscription_status, kael_msg_count, kael_msg_month, timezone')
            .eq('id', authUser.id)
            .maybeSingle();

          const activeSub =
            profileRow?.subscription_status === 'active' ||
            profileRow?.subscription_status === 'trialing';

          const PLAN_LIMITS: Record<string, number> = {
            free: 100,
            progress: 300,
            performance: 800,
            elite: 2000,
          };

          const rawPlan = activeSub ? (profileRow?.subscription_plan || 'free').toLowerCase() : 'free';
          const resolvedPlan = PLAN_LIMITS[rawPlan] ? rawPlan : 'free';
          effectivePlan = resolvedPlan;
          const usageLimit = PLAN_LIMITS[resolvedPlan] || 100;

          const effectiveTz = profileRow?.timezone || clientTimezone || 'UTC';
          const currentMonthKey = getTimezoneMonthKey(effectiveTz);
          const isCurrentMonth = profileRow?.kael_msg_month === currentMonthKey;
          const count = isCurrentMonth ? Number(profileRow?.kael_msg_count ?? 0) : 0;

          const currentUsage = {
            used: count,
            limit: usageLimit,
            remaining: Math.max(0, usageLimit - count),
            monthKey: currentMonthKey,
            plan: resolvedPlan,
          };

          if (currentUsage.remaining <= 0 || currentUsage.used >= currentUsage.limit) {
            return res.status(429).json({
              success: false,
              error: 'You have reached your monthly message limit for Coach Kael.',
              error_code: 'KAEL_LIMIT_REACHED',
              quota: {
                allowed: false,
                used: currentUsage.used,
                limit: currentUsage.limit,
                remaining: 0,
                monthKey: currentUsage.monthKey,
                plan: currentUsage.plan,
                timezone: effectiveTz,
              },
              type: 'kael',
            });
          }

          const userScopedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: {
              headers: { Authorization: `Bearer ${token}` },
            },
          });

          kaelUserSession = {
            client: userScopedClient,
            id: authUser.id,
            effectiveTz,
            usageLimit,
            resolvedPlan,
            currentMonthKey,
            currentUsage,
          };
        }
      }

      if (!kaelUserSession && req.body?.user_id) {
        const fallbackUserId = req.body.user_id;
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('subscription_plan, subscription_status, kael_msg_count, kael_msg_month, timezone')
          .eq('id', fallbackUserId)
          .maybeSingle();

        const activeSub =
          profileRow?.subscription_status === 'active' ||
          profileRow?.subscription_status === 'trialing';

        const PLAN_LIMITS: Record<string, number> = {
          free: 100,
          progress: 300,
          performance: 800,
          elite: 2000,
        };

        const rawPlan = activeSub ? (profileRow?.subscription_plan || 'free').toLowerCase() : 'free';
        const resolvedPlan = PLAN_LIMITS[rawPlan] ? rawPlan : 'free';
        effectivePlan = resolvedPlan;
        const usageLimit = PLAN_LIMITS[resolvedPlan] || 100;

        const effectiveTz = profileRow?.timezone || clientTimezone || 'UTC';
        const currentMonthKey = getTimezoneMonthKey(effectiveTz);
        const isCurrentMonth = profileRow?.kael_msg_month === currentMonthKey;
        const clientUsed = typeof req.body?.current_used === 'number' ? req.body.current_used : 0;
        const count = isCurrentMonth ? Number(profileRow?.kael_msg_count ?? clientUsed) : clientUsed;

        const currentUsage = {
          used: count,
          limit: usageLimit,
          remaining: Math.max(0, usageLimit - count),
          monthKey: currentMonthKey,
          plan: resolvedPlan,
        };

        if (currentUsage.remaining <= 0 || currentUsage.used >= currentUsage.limit) {
          return res.status(429).json({
            success: false,
            error: 'You have reached your monthly message limit for Coach Kael.',
            error_code: 'KAEL_LIMIT_REACHED',
            quota: {
              allowed: false,
              used: currentUsage.used,
              limit: currentUsage.limit,
              remaining: 0,
              monthKey: currentUsage.monthKey,
              plan: currentUsage.plan,
              timezone: effectiveTz,
            },
            type: 'kael',
          });
        }

        kaelUserSession = {
          client: supabase,
          id: fallbackUserId || 'guest',
          effectiveTz,
          usageLimit,
          resolvedPlan,
          currentMonthKey,
          currentUsage,
        };
      }
    }

    const isJsonExpected =
      JSON_TYPES.has(type) ||
      Boolean(schema) ||
      Boolean(response_json_schema);

    const config: Record<string, unknown> = {};

    if (isJsonExpected) {
      config.responseMimeType = 'application/json';
      if (response_json_schema || schema) {
        config.responseSchema = response_json_schema || schema;
      }
    }

    config.thinkingConfig = {
      thinkingLevel: ThinkingLevel.LOW,
    };

    if (type === 'kael') {
      const kaelBaseMandate =
        'You are Coach Kael, an elite strength & conditioning coach and fitness mentor for WASHEK. ' +
        'CORE SCIENTIFIC ACCURACY MANDATE (ALL PLANS): You are ALWAYS 100% scientifically accurate, biomechanically sound, and physiologically grounded across every plan tier. Safety, anatomical precision, and evidence-based truth NEVER change on any plan. ' +
        'COMMUNICATION CLARITY & ACCESSIBLE LANGUAGE (CRITICAL): Respond in simple, clear, everyday language that any beginner can easily understand, without dense medical or kinesiology jargon. When explaining how the body moves, translate complex biomechanics into intuitive practical terms (e.g., explain scapular depression as pulling shoulder blades down and away from the ears; explain eccentric control as lowering yourself slowly; explain CNS fatigue as deep whole-body burnout). Use an intuitive real-world analogy whenever it helps make the concept or physical sensation click. Never talk down to the user or sound like you are explaining things to a toddler or baby — find that golden balance of mature, respectful, seasoned coaching with zero confusing jargon. Never make responses shorter than the tier guideline or alter the programming. ';

      if (effectivePlan === 'elite') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: ELITE. Deliver lightning-fast, masterclass coaching depth (~180–350+ words). Break down how muscles and joints work together in clear, vivid terms with intuitive cues or analogies. Always include at least one insider coaching nuance labeled "🔐 Elite tip:" or "⚡ Secret:", and provide deep "🛡️ Elite recovery:" or "🔋 Recovery call:" deload diagnostics when fatigue or rest is relevant, explained in plain language.';
        config.temperature = 0.25;
        config.maxOutputTokens = 3500;
      } else if (effectivePlan === 'performance') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: PERFORMANCE. Deliver high-speed, advanced coaching intelligence (~130–220 words). Break down movement tempo (concentric/eccentric cadence explained simply as lowering, pausing, and pushing), muscle activation cues, exercise synergy, and fueling/recovery timing in straightforward terms.';
        config.temperature = 0.3;
        config.maxOutputTokens = 2500;
      } else if (effectivePlan === 'progress') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: PROGRESS. Deliver faster and smarter coaching answers (~80–140 words). In addition to 100% accurate guidance, explain the practical "why" behind the movement in simple terms, using relatable analogies when helpful, and outline clear actionable progression steps.';
        config.temperature = 0.35;
        config.maxOutputTokens = 1800;
      } else {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: FREE. Deliver 100% scientifically accurate, direct, and concise coaching answers (~40–80 words). Provide the exact recommendation and key execution cue in plain, everyday language without confusing jargon, fluff, or filler.';
        config.temperature = 0.4;
        config.maxOutputTokens = 900;
      }
    } else {
      const systemInstruction = SYSTEM_INSTRUCTIONS[type];
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
    }

    const modelsToTry = [
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
      'gemini-3.8-flash',
    ];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    let fullOutput = '';
    let streamResponse: any = null;
    let lastError: any = null;

    for (const currentModel of modelsToTry) {
      try {
        const controller = new AbortController();
        const timeoutMs = isJsonExpected ? 18000 : 10000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const callConfig = {
          ...config,
          abortSignal: controller.signal,
        };

        streamResponse = await ai.models.generateContentStream({
          model: currentModel,
          contents: { parts },
          config: callConfig,
        });
        clearTimeout(timer);
        break;
      } catch (modelErr: any) {
        lastError = modelErr;
        console.warn(`[Gemini Stream] Model "${currentModel}" failed:`, modelErr?.message || modelErr);
      }
    }

    if (!streamResponse) {
      res.write(`data: ${JSON.stringify({ error: lastError?.message || 'AI streaming failed.' })}\n\n`);
      return res.end();
    }

    for await (const chunk of streamResponse) {
      const text = chunk.text;
      if (text) {
        fullOutput += text;
        res.write(`data: ${JSON.stringify({ chunk: text, full: fullOutput })}\n\n`);
      }
    }

    if (isKael && kaelUserSession) {
      const {
        client,
        id: userId,
        effectiveTz,
        usageLimit,
        resolvedPlan,
        currentMonthKey,
        currentUsage,
      } = kaelUserSession;

      let claimResult: any = null;
      try {
        let { data: claimData, error: claimError } = await client.rpc('claim_kael_message');
        if (claimError && claimError.code === 'PGRST202') {
          const fallbackClaim = await client.rpc('claim_kael_message', {
            p_timezone: effectiveTz,
          });
          if (!fallbackClaim.error) {
            claimData = fallbackClaim.data;
            claimError = null;
          }
        }
        if (!claimError && claimData && typeof claimData.used === 'number') {
          claimResult = claimData;
        }
      } catch (err) {
        console.warn('[server.ts stream] claim_kael_message RPC error:', err);
      }

      if (!claimResult) {
        const newCount = currentUsage.used + 1;
        const updatePayload: Record<string, any> = {
          kael_msg_count: newCount,
          kael_msg_month: currentMonthKey,
        };
        if (effectiveTz) {
          updatePayload.timezone = effectiveTz;
        }
        if (userId && userId !== 'guest') {
          try {
            await client.from('profiles').update(updatePayload).eq('id', userId);
          } catch (dbErr) {
            console.warn('[server.ts stream] Profile update fallback note:', dbErr);
          }
        }

        claimResult = {
          allowed: true,
          used: newCount,
          limit: usageLimit,
          remaining: Math.max(0, usageLimit - newCount),
          monthKey: currentMonthKey,
          plan: resolvedPlan,
          timezone: effectiveTz,
        };
      } else {
        claimResult = {
          ...claimResult,
          remaining:
            typeof claimResult.remaining === 'number'
              ? claimResult.remaining
              : Math.max(0, (claimResult.limit || usageLimit) - (claimResult.used || 0)),
          timezone: effectiveTz,
        };
      }

      kaelQuota = claimResult;
    }

    if (!kaelQuota && isKael) {
      const clientUsed = typeof req.body?.current_used === 'number' ? req.body.current_used : 0;
      const newCount = clientUsed + 1;
      const PLAN_LIMITS: Record<string, number> = {
        free: 100,
        progress: 300,
        performance: 800,
        elite: 2000,
      };
      const resolvedPlan = PLAN_LIMITS[effectivePlan] ? effectivePlan : 'free';
      const usageLimit = PLAN_LIMITS[resolvedPlan] || 100;
      const clientTz = (req.headers['x-timezone'] as string) || (req.body?.timezone as string) || 'UTC';
      let monthKey = new Date().toISOString().slice(0, 7);
      try {
        monthKey = new Intl.DateTimeFormat('en-CA', {
          timeZone: clientTz,
          year: 'numeric',
          month: '2-digit',
        }).format(new Date()).slice(0, 7);
      } catch {}

      kaelQuota = {
        allowed: true,
        used: newCount,
        limit: usageLimit,
        remaining: Math.max(0, usageLimit - newCount),
        monthKey,
        plan: resolvedPlan,
        timezone: clientTz,
      };
    }

    res.write(`data: ${JSON.stringify({ done: true, full: fullOutput, quota: kaelQuota })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('[Gemini Stream Error]', error);
    res.write(`data: ${JSON.stringify({ error: error?.message || 'Streaming failed.' })}\n\n`);
    res.end();
  }
});

app.post('/api/send-contact-email', async (req, res) => {
  try {
    const { name, email, message, subject, body } = req.body || {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    const cleanMessage =
      typeof message === 'string' && message.trim()
        ? message.trim()
        : typeof body === 'string' && body.trim()
          ? body.trim()
          : '';
    const cleanSubject =
      typeof subject === 'string' && subject.trim()
        ? subject.trim()
        : cleanName
          ? `WASHEK Contact Message from ${cleanName}`
          : 'WASHEK Contact Message';

    if (!cleanMessage) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required.',
      });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey && !resendApiKey.includes('YOUR_')) {
      const emailPayload: Record<string, unknown> = {
        from: process.env.CONTACT_FROM_EMAIL || 'WASHEK <onboarding@resend.dev>',
        to: [process.env.CONTACT_TO_EMAIL || 'washekfitness@gmail.com'],
        subject: cleanSubject,
        text: cleanMessage,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
            <h2 style="color: #0f172a; margin-bottom: 12px;">WASHEK Contact Message</h2>
            ${cleanName ? `<p><strong>Name:</strong> ${cleanName}</p>` : ''}
            ${cleanEmail ? `<p><strong>Email:</strong> ${cleanEmail}</p>` : ''}
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
            <p style="white-space: pre-wrap;">${cleanMessage}</p>
          </div>
        `,
      };

      if (cleanEmail) {
        emailPayload.reply_to = cleanEmail;
      }

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
      });

      const result = await emailRes.json().catch(() => ({}));
      if (emailRes.ok) {
        return res.json({
          success: true,
          id: result?.id || null,
        });
      }
    }

    // Persist to Supabase contact_messages table via server client
    try {
      await supabase.from('contact_messages').insert({
        name: cleanName || 'Guest User',
        email: cleanEmail || 'no-email@washek.fitness',
        message: cleanMessage,
      });
    } catch (dbErr) {
      console.warn('[server.ts] Failed to persist to contact_messages:', dbErr);
    }

    return res.json({
      success: true,
      message: 'Message received and stored.',
    });
  } catch (err: any) {
    console.error('[server.ts /api/send-contact-email error]', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to process contact email.',
    });
  }
});

// ------------------------------------------------------------
// SERVER LIFECYCLE & VITE MIDDLEWARE
// ------------------------------------------------------------

async function startServer() {
  try {
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: false,
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*all', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    const server = app.listen(PORT, HOST, () => {
      console.log(`WASHEK server running on http://${HOST}:${PORT} with Google Gemini backend`);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[server.ts] Port ${PORT} is already in use.`);
        process.exit(1);
      } else {
        console.error('[server.ts] Server error:', err);
        process.exit(1);
      }
    });

    const shutdown = () => {
      server.close(() => {
        process.exit(0);
      });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
