import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  supabaseApi,
} from '@/lib/supabaseApi';

import {
  Button,
} from '@/components/ui/button';

import {
  Textarea,
} from '@/components/ui/textarea';

import {
  Send,
  Zap,
  Lock,
  Plus,
  MessagesSquare,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronDown,
  Clock,
} from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import {
  cn,
} from '@/lib/utils';

import {
  getServerMessageStats,
  getCachedMessageStats,
  syncQuotaAcrossApp,
  getCurrentMonthKey,
  getPlanLimit,
} from '@/lib/messageLimit';
import {
  applySubscriptionUpgrade,
  getPlanRank,
  hasPlan,
  isActiveSubscriptionStatus,
  normalizePlan,
  resolveEffectivePlan,
} from '@/lib/subscription';
import { fetchServerEntitlement } from '@/lib/stripeCheckout';
import {
  kaelStore,
  useKaelStore,
  getMessageChatId,
} from '@/lib/kaelStore';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useMidnightSync } from '@/hooks/useMidnightSync';
import { getLocalDateKey, getUserTimeZone } from '@/lib/dateUtils';
import {
  fetchKaelAppContext,
  parseKaelActions,
  validateKaelRoute,
} from '@/lib/kaelAppContext';

import {
  useAppSettings,
} from '@/lib/AppSettingsContext';

import {
  getKaelSystemPrompt,
} from '@/lib/trainingTypes';

import MessageBubble from '@/components/kael/MessageBubble';


const CONTEXT_MESSAGE_COUNT = 10;

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}


/*
 * ============================================================
 * TYPEWRITER SETTINGS
 * ============================================================
 *
 * Kael starts displaying the answer as soon as the AI result
 * arrives, then reveals it rapidly in small chunks.
 *
 * Response reveal speed increases with the user's plan:
 *
 * Free        = slowest
 * Progress    = faster
 * Performance = faster
 * Elite       = fastest
 *
 * This only controls how quickly the already-generated answer
 * appears on screen. It does not change AI quality or logic.
 */

const TYPEWRITER_MIN_DELAY = 1;
const TYPEWRITER_MAX_DELAY = 14;

/*
 * Calculate a typing delay based on plan and text length.
 *
 * Each plan tier noticeably accelerates the response speed:
 * - Free: 11ms (deliberate, steady pacing)
 * - Progress: 6ms (faster, responsive stream)
 * - Performance: 3ms (high-speed delivery)
 * - Elite: 1ms (lightning-fast, near-instant streaming)
 */

function getTypingDelay(
  textLength,
  plan = 'free'
) {
  const planDelay =
    plan === 'elite'
      ? 1
      : plan === 'performance'
        ? 3
        : plan === 'progress'
          ? 6
          : 11;

  if (
    textLength <= 120
  ) {
    return planDelay + 1;
  }

  if (
    textLength <= 300
  ) {
    return planDelay;
  }

  if (
    textLength <= 600
  ) {
    return Math.max(
      1,
      planDelay - 1
    );
  }

  return Math.max(
    1,
    planDelay - 2
  );
}


/*
 * Split text into chunks that scale directly with the user's plan.
 * Higher tiers stream multiple characters per tick for noticeably
 * faster and smoother reveals.
 */

function getTypingChunkSize(
  textLength,
  plan = 'free'
) {
  const baseChunk =
    plan === 'elite'
      ? 10
      : plan === 'performance'
        ? 6
        : plan === 'progress'
          ? 3
          : 1;

  if (
    textLength <= 150
  ) {
    return baseChunk;
  }

  if (
    textLength <= 400
  ) {
    return baseChunk + 1;
  }

  if (
    textLength <= 900
  ) {
    return baseChunk + 2;
  }

  return baseChunk + 3;
}


/*
 * Small natural pauses after punctuation.
 * Pacing scales with plan so higher tiers reveal even more briskly.
 */

function getPunctuationPause(
  character,
  plan = 'free'
) {
  if (plan === 'elite') {
    return 1;
  }

  if (plan === 'performance') {
    if (
      character === '.' ||
      character === '!' ||
      character === '?'
    ) {
      return 5;
    }
    return 2;
  }

  if (plan === 'progress') {
    if (
      character === '.' ||
      character === '!' ||
      character === '?'
    ) {
      return 9;
    }
    return 4;
  }

  // Free plan: deliberate, natural cadence
  if (
    character === '.' ||
    character === '!' ||
    character === '?'
  ) {
    return 18;
  }

  if (
    character === ',' ||
    character === ';' ||
    character === ':'
  ) {
    return 8;
  }

  return 0;
}


