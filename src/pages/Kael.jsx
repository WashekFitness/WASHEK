import {
  useState,
  useEffect,
  useRef,
  useMemo,
} from 'react';

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
  computeStats,
  getCurrentMonthKey,
  claimMessage,
} from '@/lib/messageLimit';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useMidnightSync } from '@/hooks/useMidnightSync';
import { getUserTimeZone } from '@/lib/dateUtils';

import {
  useAppSettings,
} from '@/lib/AppSettingsContext';

import {
  getKaelSystemPrompt,
} from '@/lib/trainingTypes';

import MessageBubble from '@/components/kael/MessageBubble';


const CONTEXT_MESSAGE_COUNT = 30;

const STORAGE_CHATS_PREFIX = 'washek_kael_chats_';
const STORAGE_ACTIVE_PREFIX = 'washek_kael_active_chat_';
const STORAGE_DELETED_CHATS_PREFIX = 'washek_kael_deleted_chats_';

function getDeletedChatIds(userId) {
  if (!userId) return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_DELETED_CHATS_PREFIX + userId);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {
    // fallback
  }
  return new Set();
}

function recordDeletedChatId(userId, chatId) {
  if (!userId || !chatId) return;
  try {
    const set = getDeletedChatIds(userId);
    set.add(chatId);
    localStorage.setItem(STORAGE_DELETED_CHATS_PREFIX + userId, JSON.stringify(Array.from(set)));
  } catch {
    // fallback
  }
}

function getMessageChatId(message) {
  if (!message) return 'chat_initial';
  const val = message.created_by;
  if (typeof val === 'string' && val.startsWith('chat_')) {
    return val;
  }
  return 'chat_initial';
}

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

