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
} from '@/lib/messageLimit';

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

const TYPEWRITER_MIN_DELAY = 3;
const TYPEWRITER_MAX_DELAY = 16;

const TYPEWRITER_MAX_DURATION = 4200;


/*
 * Calculate a typing delay based on plan and text length.
 *
 * Higher plans reveal responses faster while still keeping
 * enough pacing that the answer remains easy to read.
 */

function getTypingDelay(
  textLength,
  plan = 'free'
) {
  const planDelay =
    plan === 'elite'
      ? 4
      : plan === 'performance'
        ? 6
        : plan === 'progress'
          ? 8
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
      3,
      planDelay - 1
    );
  }

  return Math.max(
    3,
    planDelay - 2
  );
}


/*
 * Split text into very small chunks.
 *
 * We use chunks rather than literally one character per render,
 * because rendering every single character can make mobile
 * devices feel sluggish.
 */

function getTypingChunkSize(
  textLength
) {
  if (
    textLength <= 150
  ) {
    return 1;
  }

  if (
    textLength <= 400
  ) {
    return 2;
  }

  if (
    textLength <= 900
  ) {
    return 3;
  }

  return 4;
}


/*
 * Small natural pauses after punctuation.
 * These make the response feel more like deliberate typing.
 */

function getPunctuationPause(
  character
) {
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
   * LOAD USER
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

        setUser(u);

        getServerMessageStats()
          .then((serverStats) => {
            if (active) {
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
      });

    return () => {
      active = false;
    };
  }, []);


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
    user?.subscription_plan ||
    'free';


  const atLimit =
    stats
      ? stats.remaining === 0
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
     * Response length increases by plan, but accuracy,
     * reasoning quality, and safety standards remain the same.
     */

    const responseDepthInstruction =
      plan === 'elite'
        ? `\n\nRESPONSE DEPTH — ELITE: Give the most complete useful coaching answer. Usually aim for roughly 120–220 words when the question genuinely benefits from detail, but do not pad short/simple answers. Explain the key reasoning, practical application, important nuances, and relevant next steps. Use short bullets when they improve clarity. Never sacrifice accuracy, safety, or necessary context just to hit a word target.`
        : plan === 'performance'
          ? `\n\nRESPONSE DEPTH — PERFORMANCE: Give a moderately detailed coaching answer. Usually aim for roughly 90–160 words when the question genuinely benefits from detail, but do not pad short/simple answers. Include useful reasoning, practical application, and important details without becoming repetitive. Never sacrifice accuracy, safety, or necessary context just to hit a word target.`
          : plan === 'progress'
            ? `\n\nRESPONSE DEPTH — PROGRESS: Give a concise but meaningfully explained coaching answer. Usually aim for roughly 60–120 words when the question genuinely benefits from detail, but do not pad short/simple answers. Give the recommendation plus the most useful explanation or application detail. Never sacrifice accuracy, safety, or necessary context just to hit a word target.`
            : `\n\nRESPONSE DEPTH — FREE: Keep responses concise and direct. Usually aim for roughly 40–80 words when the question genuinely benefits from more than a one-sentence answer. Give the correct recommendation and only the most useful supporting detail. Do not add filler, long introductions, repeated conclusions, or unnecessary background. IMPORTANT: Free users must receive the same level of accuracy, careful reasoning, safety standards, and quality of recommendation as paid users. Shorter does NOT mean less intelligent or less accurate. If extra context is necessary to avoid a misleading or unsafe answer, include it even when it makes the response longer than the target.`;


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
      isElite
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
       * Keep the complete visual typing animation under roughly
       * 4.2 seconds for normal responses.
       */

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
          textLength
        );


      /*
       * Safety adjustment:
       * never allow the typewriter to become excessively slow
       * on a long response.
       */

      const estimatedDuration =
        Math.ceil(
          textLength /
            chunkSize
        ) *
          baseDelay;


      const speedMultiplier =
        estimatedDuration >
        TYPEWRITER_MAX_DURATION
          ? TYPEWRITER_MAX_DURATION /
            estimatedDuration
          : 1;


      const delay = Math.max(
        2,
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
            lastCharacter
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
        getServerMessageStats()
          .then(
            (serverStats) => {
              setStats(
                serverStats
              );
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


        /*
         * The server quota was already claimed before the AI call.
         * Do not increment usage from the browser.
         */

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


        setMessages(
          (current) => [
            ...current,
            {
              id:
                `_error_${Date.now()}`,
              role:
                'assistant',
              content:
                'Sorry — I had trouble generating that response. Please try again.',
              created_date:
                new Date().toISOString(),
            },
          ]
        );

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


            {stats && (
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
                  stats.remaining
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
                  stats?.limit
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

      {stats &&
        !atLimit && (
          <p className="
            text-[10px]
            text-muted-foreground
            text-center
            pb-1
            px-4
          ">
            {
              stats.remaining
            }{' '}
            of{' '}
            {
              stats.limit
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
