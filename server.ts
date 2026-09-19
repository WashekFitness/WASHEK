import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = 3000;

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

// Guarantee that returns from Stripe Checkout redirect to washek.ai.studio
app.use((req, res, next) => {
  const host = (req.headers.host || req.hostname || '').toLowerCase();
  if (!host.includes('washek.ai.studio')) {
    const isSubscriptionReturn = req.path.startsWith('/subscription-return');
    const hasStripeQuery = req.query && (req.query.session_id || req.query.plan);
    const referer = String(req.headers.referer || req.headers.referrer || '');
    const isStripeReferer = referer.includes('stripe.com');

    if (isSubscriptionReturn || hasStripeQuery || (req.path.startsWith('/profile') && isStripeReferer)) {
      const originalUrl = req.originalUrl || req.url;
      console.log(`[Stripe Redirect] Forwarding from ${host} to https://washek.ai.studio${originalUrl}`);
      return res.redirect(302, `https://washek.ai.studio${originalUrl}`);
    }
  }
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    backend: 'Google Gemini',
    model: 'gemini-3.5-flash-lite',
    hasKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

const SYSTEM_INSTRUCTIONS: Record<string, string> = {
  kael: 'You are Coach Kael, an elite strength & conditioning coach and fitness mentor for WASHEK. You are direct, scientifically grounded, encouraging, and focused on progressive overload, proper biomechanics, recovery, and nutrition. Provide concise, actionable, and motivational guidance.',
  structure: 'You are an elite strength & conditioning program architect for WASHEK. Design workout structures and weekly splits tailored to the athlete goals. Return a single, strictly valid JSON object matching the requested schema.',
  microcycle: 'You are an elite strength & conditioning program architect for WASHEK. Build comprehensive, progressive workout programming for the microcycle with days, exercise sequences, sets, reps, rest intervals, notes, and activation cues. Return a single valid JSON object with the "microcycle" key adhering to the requested schema.',
  form_analysis: 'You are an expert biomechanist and strength coach for WASHEK Form Lab. Analyze the user exercise execution from the provided images or video frames. Evaluate posture, joint angles, movement path, tempo, and stability. Be accurate, objective, and fair: reward clean, safe mechanics with solid, encouraging scores (80-95), and only deduct points when there is genuine, observable form breakdown or safety risk. Do not be overly harsh or dock points without visible technique errors. Return a valid JSON analysis.',
  food_scan: 'You are a sports nutritionist and dietitian for WASHEK. Analyze the food photo or ingredients. Identify the foods, estimate portion sizes, and calculate accurate macronutrients (calories, protein, carbohydrates, fat). Return a valid JSON object.',
  food_barcode: 'You are a sports nutritionist for WASHEK. Identify the product from the barcode information and estimate accurate nutritional values and serving sizes in a valid JSON object.',
  progress_photo: 'You are a physique assessment specialist for WASHEK. Objectively assess the progress photo for body composition, estimated body fat percentage range, visible muscle definition, posture, and symmetry in a valid JSON object.',
  weekly_update: 'You are Coach Kael conducting a comprehensive weekly athlete check-in for WASHEK. Review the athlete training, nutrition, sleep, and compliance data. Highlight key wins, areas to improve, and provide tailored, actionable advice for the next training week in a valid JSON object.',
  live_workout: 'You are Coach Kael providing real-time coaching, motivation, and quick technique reminders during an active workout session.',
  live_workout_adjustment: 'You are Coach Kael adjusting a live workout due to fatigue, equipment limitations, or pain. Provide safe, effective exercise alternatives or volume modifications in a valid JSON object.',
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

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authentication is required to chat with Coach Kael.',
          error_code: 'UNAUTHENTICATED',
          type: 'kael',
        });
      }

      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
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
      if (userError || !userData?.user) {
        return res.status(401).json({
          success: false,
          error: 'Your session is invalid or expired. Please sign in again.',
          error_code: 'UNAUTHENTICATED',
          type: 'kael',
        });
      }

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

    const isJsonExpected =
      JSON_TYPES.has(type) ||
      Boolean(schema) ||
      Boolean(response_json_schema);

    // Using Google Gemini high-speed models
    const config: Record<string, unknown> = {};

    if (isJsonExpected) {
      config.responseMimeType = 'application/json';
    }

    // Tune generation parameters and system instructions based on server-verified plan tier
    if (type === 'kael') {
      const kaelBaseMandate =
        'You are Coach Kael, an elite strength & conditioning coach and fitness mentor for WASHEK. ' +
        'CORE SCIENTIFIC ACCURACY MANDATE (ALL PLANS): You are ALWAYS 100% scientifically accurate, biomechanically sound, and physiologically grounded across every plan tier. Safety, anatomical precision, and evidence-based truth NEVER change on any plan. ';

      if (effectivePlan === 'elite') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: ELITE. Deliver lightning-fast, masterclass coaching depth (~180–350+ words). Detail the full kinetic chain, joint angles, torque, and neuromuscular mechanics. Always include at least one insider coaching nuance labeled "🔐 Elite tip:" or "⚡ Secret:", and provide deep "🛡️ Elite recovery:" or "🔋 Recovery call:" deload diagnostics when fatigue or rest is relevant.';
        config.temperature = 0.25;
        config.maxOutputTokens = 3500;
      } else if (effectivePlan === 'performance') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: PERFORMANCE. Deliver high-speed, advanced coaching intelligence (~130–220 words). Break down movement tempo (concentric/eccentric cadence), neuromuscular activation cues, exercise synergy, and fueling/recovery timing.';
        config.temperature = 0.3;
        config.maxOutputTokens = 2500;
      } else if (effectivePlan === 'progress') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: PROGRESS. Deliver faster and smarter coaching answers (~80–140 words). In addition to 100% accurate guidance, explain the biomechanical "why" behind the movement and outline clear actionable progression steps.';
        config.temperature = 0.35;
        config.maxOutputTokens = 1800;
      } else {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: FREE. Deliver 100% scientifically accurate, direct, and concise coaching answers (~40–80 words). Provide the exact recommendation and key execution cue without filler or fluff.';
        config.temperature = 0.4;
        config.maxOutputTokens = 900;
      }
    } else {
      const systemInstruction = SYSTEM_INSTRUCTIONS[type];
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
    }

    // High-speed, high-accuracy model hierarchy
    const modelsToTry = [
      'gemini-flash-lite-latest',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
    ];
    let lastError: any = null;
    let response: any = null;
    let successfulModel = modelsToTry[0];

    for (const currentModel of modelsToTry) {
      try {
        console.log(`[Gemini API] Trying model "${currentModel}" for type="${type}"`);
        const controller = new AbortController();
        const timeoutMs = isJsonExpected || (Array.isArray(file_urls) && file_urls.length > 0) ? 25000 : 15000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const callConfig = {
          ...config,
          abortSignal: controller.signal,
        };

        response = await ai.models.generateContent({
          model: currentModel,
          contents: { parts },
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
        await client
          .from('profiles')
          .update(updatePayload)
          .eq('id', userId);

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

// ------------------------------------------------------------
// SERVER LIFECYCLE & VITE MIDDLEWARE
// ------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WASHEK server running on http://0.0.0.0:${PORT} with Google Gemini backend`);
  });
}

startServer();