function generateChatTitle(content) {
  if (!content) return 'New Chat';
  const clean = content.replace(/[#*`_~]/g, '').trim().split('\n')[0].trim();
  if (!clean) return 'New Chat';
  if (clean.length > 34) {
    return clean.slice(0, 33) + '…';
  }
  return clean;
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
  const {
    settings,
  } = useAppSettings();

  const [
    user,
    setUser,
  ] = useState(null);

  const [
    messages,
    setMessages,
  ] = useState([]);

  const [
    conversations,
    setConversations,
  ] = useState([]);

  const [
    activeChatId,
    setActiveChatId,
  ] = useState(null);

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
    loading,
    setLoading,
  ] = useState(false);

  const [
    stats,
    setStats,
  ] = useState(() => {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('washek_user') : null;
      if (stored) {
        const u = JSON.parse(stored);
        return computeStats(u, u?.subscription_plan || 'free');
      }
    } catch (_initErr) {
      // Storage read fallback
    }
    return null;
  });

  const { user: authUser, setUser: setAuthUser } = useAuth() || {};
  const effectiveUser = user || authUser;

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
      .me()
      .then((u) => {
        if (!active) {
          return;
        }

        const loadedUser = u || authUser;
        if (loadedUser) {
          setUser(loadedUser);
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
  }, [timeZone, authUser]);

  // Real-time listener for quota updates dispatched anywhere in the app
  useEffect(() => {
    const handleQuotaUpdate = (e) => {
      if (e?.detail) {
        setStats(e.detail);
      }
    };

    window.addEventListener('kael-quota-updated', handleQuotaUpdate);
    return () => {
      window.removeEventListener('kael-quota-updated', handleQuotaUpdate);
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
   * LOAD CHAT HISTORY & CONVERSATION THREADS
   * ==========================================================
   */

  useEffect(() => {
    const currentUserId = user?.id || authUser?.id || 'guest';
    let active = true;

    const deletedIds = getDeletedChatIds(currentUserId);

    // 1. Read cached conversation threads from localStorage
    let cachedChats = [];
    try {
      const raw = localStorage.getItem(STORAGE_CHATS_PREFIX + currentUserId);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          cachedChats = parsed.filter((c) => c && c.id && !deletedIds.has(c.id));
        }
      }
    } catch (e) {
      console.warn('[KAEL] Failed to parse cached chats:', e);
    }

    const savedActiveId = localStorage.getItem(STORAGE_ACTIVE_PREFIX + currentUserId);

    supabaseApi.entities.KaelMessage
      .filter(
        {},
        'created_at',
        1000
      )
      .then((msgs) => {
        if (!active) {
          return;
        }

        const normalizedMessages =
          Array.isArray(msgs)
            ? msgs
                .map((message) => ({
                  ...message,
                  created_date:
                    message.created_date ||
                    message.created_at ||
                    message.createdAt ||
                    null,
                  created_by: message.created_by || 'chat_initial',
                }))
                .sort(
                  (a, b) =>
                    new Date(
                      a.created_date ||
                        0
                    ).getTime() -
                    new Date(
                      b.created_date ||
                        0
                    ).getTime()
                )
            : [];

        // 2. Discover chats from messages and merge with cached threads
        const chatMap = new Map();
        cachedChats
          .filter((c) => c && c.id && !deletedIds.has(c.id))
          .forEach((c) => {
            chatMap.set(c.id, { ...c });
          });

        // Filter out messages belonging to deleted chats
        const validMessages = normalizedMessages.filter((m) => {
          const k = getMessageChatId(m);
          return !deletedIds.has(k);
        });

        // Group messages by chat
        const messagesByChat = new Map();
        validMessages.forEach((m) => {
          const k = getMessageChatId(m);
          if (!messagesByChat.has(k)) messagesByChat.set(k, []);
          messagesByChat.get(k).push(m);
        });

        messagesByChat.forEach((chatMsgs, chatId) => {
          const existing = chatMap.get(chatId);
          const firstUserMsg = chatMsgs.find((m) => m.role === 'user');
          const lastMsg = chatMsgs[chatMsgs.length - 1];
          const inferredTitle =
            chatId === 'chat_initial'
              ? 'General Coaching'
              : firstUserMsg
                ? generateChatTitle(firstUserMsg.content)
                : 'Chat';

          if (!existing) {
            chatMap.set(chatId, {
              id: chatId,
              title: inferredTitle,
              created_at: chatMsgs[0]?.created_date || new Date().toISOString(),
              updated_at: lastMsg?.created_date || new Date().toISOString(),
              last_message: (lastMsg?.content || '').slice(0, 80),
            });
          } else {
            if (!existing.last_message && lastMsg) {
              existing.last_message = (lastMsg.content || '').slice(0, 80);
            }
            if ((!existing.title || existing.title === 'New Chat') && firstUserMsg) {
              existing.title = generateChatTitle(firstUserMsg.content);
            }
          }
        });

        let mergedChats = Array.from(chatMap.values());

        // If no conversations exist anywhere, initialize a fresh one
        if (mergedChats.length === 0) {
          const freshChat = {
            id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            title: 'New Chat',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_message: '',
          };
          mergedChats = [freshChat];
        }

        // Sort chats by most recently updated
        mergedChats.sort(
          (a, b) =>
            new Date(b.updated_at || b.created_at || 0).getTime() -
            new Date(a.updated_at || a.created_at || 0).getTime()
        );

        // Pick active chat
        let selectedChatId = mergedChats[0].id;
        if (savedActiveId && mergedChats.some((c) => c.id === savedActiveId)) {
          selectedChatId = savedActiveId;
        }

        setConversations(mergedChats);
        setActiveChatId(selectedChatId);
        setMessages(validMessages);

        const currentUserId = user?.id || authUser?.id || 'guest';
        localStorage.setItem(STORAGE_CHATS_PREFIX + currentUserId, JSON.stringify(mergedChats));
        localStorage.setItem(STORAGE_ACTIVE_PREFIX + currentUserId, selectedChatId);
      })
      .catch((error) => {
        console.error(
          '[KAEL] Failed to load conversation:',
          error
        );

        if (cachedChats.length > 0) {
          setConversations(cachedChats);
          const pick = savedActiveId && cachedChats.some((c) => c.id === savedActiveId)
            ? savedActiveId
            : cachedChats[0].id;
          setActiveChatId(pick);
        } else {
          const freshChat = {
            id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            title: 'New Chat',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_message: '',
          };
          setConversations([freshChat]);
          setActiveChatId(freshChat.id);
        }
      });

    return () => {
      active = false;
    };
  }, [
    user?.id,
  ]);


  /*
   * ==========================================================
   * CONVERSATION ACTIONS
   * ==========================================================
   */

  const handleNewChat = () => {
    typingCancelledRef.current = true;
    setLoading(false);

    const newChat = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: 'New Chat',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_message: '',
    };

    const currentUserId = user?.id || authUser?.id || 'guest';

    setConversations((prev) => {
      const next = [newChat, ...prev];
      localStorage.setItem(STORAGE_CHATS_PREFIX + currentUserId, JSON.stringify(next));
      return next;
    });

    setActiveChatId(newChat.id);
    localStorage.setItem(STORAGE_ACTIVE_PREFIX + currentUserId, newChat.id);
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
    const currentUserId = user?.id || authUser?.id || 'guest';
    typingCancelledRef.current = true;
    setLoading(false);
    setActiveChatId(chatId);
    localStorage.setItem(STORAGE_ACTIVE_PREFIX + currentUserId, chatId);
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

    const userId = effectiveUser?.id || user?.id || authUser?.id;

    // 1. Immediately record in deleted blacklist so it is never re-discovered
    if (userId) {
      recordDeletedChatId(userId, chatId);
    }

    // 2. Remove only messages belonging to this chat from in-memory state
    setMessages((prev) => prev.filter((m) => getMessageChatId(m) !== chatId));

    // 3. Atomically remove ONLY this chat from conversations
    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== chatId);

      if (remaining.length > 0) {
        if (userId) {
          localStorage.setItem(STORAGE_CHATS_PREFIX + userId, JSON.stringify(remaining));
        }
        // If the chat being deleted was the active one, switch to the first remaining chat
        if (activeChatId === chatId) {
          const nextActiveId = remaining[0].id;
          setActiveChatId(nextActiveId);
          if (userId) {
            localStorage.setItem(STORAGE_ACTIVE_PREFIX + userId, nextActiveId);
          }
        }
        return remaining;
      }

      // ONLY if there are no remaining chats at all, create a single new empty conversation
      const freshChat = {
        id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: 'New Chat',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_message: '',
      };
      if (userId) {
        localStorage.setItem(STORAGE_CHATS_PREFIX + userId, JSON.stringify([freshChat]));
        localStorage.setItem(STORAGE_ACTIVE_PREFIX + userId, freshChat.id);
      }
      setActiveChatId(freshChat.id);
      return [freshChat];
    });

    // 4. Delete only this chat's messages from Supabase
    try {
      await supabaseApi.entities.KaelMessage.deleteChat(chatId);
    } catch (err) {
      console.warn('[KAEL] Could not delete chat messages from database:', err);
    }

    setDeleteConfirmChatId(null);
  };

  const handleRenameChat = (chatId, newTitle) => {
    const cleanTitle = (newTitle || '').trim() || 'Chat';
    const currentUserId = user?.id || authUser?.id || 'guest';
    setConversations((prev) => {
      const next = prev.map((c) =>
        c.id === chatId ? { ...c, title: cleanTitle } : c
      );
      localStorage.setItem(STORAGE_CHATS_PREFIX + currentUserId, JSON.stringify(next));
      return next;
    });
    setEditingChatId(null);
  };


  /*
   * ==========================================================
   * KEEP BOTTOM VISIBLE
   * ==========================================================
   */

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
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

  const plan =
    effectiveUser?.subscription_plan ||
    'free';

  const effectiveTz = timeZone || getUserTimeZone(effectiveUser);

  const displayStats =
    stats ||
    computeStats(
      effectiveUser,
      plan,
      effectiveTz
    );

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
    user?.first_name ||
    user?.full_name?.split(
      ' '
    )[0] ||
    '';


  /*
   * ==========================================================
   * BUILD KAEL PROMPT
   * ==========================================================
   */

  const buildPrompt = (
    history
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


    return `${getKaelSystemPrompt(
      trainingType,
      firstName,
      plan
    )}${responseDepthInstruction}${langInstruction}\n\nCONVERSATION HISTORY (remember what the user has told you about their capabilities, limitations, and preferences — update your understanding if they say something new or different):\n${recentHistory}\n\nKael:`;
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


        setMessages(
          (current) =>
            current.map(
              (message) =>
                message.id ===
                temporaryId
                  ? {
                      ...message,
                      content:
                        visibleText,
                    }
                  : message
            )
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
    async () => {

      const trimmed =
        input.trim();


      if (
        !trimmed ||
        loading ||
        atLimit
      ) {
        return;
      }


      typingCancelledRef.current =
        true;

      let currentChatId = activeChatId;
      if (!currentChatId) {
        currentChatId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        setActiveChatId(currentChatId);
        const newChat = {
          id: currentChatId,
          title: generateChatTitle(trimmed),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_message: '',
        };
        setConversations((prev) => [newChat, ...prev]);
        if (user?.id) {
          localStorage.setItem(STORAGE_ACTIVE_PREFIX + user.id, currentChatId);
        }
      }

      // Memory is strictly scoped to this active conversation thread
      const previousMessages =
        [...activeMessages];

      const userMessage = {
        id:
          `_user_${Date.now()}`,
        role:
          'user',
        content:
          trimmed,
        created_date:
          new Date().toISOString(),
        created_by:
          currentChatId,
      };

      const temporaryId =
        `_typing_${Date.now()}`;

      const temporaryMessage = {
        id:
          temporaryId,
        role:
          'assistant',
        content:
          '',
        created_date:
          new Date().toISOString(),
        created_by:
          currentChatId,
      };

      setMessages(
        [
          ...messages,
          userMessage,
          temporaryMessage,
        ]
      );

      setInput('');
      setLoading(true);

      try {
        const prompt =
          buildPrompt(
            [
              ...previousMessages,
              userMessage,
            ]
          );

        /*
         * SERVER-SIDE QUOTA ENFORCEMENT
         *
         * The ai-generate Edge Function itself claims the
         * monthly Kael message slot (via the atomic
         * claim_kael_message() database function) before it
         * ever contacts the AI provider. This happens
         * server-side regardless of what the browser sends, so
         * it cannot be skipped or bypassed by calling the Edge
         * Function directly.
         */
        const result =
          await supabaseApi.ai.invoke(
            {
              prompt,
              type:
                'kael',
              plan:
                plan ||
                'free',
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
          typeof result ===
          'string'
            ? result
            : result?.content ||
              result?.response ||
              result?.text ||
              result?.message ||
              '';

        if (!responseText) {
          throw new Error(
            'Kael returned an empty response.'
          );
        }

        /*
         * COUNTDOWN & SYNC AS KAEL RESPONDS
         *
         * Deduct the message quota immediately as Coach Kael responds so
         * the displayed remaining message count counts down in real-time.
         * Keep stats, AuthContext, localStorage, and profiles in sync.
         */
        const currentLimit = displayStats?.limit || 100;
        const currentUsed = typeof displayStats?.used === 'number' ? displayStats.used : 0;
        const serverUsed = result?.quota && typeof result.quota.used === 'number' ? result.quota.used : null;
        const newUsed = serverUsed !== null ? serverUsed : currentUsed + 1;
        const newRemaining = Math.max(0, currentLimit - newUsed);
        const currentMonthKey = displayStats?.monthKey || getCurrentMonthKey(new Date(), effectiveTz);

        const updatedQuota = {
          allowed: newRemaining > 0,
          used: newUsed,
          limit: currentLimit,
          remaining: newRemaining,
          monthKey: currentMonthKey,
          plan: plan || 'free',
          timezone: effectiveTz,
        };

        // 1. Immediately update UI state so remaining count decrements as Kael responds
        setStats(updatedQuota);

        // 2. Broadcast quota change across the application (Profile, etc.)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('kael-quota-updated', { detail: updatedQuota })
          );
        }

        // 3. Keep local and global user profiles in sync
        const syncProfile = (prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            kael_msg_count: newUsed,
            kael_msg_month: currentMonthKey,
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
        if (userIdToSync) {
          supabase
            .from('profiles')
            .update({
              kael_msg_count: newUsed,
              kael_msg_month: currentMonthKey,
              timezone: effectiveTz,
            })
            .eq('id', userIdToSync)
            .then(() => {})
            .catch((err) => {
              console.warn('[KAEL] Background profile count sync:', err);
            });
        }

        await typeAssistantResponse(
          responseText,
          temporaryId
        );

        typingCancelledRef.current =
          false;

        /*
         * Refresh the displayed remaining-message count from
         * the same server-authoritative source used to enforce
         * it. The count is guarded from regressing to an older/lower used value.
         */
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

        // Update conversation title and last message preview
        setConversations((prev) => {
          const next = prev.map((c) => {
            if (c.id === currentChatId) {
              const needsTitle = !c.title || c.title === 'New Chat';
              return {
                ...c,
                title: needsTitle ? generateChatTitle(trimmed) : c.title,
                updated_at: new Date().toISOString(),
                last_message: responseText.slice(0, 100),
              };
            }
            return c;
          });
          next.sort(
            (a, b) =>
              new Date(b.updated_at || b.created_at || 0).getTime() -
              new Date(a.updated_at || a.created_at || 0).getTime()
          );
          const currentUserId = user?.id || authUser?.id || 'guest';
          localStorage.setItem(STORAGE_CHATS_PREFIX + currentUserId, JSON.stringify(next));
          return next;
        });

        try {
          await supabaseApi.entities.KaelMessage.create(
            {
              role:
                'user',
              content:
                trimmed,
              created_at:
                userMessage.created_date,
              created_by:
                currentChatId,
            }
          );

          await supabaseApi.entities.KaelMessage.create(
            {
              role:
                'assistant',
              content:
                responseText,
              created_at:
                new Date().toISOString(),
              created_by:
                currentChatId,
            }
          );
        } catch (saveError) {
          console.warn(
            '[KAEL] Conversation save note:',
            saveError
          );
        }

      } catch (error) {

        console.error(
          '[KAEL] Failed to send message:',
          error
        );

        setMessages(
          (current) =>
            current.filter(
              (message) =>
                message.id !==
                temporaryId
            )
        );

        const isLimitError =
          error?.message?.includes('monthly') ||
          error?.message?.includes('limit') ||
          error?.message?.includes('KAEL_LIMIT_REACHED');

        const errorMessageText = isLimitError
          ? 'You have reached your monthly message limit for Coach Kael. Upgrade your plan to continue chatting with advanced guidance.'
          : 'Sorry — I had trouble generating that response. Please try again.';

        setMessages(
          (current) => [
            ...current,
            {
              id:
                `_error_${Date.now()}`,
              role:
                'assistant',
              content:
                errorMessageText,
              created_date:
                new Date().toISOString(),
              created_by:
                currentChatId,
            },
          ]
        );

        if (isLimitError) {
          getServerMessageStats(timeZone).then((serverStats) => {
            if (serverStats) setStats(serverStats);
          }).catch(() => {});
        }

      } finally {

        typingCancelledRef.current =
          false;

        setLoading(false);

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
              from-primary/25
              to-primary/10
              flex
              items-center
              justify-center
              border
              border-primary/30
              shadow-sm
              shadow-primary/20
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
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
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
                · AI Performance Coach
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
            gap-2
            flex-shrink-0
          ">

            {/* "+ New Chat" Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNewChat}
              className="
                h-8
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
        overflow-y-auto
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
            />
          )}


        {activeMessages.map(
          (message) => {

            const isTypingMessage =
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
                className={
                  isTypingMessage
                    ? 'kael-typing-message'
                    : undefined
                }
              >

                <MessageBubble
                  msg={
                    message
                  }
                  isUser={
                    message.role ===
                    'user'
                  }
                />

              </div>
            );
          }
        )}


        {/* Waiting for the AI before text starts appearing */}

        {loading &&
          !activeMessages.some(
            (message) =>
              String(
                message.id
              ).startsWith(
                '_typing_'
              )
          ) && (
            <div className="
              flex
              justify-start
            ">

              <div className="
                w-7
                h-7
                rounded-xl
                bg-primary/15
                flex
                items-center
                justify-center
                mr-2
                flex-shrink-0
                mt-0.5
              ">

                <Zap className="
                  w-3.5
                  h-3.5
                  text-primary
                " />

              </div>


              <div className="
                bg-card
                border
                border-border
                rounded-2xl
                rounded-tl-sm
                px-4
                py-3
              ">

                <div className="
                  flex
                  gap-1.5
                  items-center
                  h-5
                ">

                  <div className="
                    w-1.5
                    h-1.5
                    bg-muted-foreground/60
                    rounded-full
                    animate-bounce
                  " />


                  <div className="
                    w-1.5
                    h-1.5
                    bg-muted-foreground/60
                    rounded-full
                    animate-bounce
                    [animation-delay:150ms]
                  " />


                  <div className="
                    w-1.5
                    h-1.5
                    bg-muted-foreground/60
                    rounded-full
                    animate-bounce
                    [animation-delay:300ms]
                  " />

                </div>

              </div>

            </div>
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
                : 'Ask Kael anything about training or nutrition…'
            }
            disabled={
              atLimit ||
              loading
            }
            className="
              flex-1
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
              shadow-md
              shadow-primary/25
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
              sendMessage
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