export default function Kael() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    settings,
    toggleManualRestDay,
    isRestDayMarked,
  } = useAppSettings();

  const [
    user,
    setUser,
  ] = useState(null);

  const {
    messages,
    conversations,
    activeChatId,
    isSending: loading,
  } = useKaelStore();

  const [
    isHistoryOpen,
    setIsHistoryOpen,
  ] = useState(false);

  const [
    deleteConfirmChatId,
    setDeleteConfirmChatId,
  ] = useState(null);

  const [
    editingChatId,
    setEditingChatId,
  ] = useState(null);

  const [
    editingTitle,
    setEditingTitle,
  ] = useState('');

  const [
    input,
    setInput,
  ] = useState('');

  const [
    stats,
    setStatsRaw,
  ] = useState(() => {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('washek_user') : null;
      if (stored) {
        const u = JSON.parse(stored);
        const uPlan = resolveEffectivePlan(u);
        return getCachedMessageStats(u, uPlan);
      }
    } catch (_initErr) {
      // Storage read fallback
    }
    return null;
  });

  const setStats = useCallback((nextOrUpdater) => {
    setStatsRaw((prev) => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
      if (!next) return prev;
      const validPrevMonth = /^\d{4}-\d{2}$/.test(String(prev?.monthKey || ''));
      const validNextMonth = /^\d{4}-\d{2}$/.test(String(next?.monthKey || ''));
      const sameAccount =
        !prev?.userId ||
        !next?.userId ||
        String(prev.userId) === String(next.userId) ||
        (prev?.userEmail && next?.userEmail && prev.userEmail === next.userEmail);

      // Never allow message count to decrease mid-month; only reset when monthKey rolls to a new month
      if (
        prev &&
        sameAccount &&
        validPrevMonth &&
        (!validNextMonth || prev.monthKey === next.monthKey) &&
        typeof prev.used === 'number' &&
        typeof next.used === 'number' &&
        next.used < prev.used
      ) {
        const limit = Number(next.limit || prev.limit || 100);
        return {
          ...next,
          used: prev.used,
          limit,
          remaining: Math.max(0, limit - prev.used),
          monthKey: prev.monthKey,
        };
      }
      return next;
    });
  }, []);

  const { user: authUser, setUser: setAuthUser } = useAuth() || {};
  const effectiveUser = (() => {
    if (authUser && user) {
      return getPlanRank(resolveEffectivePlan(authUser)) >= getPlanRank(resolveEffectivePlan(user))
        ? { ...user, ...authUser }
        : { ...authUser, ...user };
    }
    return authUser || user;
  })();

  const { timeZone } = useMidnightSync(effectiveUser);

  const bottomRef =
    useRef(null);

  /*
   * Keeps the message box ready for typing so the user does not
   * have to click it again after Kael responds.
   */
  const inputRef =
    useRef(null);

  /*
   * Used to cancel a typewriter animation if the user sends
   * another message or leaves the page while Kael is typing.
   */
  const typingCancelledRef =
    useRef(false);

  const lastScrolledChatRef =
    useRef(null);

  const appContextTextRef =
    useRef('');

  const executedActionKeysRef =
    useRef(new Set());

  /*
   * Current active conversation metadata
   */
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeChatId) || null;
  }, [conversations, activeChatId]);

  /*
   * Current active conversation messages (isolated memory for this chat)
   */
  const activeMessages = useMemo(() => {
    if (!activeChatId) return [];
    return messages.filter((message) => getMessageChatId(message) === activeChatId);
  }, [messages, activeChatId]);

  /*
   * ==========================================================
   * LOAD USER & TIMEZONE SYNCHRONIZATION
   * ==========================================================
   */

  useEffect(() => {
    let active = true;

    supabaseApi.auth
      .me(true)
      .then(async (u) => {
        if (!active) {
          return;
        }

        let loadedUser = u || authUser;
        if (loadedUser) {
          setUser(loadedUser);
        }

        if (loadedUser && !hasPlan(loadedUser, 'elite') && (loadedUser.id || loadedUser.email)) {
          try {
            const ent = await fetchServerEntitlement({
              userId: loadedUser.id,
              email: loadedUser.email,
              cancelledAtIso: loadedUser.subscription_cancelled_at || null,
            });
            if (active && ent?.active && ent.plan && ent.plan !== 'free') {
              const curRank = getPlanRank(resolveEffectivePlan(loadedUser));
              const entRank = getPlanRank(ent.plan);
              if (entRank > curRank) {
                applySubscriptionUpgrade(ent.plan, ent.status, {
                  persistReceipt: true,
                  timestamp: ent.timestamp,
                  syncServer: false,
                });
                loadedUser = {
                  ...loadedUser,
                  subscription_plan: ent.plan,
                  subscription_status: ent.status,
                  plan: ent.plan,
                  tier: ent.plan,
                  subscription_tier: ent.plan,
                  subscription_cancelled_at: null,
                };
                setUser(loadedUser);
                setAuthUser?.(loadedUser);
              }
            }
          } catch {
            // ignore entitlement probe error
          }
        }

        const effectiveTz = timeZone || getUserTimeZone(loadedUser);
        getServerMessageStats(effectiveTz)
          .then((serverStats) => {
            if (active && serverStats) {
              setStats(serverStats);
            }
          })
          .catch((statsError) => {
            console.error(
              '[KAEL] Failed to load server usage:',
              statsError
            );
          });
      })
      .catch((error) => {
        console.error(
          '[KAEL] Failed to load user:',
          error
        );
        const effectiveTz = timeZone || getUserTimeZone(authUser);
        getServerMessageStats(effectiveTz)
          .then((serverStats) => {
            if (active && serverStats) {
              setStats(serverStats);
            }
          })
          .catch(() => {});
      });

    return () => {
      active = false;
    };
  }, [timeZone, authUser?.id]);

  // Real-time listener for quota and subscription updates dispatched anywhere in the app
  useEffect(() => {
    const handleQuotaUpdate = (e) => {
      if (e?.detail) {
        setStats(e.detail);
      }
    };

    const handleSubUpdate = (e) => {
      const rawPlan = normalizePlan(e.detail?.plan || e.detail?.subscription_plan || 'free');
      const rawStatus = String(
        e.detail?.status || e.detail?.subscription_status || (rawPlan === 'free' ? 'canceled' : 'active')
      ).toLowerCase().trim();
      const activeSub = rawPlan !== 'free' && isActiveSubscriptionStatus(rawStatus);
      const nextPlan = activeSub ? rawPlan : 'free';
      if (e.detail?.plan || e.detail?.status || e.detail?.subscription_plan || e.detail?.subscription_status) {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                subscription_plan: nextPlan,
                subscription_status: rawStatus,
                plan: nextPlan,
                tier: nextPlan,
                subscription_tier: nextPlan,
              }
            : prev
        );
      }
    };

    window.addEventListener('kael-quota-updated', handleQuotaUpdate);
    window.addEventListener('washek_subscription_updated', handleSubUpdate);
    window.addEventListener('washek_user_changed', handleSubUpdate);
    return () => {
      window.removeEventListener('kael-quota-updated', handleQuotaUpdate);
      window.removeEventListener('washek_subscription_updated', handleSubUpdate);
      window.removeEventListener('washek_user_changed', handleSubUpdate);
    };
  }, []);

  // Automatically refresh usage when midnight strikes in the user's timezone
  useEffect(() => {
    const handleMidnightReset = () => {
      getServerMessageStats(timeZone)
        .then((serverStats) => {
          if (serverStats) setStats(serverStats);
        })
        .catch(() => {});
    };

    window.addEventListener('calendar-day-reset', handleMidnightReset);
    return () => {
      window.removeEventListener('calendar-day-reset', handleMidnightReset);
    };
  }, [timeZone]);


  /*
   * ==========================================================
   * BACKGROUND REMOTE SYNC (NON-DESTRUCTIVE)
   * ==========================================================
   */

  useEffect(() => {
    const currentUserId = user?.id || authUser?.id || authUser?.uid || authUser?.email || 'guest';
    kaelStore.syncWithRemote(currentUserId);
  }, [
    user?.id,
    authUser?.id,
    authUser?.uid,
    authUser?.email,
  ]);


  /*
   * ==========================================================
   * CONVERSATION ACTIONS
   * ==========================================================
   */

  const handleNewChat = () => {
    typingCancelledRef.current = true;
    kaelStore.createNewChat();
    setIsHistoryOpen(false);
    setInput('');
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleSelectChat = (chatId) => {
    if (chatId === activeChatId) {
      setIsHistoryOpen(false);
      return;
    }
    typingCancelledRef.current = true;
    kaelStore.selectChat(chatId);
    setIsHistoryOpen(false);
    setInput('');
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleDeleteChat = async (chatId) => {
    if (!chatId) {
      setDeleteConfirmChatId(null);
      return;
    }
    setDeleteConfirmChatId(null);
    await kaelStore.deleteChat(chatId);
  };

  const handleRenameChat = (chatId, newTitle) => {
    kaelStore.renameChat(chatId, newTitle);
    setEditingChatId(null);
  };


  /*
   * ==========================================================
   * KEEP BOTTOM VISIBLE
   * ==========================================================
   */

  useEffect(() => {
    const isInitialOrChatSwitch =
      lastScrolledChatRef.current !== activeChatId;
    lastScrolledChatRef.current = activeChatId;
    bottomRef.current?.scrollIntoView({
      behavior: isInitialOrChatSwitch ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [
    activeMessages.length,
    loading,
    activeMessages[
      activeMessages.length - 1
    ]?.content,
    activeChatId,
  ]);


  /*
   * ==========================================================
   * PLAN / MESSAGE LIMIT
   * ==========================================================
   */

  const plan = resolveEffectivePlan(effectiveUser);

  const effectiveTz = timeZone || getUserTimeZone(effectiveUser);
  const activeLimit = getPlanLimit(plan);

  const baseStats =
    stats ||
    getCachedMessageStats(
      effectiveUser,
      plan,
      effectiveTz
    );

  const displayStats = baseStats
    ? {
        ...baseStats,
        plan,
        limit: activeLimit,
        remaining: Math.max(0, activeLimit - Number(baseStats.used || 0)),
      }
    : null;

  const atLimit =
    displayStats
      ? displayStats.remaining === 0
      : false;


  /*
   * Keep the Kael message box focused whenever the user is able
   * to type. This runs after loading finishes so focus returns
   * automatically when Kael has completed a response.
   */
  useEffect(() => {
    if (
      !loading &&
      !atLimit
    ) {
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [
    loading,
    atLimit,
  ]);


  const firstName =
    effectiveUser?.first_name ||
    effectiveUser?.full_name?.split(
      ' '
    )[0] ||
    '';


  /*
   * Preload live app context snapshot (program, today workout/rest day, nutrition, maxes, heatmap)
   */
  useEffect(() => {
    let active = true;
    fetchKaelAppContext({
      user: effectiveUser,
      settings,
      timeZone: effectiveTz,
    })
      .then((ctx) => {
        if (active && ctx?.summaryText) {
          appContextTextRef.current = ctx.summaryText;
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [
    effectiveUser?.id,
    effectiveUser?.email,
    effectiveUser?.subscription_plan,
    effectiveUser?.subscription_status,
    settings?.manualRestDays,
    settings?.unit,
    effectiveTz,
  ]);

  const executeKaelAction = useCallback(
    async (action, { isAuto = false, messageId = null } = {}) => {
      if (!action) return;
      const dedupeKey = messageId ? `${messageId}:${action.id}` : null;
      if (isAuto && dedupeKey && executedActionKeysRef.current.has(dedupeKey)) {
        return;
      }
      if (dedupeKey) {
        executedActionKeysRef.current.add(dedupeKey);
      }

      if (action.type === 'go' || action.type === 'navigate') {
        if (isAuto && action.type !== 'go') return;
        if (!action.route) return;
        const authorizedRoute = validateKaelRoute(action.route, effectiveUser || plan);
        if (!authorizedRoute) {
          if (!isAuto) {
            toast.error('Upgrade your plan to access that feature.');
          }
          return;
        }
        if (isAuto) {
          toast.info(`Taking you to ${action.label}…`);
          window.setTimeout(() => {
            navigate(authorizedRoute);
          }, 600);
        } else {
          navigate(authorizedRoute);
        }
        return;
      }

      if (action.type === 'log_food' || action.type === 'ask_log_food') {
        if (isAuto && action.type !== 'log_food') return;
        const userKey = effectiveUser?.email || effectiveUser?.id || 'athlete';
        const todayKey = getLocalDateKey(new Date(), effectiveTz);
        try {
          await supabaseApi.entities.NutritionEntry.create({
            food_name: action.food_name,
            calories: action.calories,
            protein_g: action.protein_g,
            carbs_g: action.carbs_g,
            fat_g: action.fat_g,
            meal_type: action.meal_type || 'snack',
            serving_size: '1 serving',
            date: todayKey,
            created_by: userKey,
          });
          queryClient.invalidateQueries({ queryKey: ['nutrition'] });
          toast.success(`Logged ${action.food_name} (${action.calories} kcal)`);
          fetchKaelAppContext({ user: effectiveUser, settings, timeZone: effectiveTz })
            .then((ctx) => {
              if (ctx?.summaryText) appContextTextRef.current = ctx.summaryText;
            })
            .catch(() => {});
        } catch (err) {
          toast.error(err?.message || 'Could not log food entry.');
        }
        return;
      }

      if (action.type === 'log_rest_day' || action.type === 'ask_log_rest_day') {
        if (isAuto && action.type !== 'log_rest_day') return;
        const todayKey = getLocalDateKey(new Date(), effectiveTz);
        const alreadyRest = isRestDayMarked?.(todayKey);
        if (isAuto && alreadyRest) {
          return;
        }
        if (!alreadyRest) {
          toggleManualRestDay?.(todayKey);
          queryClient.invalidateQueries({ queryKey: ['logs'] });
          queryClient.invalidateQueries({ queryKey: ['programs'] });
          toast.success('Today has been marked as a Rest Day.');
          fetchKaelAppContext({ user: effectiveUser, settings, timeZone: effectiveTz })
            .then((ctx) => {
              if (ctx?.summaryText) appContextTextRef.current = ctx.summaryText;
            })
            .catch(() => {});
        } else {
          toast.info('Today is already marked as a Rest Day.');
        }
      }
    },
    [effectiveUser, effectiveTz, isRestDayMarked, navigate, queryClient, settings, toggleManualRestDay]
  );

  /*
   * ==========================================================
   * BUILD KAEL PROMPT
   * ==========================================================
   */

  const buildPrompt = (
    history,
    liveAppContextText = ''
  ) => {
    const isElite =
      plan === 'elite';

    const trainingType =
      user?.training_type ||
      'calisthenics';

    const lang =
      settings?.language ||
      'English';


    const langInstruction =
      lang !== 'English'
        ? `\n\nCRITICAL: Respond ENTIRELY in ${lang}. Every word of your response must be in ${lang}.`
        : '';


    /*
     * Response depth, detail, and coaching intelligence scale with plan,
     * while accuracy, scientific reasoning, and safety are 100% rigorous on all tiers.
     * All responses are delivered in simple, jargon-free English that beginners easily understand.
     */

    const clarityMandate = `\n\nCOMMUNICATION STYLE MANDATE: Respond in simple, clear language that any athlete can easily understand regardless of experience. Avoid confusing medical, anatomical, or kinesiology jargon (e.g. explain scapular retraction as pulling shoulders back, eccentric as controlled lowering, CNS fatigue as whole-body burnout). If an intuitive real-world analogy helps clarify a movement or sensation, use one. If not needed, keep it direct. Never talk down to the athlete or sound like you are explaining things to a toddler or baby — keep your mature, seasoned coaching presence while ensuring crystal-clear understanding. Do not shorten responses or change programming.`;

    const responseDepthInstruction =
      plan === 'elite'
        ? `${clarityMandate}\n\nRESPONSE DEPTH & INTELLIGENCE — ELITE: Provide the ultimate masterclass coaching answer (roughly 180–320 words when the question benefits from depth, or concise when a direct answer is best). Break down how muscles and joints move in clear, vivid terms, include at least one '🔐 Elite tip:' or '⚡ Secret:' with insider coaching nuance, and include '🛡️ Elite recovery:' or '🔋 Recovery call:' guidance when fatigue/rest is relevant. Never sacrifice accuracy, safety, or necessary context.`
        : plan === 'performance'
          ? `${clarityMandate}\n\nRESPONSE DEPTH & INTELLIGENCE — PERFORMANCE: Provide an advanced, highly detailed coaching answer (roughly 130–200 words when the question benefits from depth). Break down movement tempo (concentric/eccentric cadence explained simply as lowering, pausing, and pushing), muscle activation cues, exercise synergy, and practical performance tips. Never sacrifice accuracy, safety, or necessary context.`
          : plan === 'progress'
            ? `${clarityMandate}\n\nRESPONSE DEPTH & INTELLIGENCE — PROGRESS: Provide a smart, well-explained coaching answer (roughly 80–140 words when the question benefits from depth). Provide the exact recommendation, the practical 'why' behind it, and clear actionable progression steps. Never sacrifice accuracy, safety, or necessary context.`
            : `${clarityMandate}\n\nRESPONSE DEPTH & INTELLIGENCE — FREE: Keep responses concise and direct (roughly 40–80 words). Provide the 100% accurate recommendation, essential execution cue, and immediate next action in plain English without filler or long introductions. Remember: Free users receive the exact same 100% scientific and safety accuracy, delivered concisely.`;


    const recentHistory =
      history
        .slice(
          -CONTEXT_MESSAGE_COUNT
        )
        .map(
          (message) =>
            `${
              message.role ===
              'user'
                ? 'User'
                : 'Kael'
            }: ${message.content}`
        )
        .join('\n\n');

    const contextBlock = liveAppContextText
      ? `\n\n${liveAppContextText}`
      : '';


    return `${getKaelSystemPrompt(
      trainingType,
      firstName,
      plan
    )}${responseDepthInstruction}${langInstruction}${contextBlock}\n\nCONVERSATION HISTORY (remember what the user has told you about their capabilities, limitations, and preferences — update your understanding if they say something new or different):\n${recentHistory}\n\nKael:`;
  };


  /*
   * ==========================================================
   * TYPE THE ASSISTANT RESPONSE
   * ==========================================================
   */

  const typeAssistantResponse =
    async (
      fullText,
      temporaryId
    ) => {

      typingCancelledRef.current =
        false;


      const text =
        String(
          fullText ||
            ''
        );


      if (!text) {
        return;
      }


      const textLength =
        text.length;


      /*
       * Maximum animation duration scales by plan tier so upgraded users
       * experience tangibly faster answer delivery:
       * - Free: up to 4.2s (deliberate)
       * - Progress: up to 2.4s (faster)
       * - Performance: up to 1.3s (high speed)
       * - Elite: up to 0.55s (lightning-fast near-instant stream)
       */
      const planMaxDuration =
        plan === 'elite'
          ? 550
          : plan === 'performance'
            ? 1300
            : plan === 'progress'
              ? 2400
              : 4200;

      const baseDelay =
        Math.min(
          Math.max(
            getTypingDelay(
              textLength,
              plan
            ),
            TYPEWRITER_MIN_DELAY
          ),
          TYPEWRITER_MAX_DELAY
        );


      const chunkSize =
        getTypingChunkSize(
          textLength,
          plan
        );


      /*
       * Safety adjustment:
       * never allow the typewriter to exceed the plan-specific duration cap.
       */

      const estimatedDuration =
        Math.ceil(
          textLength /
            chunkSize
        ) *
          baseDelay;


      const speedMultiplier =
        estimatedDuration >
        planMaxDuration
          ? planMaxDuration /
            estimatedDuration
          : 1;


      const delay = Math.max(
        1,
        Math.round(
          baseDelay *
            speedMultiplier
        )
      );


      let visibleText =
        '';


      for (
        let index = 0;
        index < text.length;
      ) {

        if (
          typingCancelledRef.current
        ) {
          return;
        }


        const nextIndex =
          Math.min(
            text.length,
            index +
              chunkSize
          );


        const chunk =
          text.slice(
            index,
            nextIndex
          );


        visibleText +=
          chunk;


        kaelStore.updateStreamingMessage(
          temporaryId,
          visibleText
        );


        index =
          nextIndex;


        const lastCharacter =
          chunk[
            chunk.length - 1
          ];


        const punctuationPause =
          getPunctuationPause(
            lastCharacter,
            plan
          );


        await new Promise(
          (resolve) =>
            window.setTimeout(
              resolve,
              delay +
                punctuationPause
            )
        );
      }
    };


  /*
   * ==========================================================
   * SEND MESSAGE
   * ==========================================================
   */

  const sendMessage =
    async (overrideText = null) => {

      const candidateText =
        typeof overrideText === 'string' ? overrideText : input;
      const trimmed =
        candidateText.trim();


      if (
        !trimmed ||
        loading ||
        atLimit
      ) {
        return;
      }

      typingCancelledRef.current =
        true;

      // Memory is strictly scoped to this active conversation thread
      const previousMessages =
        [...activeMessages];

      const {
        chatId: currentChatId,
        userMessage,
        assistantId: temporaryId,
      } = kaelStore.startMessageExchange(trimmed);

      if (typeof overrideText !== 'string') {
        setInput('');
      }

      try {
        let freshContextText = appContextTextRef.current;
        try {
          const ctx = await fetchKaelAppContext({
            user: effectiveUser,
            settings,
            timeZone: effectiveTz,
          });
          if (ctx?.summaryText) {
            freshContextText = ctx.summaryText;
            appContextTextRef.current = ctx.summaryText;
          }
        } catch {
          // use cached snapshot if refresh fails
        }

        const prompt =
          buildPrompt(
            [
              ...previousMessages,
              userMessage,
            ],
            freshContextText
          );

        /*
         * SERVER-SIDE QUOTA ENFORCEMENT
         */
        let streamedSoFar = '';
        const result =
          await supabaseApi.ai.stream(
            {
              prompt,
              type:
                'kael',
              plan:
                plan ||
                'free',
              onChunk: (_chunk, accumulated) => {
                streamedSoFar = accumulated;
                kaelStore.updateStreamingMessage(temporaryId, accumulated);
              },
            }
          );

        if (
          result &&
          result.__ai_error
        ) {
          if (
            result.code ===
            'KAEL_LIMIT_REACHED'
          ) {
            if (
              result.details
                ?.quota
            ) {
              setStats(
                result.details
                  .quota
              );
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('kael-quota-updated', { detail: result.details.quota })
                );
              }
            }

            throw new Error(
              'You have reached your monthly Kael message limit.'
            );
          }

          throw new Error(
            result.message ||
              'Kael returned an empty response.'
          );
        }

        const responseText =
          streamedSoFar ||
          (typeof result === 'string'
            ? result
            : result?.result ||
              result?.content ||
              result?.response ||
              result?.text ||
              result?.message ||
              '');

        if (!responseText) {
          throw new Error(
            'Kael returned an empty response.'
          );
        }

        /*
         * COUNTDOWN & SYNC AS KAEL RESPONDS
         */
        const currentLimit = displayStats?.limit || 100;
        const currentUsed = typeof displayStats?.used === 'number' ? displayStats.used : 0;
        const currentMonthKey = displayStats?.monthKey || getCurrentMonthKey(new Date(), effectiveTz);
        const serverMonthKey = result?.quota?.monthKey;
        const isMonthRollover = Boolean(
          serverMonthKey && /^\d{4}-\d{2}$/.test(serverMonthKey) && serverMonthKey !== currentMonthKey
        );
        const serverUsed = result?.quota && typeof result.quota.used === 'number' ? result.quota.used : null;
        const effectiveMonthKey = isMonthRollover ? serverMonthKey : currentMonthKey;
        const newUsed = isMonthRollover
          ? Math.max(1, Number(serverUsed ?? 1))
          : (serverUsed !== null ? Math.max(serverUsed, currentUsed + 1) : currentUsed + 1);
        const newRemaining = Math.max(0, currentLimit - newUsed);

        const updatedQuota = {
          allowed: newRemaining > 0,
          used: newUsed,
          limit: currentLimit,
          remaining: newRemaining,
          monthKey: effectiveMonthKey,
          plan: plan || 'free',
          timezone: effectiveTz,
          userId: user?.id || authUser?.id || null,
          userEmail: (user?.email || authUser?.email) ? String(user?.email || authUser?.email).toLowerCase().trim() : null,
        };

        // 1. Immediately update UI state, React Query cache, localStorage & broadcast across Profile/app
        setStats(updatedQuota);
        syncQuotaAcrossApp(updatedQuota);

        // 3. Keep local and global user profiles in sync monotonically within the same calendar month
        const syncProfile = (prev) => {
          if (!prev) return prev;
          const prevSameMonth =
            prev.kael_msg_month === effectiveMonthKey && typeof prev.kael_msg_count === 'number'
              ? prev.kael_msg_count
              : 0;
          const finalCount = Math.max(prevSameMonth, newUsed);
          const next = {
            ...prev,
            kael_msg_count: finalCount,
            kael_msg_month: effectiveMonthKey,
          };
          try {
            localStorage.setItem('washek_user', JSON.stringify(next));
          } catch (_saveErr) {
            // LocalStorage write ignored
          }
          return next;
        };
        setUser(syncProfile);
        if (setAuthUser) {
          setAuthUser(syncProfile);
        }

        // 4. Persist updated count to server / database in background
        const userIdToSync = user?.id || authUser?.id;
        const userEmailToSync = user?.email || authUser?.email;
        const isUUID = typeof userIdToSync === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userIdToSync.trim());
        const countPayload = {
          kael_msg_count: newUsed,
          kael_msg_month: effectiveMonthKey,
          timezone: effectiveTz,
        };

        ;(async () => {
          try {
            if (isUUID) {
              const { error: syncErr } = await supabase
                .from('profiles')
                .update(countPayload)
                .eq('id', userIdToSync);
              if (syncErr && userEmailToSync) {
                await supabase.from('profiles').update(countPayload).ilike('email', userEmailToSync);
              }
            } else if (userEmailToSync) {
              await supabase
                .from('profiles')
                .update(countPayload)
                .ilike('email', userEmailToSync);
            }
          } catch (err) {
            console.warn('[KAEL] Background profile count sync note:', err);
          }
        })();

        if (!streamedSoFar) {
          await typeAssistantResponse(
            responseText,
            temporaryId
          );
        }

        typingCancelledRef.current =
          false;

        await kaelStore.finalizeAssistantMessage(
          currentChatId,
          temporaryId,
          responseText,
          trimmed
        );

        const parsedActions = parseKaelActions(responseText, effectiveUser || plan).actions;
        if (parsedActions.length > 0) {
          const lastAssistant = [...previousMessages].reverse().find((m) => m?.role === 'assistant');
          const prevAssistantContent = String(lastAssistant?.content || '').toLowerCase();

          const isExplicitNavigationAuthorized = (route) => {
            const rawTxt = String(trimmed || '').trim().toLowerCase();
            if (!rawTxt) return false;

            // Block explicit negations or instructions to stay in chat
            if (
              /\b(don't|do not|dont|never|no need to|without|stop)\s+(take|bring|send|go|navigate|open|switch|pull)\b/i.test(rawTxt) ||
              /\b(stay here|keep me here|just tell me|just answer|just explain|in chat only)\b/i.test(rawTxt)
            ) {
              return false;
            }

            const baseRoute = String(route || '').split('?')[0].trim();

            // Allow short affirmative confirmation ONLY if Kael just offered to navigate to a page
            const isShortAffirmative =
              /^(yes|yeah|yep|yup|sure|ok|okay|please|please do|do it|go ahead|sounds good|take me there|open it|yes please|sure thing)[.!?\s]*$/i.test(rawTxt);
            const prevOfferedNav =
              prevAssistantContent.includes('?') &&
              (/\b(want me to|would you like me to|should i|shall i)\s+(take you|bring you|open|go to|navigate|send you)\b/i.test(prevAssistantContent) ||
                /\[ACTION:(?:go|navigate):/i.test(String(lastAssistant?.content || '')));
            if (isShortAffirmative && prevOfferedNav) {
              return true;
            }

            // Strip conversational idioms that are NOT page navigation commands
            const navTxt = rawTxt
              .replace(/\b(go over|go ahead|going to|let's go|lets go|keep going|on the go|go to sleep|go to bed|go to the gym|go for a run|take me through|walk me through|open up about|open up)\b/gi, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            const hasExplicitNavVerb =
              /\b(take|bring|send)\s+me\s+(?:back\s+)?(?:to|over\s+to)\b/i.test(navTxt) ||
              /\b(take|bring|send)\s+me\s+(?:back\s+)?home\b/i.test(navTxt) ||
              /\b(go|head|jump|switch|redirect|navigate)\s+(?:back\s+)?(?:to|over\s+to)\b/i.test(navTxt) ||
              /\bgo\s+(?:back\s+)?home\b/i.test(navTxt) ||
              /\bnavigate\b/i.test(navTxt) ||
              /\b(open|pull up|bring up|launch|visit)\s+(?:the\s+|my\s+)?(?:page|tab|screen|view|dashboard|home|program|schedule|workout|live\s*workout|nutrition|food\s*log|macros|progress|photos|form\s*lab|formlab|heatmap|muscle\s*heatmap|profile|settings|plans?|pricing|billing|onboarding|setup|about|contact|support|terms|tos|privacy)\b/i.test(navTxt) ||
              /(?:^|[.!?;]\s*)(?:please\s+)?start\s+(?:my\s+|today'?s\s+)?(?:live\s+)?workout\b/i.test(navTxt);

            if (!hasExplicitNavVerb) {
              return false;
            }

            const ROUTE_KEYWORDS = {
              '/': /\b(dashboard|home|main\s*page|home\s*page|overview)\b/i,
              '/program': /\b(program|schedule|routine|weekly|plan)\b/i,
              '/live-workout': /\b(live\s*workout|workout|session|training|tracker|start)\b/i,
              '/nutrition': /\b(nutrition|food|macro|macros|calorie|calories|meal|diet)\b/i,
              '/progress': /\b(progress|analytics|stats|chart|graph|milestones?)\b/i,
              '/photos': /\b(photo|photos|weight|weigh|body\s*fat|physique)\b/i,
              '/formlab': /\b(form\s*lab|formlab|form\s*check|video|form|technique)\b/i,
              '/muscle-heatmap': /\b(heatmap|heat\s*map|muscle\s*map|muscles?|muscle\s*balance)\b/i,
              '/profile': /\b(profile|settings|account|plans?|pricing|subscription|upgrade|billing)\b/i,
              '/onboarding': /\b(onboarding|setup|wizard|new\s*program|create\s*program)\b/i,
              '/about': /\b(about|story|mission|what\s+is\s+washek)\b/i,
              '/contact': /\b(contact|support|help|email|reach\s+out)\b/i,
              '/terms': /\b(terms|tos|terms\s+of\s+service|legal|conditions)\b/i,
              '/privacy': /\b(privacy|privacy\s+policy|data\s+policy)\b/i,
              '/kael': /\b(kael|chat)\b/i,
            };

            if (/^\/program\/day\/\d+$/.test(baseRoute)) {
              return /\b(day|program|workout|schedule|session)\b/i.test(navTxt);
            }

            const matcher = ROUTE_KEYWORDS[baseRoute];
            return matcher ? matcher.test(navTxt) : true;
          };

          const isExplicitMutationAuthorized = (actionType) => {
            const txt = String(trimmed || '').trim().toLowerCase();
            if (!txt) return false;
            const negated = /\b(don't|do not|didn't|did not|not yet|never|stop)\s+(log|add|record|track|save|enter|mark|set)\b/i.test(txt);
            if (negated) return false;

            const isShortAffirmative =
              /^(yes|yeah|yep|yup|sure|ok|okay|please|please do|do it|go ahead|sounds good|confirm|log it|add it|mark it|yes please|sure thing|that works)[.!?\s]*$/i.test(txt) ||
              /\b(yes|yeah|yep|go ahead|please do|do it|log it|add it|mark it)\b/i.test(txt);

            if (actionType === 'log_food') {
              const explicitFoodCmd = /\b(log|add|record|track|save|put|enter)\b/i.test(txt);
              const prevAskedFood =
                prevAssistantContent.includes('?') &&
                (/\bfood log\b|\blog (that|it|this|them|the)\b|\badd (that|it|this)\b|\bwant me to log\b|\bwould you like me to log\b|\bshould i log\b/i.test(prevAssistantContent) ||
                  /\[ACTION:ask_log_food:/i.test(String(lastAssistant?.content || '')));
              return explicitFoodCmd || (isShortAffirmative && prevAskedFood);
            }

            if (actionType === 'log_rest_day') {
              const explicitRestCmd =
                /\b(mark|set|log|make|switch|change|turn)\b[\w\s]{0,24}\brest\s*day\b/i.test(txt) ||
                /\brest\s*day\b[\w\s]{0,24}\b(mark|set|log)\b/i.test(txt);
              const prevAskedRest =
                prevAssistantContent.includes('?') &&
                (/\brest day\b/i.test(prevAssistantContent) ||
                  /\[ACTION:ask_log_rest_day/i.test(String(lastAssistant?.content || '')));
              return explicitRestCmd || (isShortAffirmative && prevAskedRest);
            }

            return false;
          };

          for (const action of parsedActions) {
            if (action.type === 'go' && isExplicitNavigationAuthorized(action.route)) {
              executeKaelAction(action, { isAuto: true, messageId: temporaryId });
            } else if (
              (action.type === 'log_food' || action.type === 'log_rest_day') &&
              isExplicitMutationAuthorized(action.type)
            ) {
              executeKaelAction(action, { isAuto: true, messageId: temporaryId });
            }
          }
        }

        getServerMessageStats(timeZone)
          .then(
            (serverStats) => {
              if (serverStats) {
                setStats(
                  (prev) => {
                    if (
                      prev &&
                      typeof prev.used === 'number' &&
                      typeof serverStats.used === 'number' &&
                      serverStats.used < prev.used
                    ) {
                      return prev;
                    }
                    return serverStats;
                  }
                );
              }
            }
          )
          .catch(
            (statsError) => {
              console.error(
                '[KAEL] Failed to refresh usage after send:',
                statsError
              );
            }
          );

      } catch (error) {

        console.error(
          '[KAEL] Failed to send message:',
          error
        );

        const isLimitError =
          error?.message?.includes('monthly') ||
          error?.message?.includes('limit') ||
          error?.message?.includes('KAEL_LIMIT_REACHED');

        const errorMessageText = isLimitError
          ? 'You have reached your monthly message limit for Coach Kael. Upgrade your plan to continue chatting with advanced guidance.'
          : 'Sorry — I had trouble generating that response. Please try again.';

        kaelStore.failAssistantMessage(temporaryId, errorMessageText);

        if (isLimitError) {
          getServerMessageStats(timeZone).then((serverStats) => {
            if (serverStats) setStats(serverStats);
          }).catch(() => {});
        }

      } finally {

        typingCancelledRef.current =
          false;

        kaelStore.setSending(false);

        window.requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      }
    };


  /*
   * ==========================================================
   * KEYBOARD HANDLING
   * ==========================================================
   */

  const handleKeyDown =
    (event) => {

      if (
        event.key ===
          'Enter' &&
        !event.shiftKey
      ) {
        event.preventDefault();

        if (
          !loading &&
          input.trim()
        ) {
          sendMessage();
        }
      }
    };


  /*
   * ==========================================================
   * GREETING
   * ==========================================================
   */

  const greeting = {
    id:
      '_greeting',
    role:
      'assistant',
    content:
      `Hey${
        firstName
          ? `, ${firstName}`
          : ''
      }! I'm **Kael**, your coach. What do you need? 💪`,
  };


  return (
    <div className="
      flex
      flex-col
      w-full
      min-w-0
      overflow-x-hidden
      h-[calc(100vh-3rem)]
    ">

      {/* ======================================================
          HEADER
          ====================================================== */}

      <div className="
        px-4
        py-2.5
        safe-top-compact
        border-b
        border-border
        bg-card/60
        backdrop-blur-md
        flex-shrink-0
      ">

        <div className="
          flex
          items-center
          gap-2.5
        ">

          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="
              w-9
              h-9
              rounded-2xl
              bg-gradient-to-br
              from-primary/30
              to-primary/10
              flex
              items-center
              justify-center
              border
              border-primary/45
              shadow-[0_0_18px_rgba(37,99,235,0.4)]
            ">
              <Zap className="
                w-4
                h-4
                text-primary
              " />
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5"
              title="Kael Active"
            >
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent ring-2 ring-card" />
            </span>
          </div>


          {/* Title & Active Chat Selector Trigger */}
          <div className="min-w-0 flex-1">

            <div className="flex items-center gap-2">
              <h1 className="
                font-heading
                font-bold
                text-base
                leading-tight
              ">
                Kael
              </h1>

              <span className="text-[10px] font-semibold text-accent uppercase tracking-wider hidden xs:inline">
                · Performance Coach
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="
                group
                mt-0.5
                inline-flex
                items-center
                gap-1.5
                text-xs
                bg-muted/40
                hover:bg-muted/80
                px-2.5
                py-0.5
                rounded-md
                border
                border-border/80
                dark:border-white/[0.06]
                text-muted-foreground
                hover:text-foreground
                transition-all
                max-w-[200px]
                sm:max-w-xs
                truncate
              "
              title="Switch or view all conversations"
            >
              <MessagesSquare className="w-3 h-3 text-primary flex-shrink-0" />
              <span className="truncate font-medium text-foreground/90">
                {activeConversation?.title || 'Current Chat'}
              </span>
              <ChevronDown className="w-3 h-3 text-muted-foreground/70 group-hover:text-foreground flex-shrink-0 transition-transform" />
            </button>

          </div>


          {/* Header Action Buttons */}
          <div className="
            ml-auto
            flex
            items-center
            gap-1.5
            flex-shrink-0
          ">

            {/* "+ New Chat" Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNewChat}
              className="
                h-9
                px-2.5
                text-xs
                font-semibold
                rounded-xl
                border-primary/30
                hover:border-primary/60
                hover:bg-primary/10
                text-primary
                gap-1
              "
              title="Start a new chat (fresh memory)"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Chat</span>
            </Button>

            {/* Quota Indicator */}
            {displayStats && (
              <span
                className={cn(
                  `
                    text-[10px]
                    font-semibold
                    px-2
                    py-0.5
                    rounded-full
                    border
                  `,
                  atLimit
                    ? `
                      border-destructive/40
                      text-destructive
                      bg-destructive/10
                    `
                    : `
                      border-border
                      text-muted-foreground
                      bg-muted/50
                    `
                )}
              >
                {
                  displayStats.remaining
                }{' '}
                msg left
              </span>
            )}

          </div>

        </div>

      </div>


      {/* ======================================================
          MESSAGES
          ====================================================== */}

      <div className="
        flex-1
        min-w-0
        overflow-y-auto
        overflow-x-hidden
        px-4
        py-4
        space-y-4
      ">

        {activeMessages.length ===
          0 &&
          !loading && (
            <MessageBubble
              msg={
                greeting
              }
              isUser={
                false
              }
              userOrPlan={effectiveUser || plan}
            />
          )}


        {activeMessages.map(
          (message) => {

            const isTypingMessage =
              Boolean(message.isStreaming) ||
              String(
                message.id
              ).startsWith(
                '_typing_'
              );

            return (
              <div
                key={
                  message.id
                }
                className={cn(
                  'min-w-0 max-w-full',
                  isTypingMessage ? 'kael-typing-message' : undefined
                )}
              >

                <MessageBubble
                  msg={
                    message
                  }
                  isUser={
                    message.role ===
                    'user'
                  }
                  userOrPlan={effectiveUser || plan}
                  onAction={(action) =>
                    executeKaelAction(action, {
                      isAuto: false,
                      messageId: message.id,
                    })
                  }
                />

              </div>
            );
          }
        )}


        <div
          ref={
            bottomRef
          }
        />

      </div>


      {/* ======================================================
          LIMIT NOTICE
          ====================================================== */}

      {atLimit && (
          <div className="
            mx-4
            mb-2
            p-4
            rounded-2xl
            bg-destructive/10
            border
            border-destructive/30
            flex
            items-start
            gap-3
          ">

            <Lock className="
              w-4
              h-4
              text-destructive
              mt-0.5
              flex-shrink-0
            " />


            <div>

              <p className="
                text-sm
                font-semibold
                text-destructive
              ">
                Monthly limit reached
              </p>


              <p className="
                text-xs
                text-muted-foreground
                mt-0.5
              ">
                You've used all{' '}
                {
                  displayStats?.limit
                }{' '}
                messages this month.
                Upgrade your plan to keep
                chatting with Kael. Resets
                at the start of next month.
              </p>

            </div>

          </div>
        )}


      {/* ======================================================
          RESET NOTE
          ====================================================== */}

      {displayStats &&
        !atLimit && (
          <p className="
            text-[10px]
            text-muted-foreground
            text-center
            pb-1
            px-4
          ">
            {
              displayStats.remaining
            }{' '}
            of{' '}
            {
              displayStats.limit
            }{' '}
            messages left · resets monthly
          </p>
        )}


      {/* ======================================================
          INPUT
          ====================================================== */}

      <div className="
        px-4
        pt-2.5
        border-t
        border-border/90
        dark:border-white/[0.08]
        bg-card/95
        backdrop-blur-xl
        flex-shrink-0
        pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]
        sm:pb-4
      ">

        <div className="
          flex
          gap-2
          items-end
          w-full
          min-w-0
        ">

          <Textarea
            ref={
              inputRef
            }
            value={
              input
            }
            onChange={
              (event) =>
                setInput(
                  event.target.value
                )
            }
            onKeyDown={
              handleKeyDown
            }
            placeholder={
              atLimit
                ? 'Upgrade to keep chatting…'
                : 'Ask Kael anything…'
            }
            disabled={
              atLimit ||
              loading
            }
            className="
              flex-1
              min-w-0
              w-full
              min-h-[46px]
              max-h-32
              resize-none
              rounded-2xl
              border-border/90
              dark:border-white/[0.08]
              bg-background
              focus-visible:border-primary/50
              focus-visible:ring-1
              focus-visible:ring-primary/30
              text-sm
              py-3
              px-4
              shadow-inner
              [overflow-wrap:anywhere]
              [word-break:break-word]
            "
            rows={1}
          />

          <Button
            type="button"
            size="icon"
            className="
              h-11
              w-11
              rounded-2xl
              bg-gradient-to-r
              from-primary
              to-blue-600
              hover:from-primary/95
              hover:to-blue-600/95
              text-white
              shadow-[0_0_20px_rgba(37,99,235,0.45)]
              hover:shadow-[0_0_28px_rgba(37,99,235,0.65)]
              disabled:opacity-40
              disabled:shadow-none
              flex-shrink-0
              transition-all
            "
            disabled={
              !input.trim() ||
              loading ||
              atLimit
            }
            onClick={
              () => sendMessage()
            }
          >

            <Send className="w-4 h-4" />

          </Button>

        </div>

      </div>

      {/* ======================================================
          CONVERSATIONS DRAWER (SHEET)
          ====================================================== */}
      <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <SheetContent
          side="left"
          className={cn(
            "kael-conversation-dropdown-container w-[88vw] sm:w-[380px] p-0 flex flex-col bg-background/95 backdrop-blur-xl border-r border-border",
            isHistoryOpen && "kael-conversation-dropdown-active active pt-safe-dropdown"
          )}
        >
          <SheetHeader className="p-4 pb-3 safe-sheet-header border-b border-border">
            <div className="flex items-center gap-2">
              <MessagesSquare className="w-5 h-5 text-primary" />
              <SheetTitle className="text-base font-bold">Your Conversations</SheetTitle>
            </div>
            <SheetDescription className="text-xs text-muted-foreground text-left">
              Each chat maintains its own dedicated memory so Kael stays accurately focused on that specific topic.
            </SheetDescription>
            <div className="pt-2">
              <Button
                type="button"
                onClick={handleNewChat}
                className="w-full h-9 rounded-xl font-heading font-semibold text-xs gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Start New Chat
              </Button>
            </div>
          </SheetHeader>

          {/* List of Chats */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
            {conversations.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                No conversations yet.
              </div>
            ) : (
              conversations.map((chat) => {
                const isActive = chat.id === activeChatId;
                const isEditing = editingChatId === chat.id;

                return (
                  <div
                    key={chat.id}
                    className={cn(
                      'group relative rounded-xl border p-3 transition-all cursor-pointer text-left',
                      isActive
                        ? 'bg-primary/10 border-primary/50 text-foreground'
                        : 'bg-card/50 hover:bg-muted/60 border-border/60 hover:border-border text-foreground/80'
                    )}
                    onClick={() => {
                      if (!isEditing) {
                        handleSelectChat(chat.id);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      {isEditing ? (
                        <div
                          className="flex items-center gap-1.5 flex-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleRenameChat(chat.id, editingTitle);
                              } else if (e.key === 'Escape') {
                                setEditingChatId(null);
                              }
                            }}
                            className="w-full bg-background border border-primary/50 rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameChat(chat.id, editingTitle)}
                            className="p-1 hover:text-primary rounded text-foreground"
                            title="Save"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingChatId(null)}
                            className="p-1 hover:text-destructive rounded text-muted-foreground"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-heading font-semibold text-xs truncate">
                              {chat.title || 'Untitled Chat'}
                            </span>
                            {isActive && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-primary px-1.5 py-0.2 rounded-full bg-primary/20">
                                Active
                              </span>
                            )}
                          </div>
                          {chat.last_message && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {chat.last_message}
                            </p>
                          )}
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground/70">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{formatRelativeTime(chat.updated_at || chat.created_at)}</span>
                          </div>
                        </div>
                      )}

                      {!isEditing && (
                        <div
                          className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setEditingChatId(chat.id);
                              setEditingTitle(chat.title || '');
                            }}
                            className="p-1 hover:text-foreground text-muted-foreground rounded transition-colors"
                            title="Rename chat"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmChatId(chat.id)}
                            className="p-1 hover:text-destructive text-muted-foreground rounded transition-colors"
                            title="Delete chat"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ======================================================
          DELETE CHAT CONFIRMATION DIALOG
          ====================================================== */}
      <AlertDialog
        open={Boolean(deleteConfirmChatId)}
        onOpenChange={(open) => !open && setDeleteConfirmChatId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the messages in this chat. Kael's memory for this conversation will be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmChatId) {
                  handleDeleteChat(deleteConfirmChatId);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
