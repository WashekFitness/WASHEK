import {
  useState,
  useEffect,
  useRef,
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
} from 'lucide-react';

import {
  cn,
} from '@/lib/utils';

import {
  getServerMessageStats,
  computeStats,
} from '@/lib/messageLimit';
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
  ] = useState(null);

  const { user: authUser } = useAuth() || {};
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
   * LOAD CHAT HISTORY
   * ==========================================================
   *
   * IMPORTANT:
   *
   * Kael messages are stored in Supabase using created_at.
   * The generic entity layer automatically scopes these records
   * to the signed-in user's user_id.
   *
   * Load the full recent stored conversation, normalize the
   * timestamp field for the UI, and then sort oldest -> newest
   * so the conversation appears in the correct order.
   */

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    let active = true;

    supabaseApi.entities.KaelMessage
      .filter(
        {},
        'created_at',
        500
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

        setMessages(
          normalizedMessages
        );
      })
      .catch((error) => {
        console.error(
          '[KAEL] Failed to load conversation:',
          error
        );
      });

    return () => {
      active = false;
    };
  }, [
    user?.id,
  ]);


  /*
   * ==========================================================
   * KEEP BOTTOM VISIBLE
   * ==========================================================
   *
   * The previous version only watched messages.length, which
   * meant the screen would not necessarily follow Kael while
   * text was being revealed.
   *
   * Now we also watch the actual latest message content.
   */

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [
    messages.length,
    loading,
    messages[
      messages.length - 1
    ]?.content,
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
     */

    const responseDepthInstruction =
      plan === 'elite'
        ? `\n\nRESPONSE DEPTH & INTELLIGENCE — ELITE: Provide the ultimate masterclass coaching answer (roughly 180–320 words when the question benefits from depth, or concise when a direct answer is best). Break down the exact biomechanics and kinetic chain, include at least one '🔐 Elite tip:' or '⚡ Secret:' with insider coaching nuance, and include '🛡️ Elite recovery:' or '🔋 Recovery call:' guidance when fatigue/rest is relevant. Never sacrifice accuracy, safety, or necessary context.`
        : plan === 'performance'
          ? `\n\nRESPONSE DEPTH & INTELLIGENCE — PERFORMANCE: Provide an advanced, highly detailed coaching answer (roughly 130–200 words when the question benefits from depth). Break down movement tempo (concentric/eccentric cadence), neuromuscular activation cues, exercise synergy, and practical performance tips. Never sacrifice accuracy, safety, or necessary context.`
          : plan === 'progress'
            ? `\n\nRESPONSE DEPTH & INTELLIGENCE — PROGRESS: Provide a smart, well-explained coaching answer (roughly 80–140 words when the question benefits from depth). Provide the exact recommendation, the biomechanical 'why' behind it, and clear actionable progression steps. Never sacrifice accuracy, safety, or necessary context.`
            : `\n\nRESPONSE DEPTH & INTELLIGENCE — FREE: Keep responses concise and direct (roughly 40–80 words). Provide the 100% accurate recommendation, essential execution cue, and immediate next action without filler or long introductions. Remember: Free users receive the exact same 100% scientific and safety accuracy, delivered concisely.`;


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


      const previousMessages =
        [...messages];


      const userMessage = {
        id:
          `_user_${Date.now()}`,
        role:
          'user',
        content:
          trimmed,
        created_date:
          new Date().toISOString(),
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


        if (result?.quota) {
          setStats(result.quota);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('kael-quota-updated', { detail: result.quota })
            );
          }
        }

        if (!responseText) {
          throw new Error(
            'Kael returned an empty response.'
          );
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
         * it. The browser never sets this value itself.
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

        try {
          await supabaseApi.entities.KaelMessage.create(
            {
              role:
                'user',
              content:
                trimmed,
              created_at:
                userMessage.created_date,
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
            }
          );
        } catch (saveError) {
          console.error(
            '[KAEL] Failed to save conversation:',
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
        px-5
        pb-3
        border-b
        border-border
        bg-card/50
        backdrop-blur-sm
        flex-shrink-0
      ">

        <div className="
          flex
          items-center
          gap-3
        ">

          <div className="
            w-10
            h-10
            rounded-2xl
            bg-primary/15
            flex
            items-center
            justify-center
            border
            border-primary/20
          ">

            <Zap className="
              w-5
              h-5
              text-primary
            " />

          </div>


          <div>

            <h1 className="
              font-heading
              font-bold
              text-lg
              leading-tight
            ">
              Kael
            </h1>

            <p className="
              text-xs
              text-muted-foreground
            ">
              AI Fitness Coach · Available anytime
            </p>

          </div>


          <div className="
            ml-auto
            flex
            items-center
            gap-2
          ">

            <div className="
              w-2
              h-2
              rounded-full
              bg-accent
              animate-pulse
            " />


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

        {messages.length ===
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


        {messages.map(
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
          !messages.some(
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
        pt-2
        border-t
        border-border
        bg-card/50
        backdrop-blur-sm
        flex-shrink-0
        pb-[calc(6rem_+_env(safe-area-inset-bottom))]
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
                : 'Ask Kael anything…'
            }
            disabled={
              atLimit ||
              loading
            }
            className="
              flex-1
              min-h-[44px]
              max-h-32
              resize-none
              rounded-2xl
              border-border
              bg-muted/50
              text-sm
              py-3
              px-4
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
              flex-shrink-0
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

    </div>
  );
}
