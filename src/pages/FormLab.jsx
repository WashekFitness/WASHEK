import {
  useState,
  useEffect,
  useRef,
} from 'react';

import {
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import {
  supabaseApi,
} from '@/lib/supabaseApi';

import {
  Button,
} from '@/components/ui/button';

import {
  Card,
} from '@/components/ui/card';

import {
  Crown,
  Eye,
  Sparkles,
  Video,
  Scissors,
  RotateCcw,
  Loader2,
  AlertCircle,
} from 'lucide-react';

import VideoInput from '@/components/formlab/VideoInput';

import AnalysisResults from '@/components/formlab/AnalysisResults';
import PageHeader from '@/components/layout/PageHeader';

import {
  Input,
} from '@/components/ui/input';

import {
  FORM_EXERCISES,
  buildFormAnalysisPrompt,
} from '@/lib/formAnalysis';


/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

/**
 * Parse ordinary-text JSON returned by a free OpenRouter model.
 *
 * Form Analysis intentionally does NOT use response_json_schema.
 * This keeps the multimodal request compatible with the free router.
 */
function parseAiJson(value) {
  if (value && typeof value === 'object') {
    if (value.result !== undefined) {
      if (typeof value.result === 'object') return value.result;
      if (typeof value.result === 'string') value = value.result;
    } else if (typeof value.content === 'string') {
      value = value.content;
    } else {
      return value;
    }
  }

  if (typeof value !== 'string') {
    return null;
  }

  let text = value.trim();

  text = text
    .replace(/^\uFEFF/, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    const firstBrace =
      text.indexOf('{');

    const lastBrace =
      text.lastIndexOf('}');

    if (
      firstBrace >= 0 &&
      lastBrace > firstBrace
    ) {
      try {
        return JSON.parse(
          text.slice(
            firstBrace,
            lastBrace + 1
          )
        );
      } catch {
        return null;
      }
    }
  }

  return null;
}


/**
 * Extract chronological JPEG frames from the selected video range.
 *
 * IMPORTANT:
 * The MP4 itself is never sent to OpenRouter.
 */
async function extractVideoFrames(
  file,
  startTime,
  endTime
) {
  if (!file) {
    throw new Error(
      'No video file is available for analysis.'
    );
  }

  const objectUrl =
    URL.createObjectURL(file);

  const video =
    document.createElement('video');

  video.src =
    objectUrl;

  video.preload =
    'auto';

  video.muted =
    true;

  video.playsInline =
    true;

  try {
    await new Promise(
      (
        resolve,
        reject
      ) => {
        let settled = false;

        const done = () => {
          if (settled) {
            return;
          }

          settled = true;

          video.removeEventListener(
            'loadedmetadata',
            handleLoaded
          );

          video.removeEventListener(
            'error',
            handleError
          );

          resolve();
        };

        const handleLoaded = () => {
          done();
        };

        const handleError = () => {
          if (settled) {
            return;
          }

          settled = true;

          reject(
            new Error(
              'Your browser could not read the video.'
            )
          );
        };

        video.addEventListener(
          'loadedmetadata',
          handleLoaded,
          {
            once: true,
          }
        );

        video.addEventListener(
          'error',
          handleError,
          {
            once: true,
          }
        );

        video.load();
      }
    );

    const duration =
      Number.isFinite(
        video.duration
      )
        ? video.duration
        : 0;

    if (
      duration <= 0
    ) {
      throw new Error(
        'The video duration could not be determined.'
      );
    }

    const safeStart =
      Math.max(
        0,
        Math.min(
          Number(
            startTime
          ) || 0,
          duration
        )
      );

    const safeEnd =
      Math.max(
        safeStart + 0.1,
        Math.min(
          Number(
            endTime
          ) || duration,
          duration
        )
      );

    const windowDuration =
      Math.max(
        0.1,
        safeEnd - safeStart
      );

    /*
     * Optimal biomechanical sampling density (6 key movement phases:
     * setup, initiation, inflection/deepest ROM, turnaround, lockout, reset).
     */
    let frameCount = 6;
    if (windowDuration > 8) {
      frameCount = 8;
    }

    const timestamps = [];

    for (
      let i = 0;
      i < frameCount;
      i += 1
    ) {
      const ratio =
        frameCount === 1
          ? 0
          : i /
            (frameCount - 1);

      timestamps.push(
        safeStart +
          windowDuration *
            ratio
      );
    }

    const sourceWidth =
      video.videoWidth ||
      1280;

    const sourceHeight =
      video.videoHeight ||
      720;

    const maxDimension = 640;
    let targetWidth = sourceWidth;
    let targetHeight = sourceHeight;

    if (targetWidth > maxDimension || targetHeight > maxDimension) {
      if (targetWidth > targetHeight) {
        targetHeight = Math.round((targetHeight * maxDimension) / targetWidth);
        targetWidth = maxDimension;
      } else {
        targetWidth = Math.round((targetWidth * maxDimension) / targetHeight);
        targetHeight = maxDimension;
      }
    }

    const canvas =
      document.createElement(
        'canvas'
      );

    canvas.width = Math.max(1, targetWidth);
    canvas.height = Math.max(1, targetHeight);

    const ctx =
      canvas.getContext(
        '2d'
      );

    if (!ctx) {
      throw new Error(
        'Your browser could not prepare the video frames.'
      );
    }

    const frames = [];

    for (
      let i = 0;
      i < timestamps.length;
      i += 1
    ) {
      const timestamp =
        timestamps[i];

      await seekVideo(
        video,
        timestamp
      );

      ctx.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const dataUrl = canvas.toDataURL('image/jpeg', 0.78);

      const blob =
        await canvasToBlob(
          canvas
        );

      frames.push({
        index:
          i + 1,

        timestamp,

        dataUrl,

        file:
          new File(
            [blob],
            `form-frame-${String(
              i + 1
            ).padStart(
              2,
              '0'
            )}.jpg`,
            {
              type:
                'image/jpeg',
            }
          ),
      });
    }

    return {
      frames,
      duration,
      start:
        safeStart,
      end:
        safeEnd,
    };
  } finally {
    URL.revokeObjectURL(
      objectUrl
    );
  }
}


/**
 * Seek with a timeout so a broken/corrupt video cannot leave
 * the Form Analysis screen loading forever.
 */
function seekVideo(
  video,
  time
) {
  return new Promise(
    (resolve) => {
      if (!video || !Number.isFinite(time)) {
        resolve();
        return;
      }

      // If already at or within 0.04s of requested time, avoid redundant seek that might not trigger 'seeked'
      if (Math.abs(video.currentTime - time) < 0.04) {
        resolve();
        return;
      }

      let settled = false;

      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        console.warn(`[FormLab] Video seek to ${time.toFixed(1)}s timed out; proceeding with current frame.`);
        resolve();
      }, 2500);

      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('error', handleError);
      };

      const handleSeeked = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const handleError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      video.addEventListener('seeked', handleSeeked, { once: true });
      video.addEventListener('error', handleError, { once: true });

      try {
        video.currentTime = time;
      } catch {
        settled = true;
        cleanup();
        resolve();
      }
    }
  );
}


/**
 * Convert canvas to a reasonably compressed JPEG.
 */
function canvasToBlob(
  canvas
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(
              new Error(
                'A video frame could not be converted to an image.'
              )
            );

            return;
          }

          resolve(blob);
        },
        'image/jpeg',
        0.78
      );
    }
  );
}


/**
 * Make sure the model's result has the shape expected by
 * AnalysisResults.
 */
function normalizeResult(
  value,
  fallbackStart,
  fallbackEnd
) {
  const source =
    value && typeof value === 'object'
      ? (value.result && typeof value.result === 'object' ? value.result : value)
      : {};

  let rawScore =
    source.score ??
    source.form_score ??
    source.overall_score ??
    source.rating ??
    source.technique_score;

  let score = Number(rawScore);
  if (!Number.isFinite(score) && typeof rawScore === 'string') {
    const match = rawScore.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      score = parseFloat(match[1]);
    }
  }

  const safeScore =
    Number.isFinite(score) && score > 0
      ? Math.max(1, Math.min(100, Math.round(score)))
      : (source.camera_angle_ok === false ? 45 : 75);

  return {
    camera_angle_ok:
      source.camera_angle_ok !== false,

    camera_angle_note:
      String(
        source.camera_angle_note || ''
      ),

    score:
      safeScore,

    rep_count:
      source.rep_count == null ? null : Number(source.rep_count),

    hold_time_seconds:
      source.hold_time_seconds == null ? null : Number(source.hold_time_seconds),

    active_range_start:
      source.active_range_start == null ? fallbackStart : Number(source.active_range_start),

    active_range_end:
      source.active_range_end == null ? fallbackEnd : Number(source.active_range_end),

    overall_assessment:
      String(
        source.overall_assessment ||
        source.summary ||
        source.critique ||
        'The biomechanical analysis of your movement is complete.'
      ),

    issues:
      Array.isArray(source.issues)
        ? source.issues
        : (Array.isArray(source.flaws) ? source.flaws : []),

    priority_focus:
      Array.isArray(source.priority_focus)
        ? source.priority_focus
        : (Array.isArray(source.cues) ? source.cues : []),
  };
}


/**
 * The free router is much more reliable with ordinary text output
 * than strict JSON-schema output for multimodal requests.
 */
function buildFrameAnalysisPrompt(
  exercise,
  category,
  user,
  start,
  end,
  frameTimeline
) {
  const basePrompt =
    buildFormAnalysisPrompt(
      exercise,
      category,
      user,
      start,
      end
    );

  return `
${basePrompt}

IMPORTANT MEDIA CHANGE:

You are NOT receiving the original video.

You are receiving chronological STILL IMAGES extracted from
the selected video window.

Use the supplied timestamps and analyze the images together
as one movement sequence.

Do NOT claim continuous-video precision.

Do NOT invent movement between frames that the evidence does
not support.

FRAME TIMELINE:

${frameTimeline}

VERY IMPORTANT OUTPUT RULE:

Return ONLY valid JSON.

Do NOT use markdown.

Do NOT put the JSON inside a code block.

Do NOT add any explanation before or after the JSON.

Use exactly this structure:

{
  "camera_angle_ok": true,
  "camera_angle_note": "string",
  "score": 1,
  "rep_count": null,
  "hold_time_seconds": null,
  "active_range_start": null,
  "active_range_end": null,
  "overall_assessment": "string",
  "issues": [
    {
      "area": "string",
      "problem": "string",
      "severity": "minor",
      "fix": "string",
      "corrective_exercises": ["string"]
    }
  ],
  "priority_focus": ["string"]
}
`;
}


/*
 * ============================================================
 * COMPONENT
 * ============================================================
 */

export default function FormLab() {
  const navigate =
    useNavigate();

  const [
    user,
    setUser,
  ] =
    useState(null);

  /*
   * Keep the actual File object.
   * We need it later to extract browser-side frames.
   */
  const [
    videoFile,
    setVideoFile,
  ] =
    useState(null);

  const [
    exercise,
    setExercise,
  ] =
    useState('');

  const [
    videoUrl,
    setVideoUrl,
  ] =
    useState(null);

  const [
    videoPath,
    setVideoPath,
  ] =
    useState(null);

  const [
    uploading,
    setUploading,
  ] =
    useState(false);

  const [
    analyzing,
    setAnalyzing,
  ] =
    useState(false);

  const [
    analysisStatus,
    setAnalysisStatus,
  ] =
    useState('');

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState('');

  const [
    result,
    setResult,
  ] =
    useState(null);

  const [
    videoDuration,
    setVideoDuration,
  ] =
    useState(0);

  const [
    trimStart,
    setTrimStart,
  ] =
    useState(0);

  const [
    trimEnd,
    setTrimEnd,
  ] =
    useState(0);

  const [
    autoDetected,
    setAutoDetected,
  ] =
    useState(false);

  const videoRef =
    useRef(null);

  const containerRef =
    useRef(null);

  const [
    searchParams,
    setSearchParams,
  ] =
    useSearchParams();

  const step =
    searchParams.get(
      'step'
    ) ||
    'select';

  /*
   * Ensure page is scrolled to top and fully visible whenever
   * step transitions (e.g. video upload, trimming, results).
   */
  useEffect(() => {
    if (containerRef.current) {
      let parent = containerRef.current.parentElement;
      while (parent) {
        if (
          parent.scrollHeight > parent.clientHeight &&
          (getComputedStyle(parent).overflowY === 'auto' ||
            getComputedStyle(parent).overflowY === 'scroll')
        ) {
          parent.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        }
        parent = parent.parentElement;
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, Boolean(result)]);


  /*
   * ==========================================================
   * USER
   * ==========================================================
   */

  useEffect(
    () => {
      let mounted =
        true;

      supabaseApi.auth
        .me()
        .then(
          currentUser => {
            if (
              mounted
            ) {
              setUser(
                currentUser
              );
            }
          }
        )
        .catch(
          error => {
            console.error(
              '[FormLab] Failed to load user:',
              error
            );

            if (
              mounted
            ) {
              setErrorMessage(
                error?.message ||
                  'Unable to load your account.'
              );
            }
          }
        );

      return () => {
        mounted =
          false;
      };
    },
    []
  );


  const plan =
    user?.subscription_plan ||
    'free';

  const isElite =
    plan ===
    'elite';

  const selectedEx =
    FORM_EXERCISES.find(
      e =>
        e.name ===
        exercise
    );

  const exCategory =
    selectedEx?.category ||
    'dynamic';


  /*
   * ==========================================================
   * LOADING
   * ==========================================================
   */

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }


  /*
   * ==========================================================
   * ELITE LOCK
   * ==========================================================
   */

  if (!isElite) {
    return (
      <div className="px-5 safe-bottom pt-2 sm:pt-4">
        <PageHeader
          title="Form Analysis"
          subtitle="AI form analysis · Elite feature"
        />
        <div className="pt-8 pb-24 flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-20 h-20 rounded-3xl bg-chart-4/15 flex items-center justify-center mb-5 border border-chart-4/20">
            <Crown className="w-10 h-10 text-chart-4" />
          </div>

          <h1 className="font-heading text-2xl font-bold mb-2">
            Form Analysis is Elite-only
          </h1>

          <p className="text-muted-foreground text-sm max-w-xs mb-6">
            AI-powered form analysis with frame-level
            analysis. Record any calisthenics movement
            and get a score, rep/hold assessment,
            and corrective drills.
          </p>

          <Button
            type="button"
            onClick={() =>
              navigate('/profile')
            }
            className="h-12 px-8 font-heading font-semibold"
          >
            <Crown className="w-4 h-4 mr-2" />
            Upgrade to Elite
          </Button>
        </div>
      </div>
    );
  }


  /*
   * ==========================================================
   * VIDEO SELECTED
   * ==========================================================
   */

  const handleVideoSelected =
    async (
      file
    ) => {
      if (!file) {
        return;
      }

      setUploading(
        true
      );

      setErrorMessage(
        ''
      );

      setResult(
        null
      );

      setVideoFile(
        file
      );

      setAutoDetected(
        false
      );

      try {
        if (
          !file.type.startsWith(
            'video/'
          )
        ) {
          throw new Error(
            'Please select a video file.'
          );
        }

        const uploaded =
          await supabaseApi.storage.uploadFile(
            {
              file,
            }
          );

        if (
          !uploaded?.file_url ||
          !uploaded?.path
        ) {
          throw new Error(
            'The video uploaded, but no video URL or storage path was returned.'
          );
        }

        setVideoUrl(
          uploaded.file_url
        );

        setVideoPath(
          uploaded.path
        );

        const nextParams =
          new URLSearchParams(
            searchParams
          );

        nextParams.set(
          'step',
          'preview'
        );

        setSearchParams(
          nextParams
        );
      } catch (
        error
      ) {
        console.error(
          '[FormLab] Upload failed:',
          error
        );

        setErrorMessage(
          error?.message ||
            'The video could not be uploaded.'
        );

        setVideoFile(
          null
        );

        setVideoUrl(
          null
        );

        setVideoPath(
          null
        );
      } finally {
        setUploading(
          false
        );
      }
    };


  /*
   * ==========================================================
   * VIDEO METADATA
   * ==========================================================
   */

  const handleMetadata =
    () => {
      const duration =
        videoRef.current
          ?.duration ||
        0;

      if (
        !Number.isFinite(
          duration
        ) ||
        duration <= 0
      ) {
        return;
      }

      setVideoDuration(
        duration
      );

      setTrimStart(
        0
      );

      setTrimEnd(
        duration
      );
    };


  /*
   * ==========================================================
   * TRIM
   * ==========================================================
   */

  const handleTrimStart =
    (
      val
    ) => {
      const requested =
        Math.max(
          0,
          Math.min(
            Number(
              val
            ) || 0,
            videoDuration
          )
        );

      const next =
        Math.min(
          requested,
          Math.max(
            0,
            trimEnd -
              0.1
          )
        );

      setTrimStart(
        next
      );

      if (
        videoRef.current
      ) {
        videoRef.current.currentTime =
          next;
      }
    };


  const handleTrimEnd =
    (
      val
    ) => {
      const requested =
        Math.max(
          0,
          Math.min(
            videoDuration,
            Number(
              val
            ) || 0
          )
        );

      const next =
        Math.max(
          requested,
          Math.min(
            videoDuration,
            trimStart +
              0.1
          )
        );

      setTrimEnd(
        next
      );

      if (
        videoRef.current
      ) {
        videoRef.current.currentTime =
          next;
      }
    };


  /*
   * ==========================================================
   * ANALYZE
   * ==========================================================
   */

  const handleAnalyze =
    async () => {
      if (
        !videoFile ||
        !videoUrl ||
        !exercise ||
        analyzing
      ) {
        return;
      }

      setAnalyzing(
        true
      );

      setResult(
        null
      );

      setErrorMessage(
        ''
      );

      try {
        /*
         * ------------------------------------------------------
         * STEP 1 — EXTRACT FRAMES
         * ------------------------------------------------------
         */

        setAnalysisStatus(
          'Preparing movement frames…'
        );

        const {
          frames,
          start,
          end,
        } =
          await extractVideoFrames(
            videoFile,
            trimStart,
            trimEnd ||
              videoDuration
          );


        /*
         * ------------------------------------------------------
         * STEP 2 — PREPARE FRAME IMAGES
         * ------------------------------------------------------
         */

        setAnalysisStatus(
          'Preparing high-resolution biomechanical keyframes…'
        );

        const uploadedFrames =
          frames.map(frame => ({
            index:
              frame.index,

            timestamp:
              frame.timestamp,

            url:
              frame.dataUrl ||
              '',
          }));

        // Fire background storage persistence without blocking the fast AI response
        Promise.all(
          frames.map(f =>
            supabaseApi.storage
              .uploadFile({
                file: f.file,
                folder: 'form-analysis-frames',
              })
              .catch(() => null)
          )
        ).catch(() => {});


        /*
         * ------------------------------------------------------
         * STEP 3 — TIMELINE
         * ------------------------------------------------------
         */

        const frameTimeline =
          uploadedFrames
            .map(
              frame =>
                `Frame ${frame.index}: ${frame.timestamp.toFixed(
                  2
                )}s`
            )
            .join(
              '\n'
            );


        /*
         * ------------------------------------------------------
         * STEP 4 — PROMPT
         * ------------------------------------------------------
         */

        setAnalysisStatus(
          'Kael is analyzing your movement…'
        );

        const prompt =
          buildFrameAnalysisPrompt(
            exercise,
            exCategory,
            user,
            start,
            end,
            frameTimeline
          );


        /*
         * ------------------------------------------------------
         * STEP 5 — IMPORTANT:
         * NO response_json_schema
         *
         * This is what avoids the free-router 404.
         * ------------------------------------------------------
         */

        const rawResult =
          await supabaseApi.ai.invoke(
            {
              prompt,

              file_urls:
                uploadedFrames.map(
                  frame =>
                    frame.url
                ),

              type:
                'form_analysis',
            }
          );


        /*
         * ------------------------------------------------------
         * STEP 6 — PARSE
         * ------------------------------------------------------
         */

        const parsed =
          parseAiJson(
            rawResult
          );

        if (
          !parsed
        ) {
          throw new Error(
            'Kael returned an unreadable form analysis. Please try again with a clearer video.'
          );
        }


        /*
         * ------------------------------------------------------
         * STEP 7 — NORMALIZE
         * ------------------------------------------------------
         */

        const cleaned =
          normalizeResult(
            parsed,
            start,
            end
          );

        setResult(
          cleaned
        );


        /*
         * ------------------------------------------------------
         * RESULTS PAGE
         * ------------------------------------------------------
         */

        const nextParams =
          new URLSearchParams(
            searchParams
          );

        nextParams.set(
          'step',
          'results'
        );

        setSearchParams(
          nextParams
        );


        /*
         * ------------------------------------------------------
         * AUTO RANGE
         * ------------------------------------------------------
         */

        if (
          Number.isFinite(
            cleaned.active_range_start
          ) &&
          Number.isFinite(
            cleaned.active_range_end
          ) &&
          cleaned.active_range_end >
            cleaned.active_range_start
        ) {
          setTrimStart(
            cleaned.active_range_start
          );

          setTrimEnd(
            cleaned.active_range_end
          );

          setAutoDetected(
            true
          );
        }


        /*
         * ------------------------------------------------------
         * SAVE
         * ------------------------------------------------------
         *
         * Saving history must not destroy a successful result.
         * ------------------------------------------------------
         */

        try {
          const today =
            new Date()
              .toISOString()
              .split(
                'T'
              )[0];

          await supabaseApi.entities.FormAnalysis.create(
            {
              video_url:
                videoPath ||
                videoUrl,

              exercise_name:
                exercise,

              exercise_category:
                exCategory,

              score:
                cleaned.score,

              rep_count:
                cleaned.rep_count,

              hold_time_seconds:
                cleaned.hold_time_seconds,

              analysis:
                cleaned.overall_assessment,

              issues:
                cleaned.issues,

              date:
                today,
            }
          );
        } catch (
          saveError
        ) {
          console.error(
            '[FormLab] Could not save analysis history:',
            saveError
          );
        }

        setAnalysisStatus(
          ''
        );
      } catch (
        error
      ) {
        console.error(
          '[FormLab] Analysis failed:',
          error
        );

        setErrorMessage(
          error?.message ||
            'Form analysis failed. Please try again.'
        );

        setAnalysisStatus(
          ''
        );
      } finally {
        setAnalyzing(
          false
        );
      }
    };


  /*
   * ==========================================================
   * RESET
   * ==========================================================
   */

  const reset =
    () => {
      setVideoFile(
        null
      );

      setVideoUrl(
        null
      );

      setVideoPath(
        null
      );

      setResult(
        null
      );

      setExercise(
        ''
      );

      setTrimStart(
        0
      );

      setTrimEnd(
        0
      );

      setVideoDuration(
        0
      );

      setAutoDetected(
        false
      );

      setErrorMessage(
        ''
      );

      setAnalysisStatus(
        ''
      );

      setSearchParams(
        {}
      );
    };


  /*
   * ==========================================================
   * FORMAT TIME
   * ==========================================================
   */

  const fmtTime =
    (
      seconds
    ) => {
      const safe =
        Number.isFinite(
          seconds
        )
          ? Math.max(
              0,
              seconds
            )
          : 0;

      const m =
        Math.floor(
          safe / 60
        );

      const sec =
        Math.floor(
          safe % 60
        );

      return `${m}:${sec
        .toString()
        .padStart(
          2,
          '0'
        )}`;
    };


  /*
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <div ref={containerRef} className="px-5 safe-bottom pt-2 sm:pt-4">

      {/* Header */}
      <PageHeader
        title="Form Analysis"
        subtitle="AI form analysis · Elite feature"
      />

      <p className="text-sm text-muted-foreground mb-5">
        Record or upload any calisthenics movement.
        Kael analyzes chronological frames from your
        selected video section to assess your technique,
        score your form, estimate reps or hold quality,
        and identify corrective drills.
      </p>


      {/* Error */}

      {errorMessage && (
        <Card className="mb-4 p-4 border-destructive/30 bg-destructive/5">

          <div className="flex items-start gap-3">

            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />

            <div className="flex-1">

              <p className="font-heading font-bold text-sm text-destructive">
                Form analysis couldn't be completed
              </p>

              <p className="text-xs text-muted-foreground mt-1 break-words">
                {
                  errorMessage
                }
              </p>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-0 mt-2 h-auto text-xs text-muted-foreground"
                onClick={() =>
                  setErrorMessage(
                    ''
                  )
                }
              >
                Dismiss
              </Button>

            </div>

          </div>

        </Card>
      )}


      {/* Step 1 */}

      {(step ===
        'select' ||
        !videoUrl) && (

        <div className="space-y-4">

          <Card className="p-4">

            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Step 1: What are you analyzing?
            </p>

            <Input
              value={
                exercise
              }
              onChange={e =>
                setExercise(
                  e.target.value
                )
              }
              placeholder="e.g. Push-ups, Pull-ups, Handstand hold…"
              className="h-12 text-base"
              disabled={
                uploading ||
                analyzing
              }
            />

          </Card>


          <Card className="p-4">

            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Step 2: Record or upload video
            </p>

            <VideoInput
              onVideoSelected={
                handleVideoSelected
              }
              disabled={
                !exercise ||
                uploading ||
                analyzing
              }
            />

            {!exercise && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Select an exercise first
              </p>
            )}

            {uploading && (
              <div className="flex items-center justify-center gap-2 mt-3 text-sm text-muted-foreground">

                <Loader2 className="w-4 h-4 animate-spin" />

                Uploading video…

              </div>
            )}

          </Card>


          <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2">

            <div className="flex items-center gap-2 mb-1">

              <Sparkles className="w-4 h-4 text-primary" />

              <p className="text-xs font-bold uppercase tracking-wider text-primary">
                Tips for best results
              </p>

            </div>

            <ul className="text-xs text-muted-foreground space-y-1">

              <li>
                • Film from the{' '}
                <span className="font-semibold text-foreground">
                  side
                </span>{' '}
                at torso height
              </li>

              <li>
                • Keep your{' '}
                <span className="font-semibold text-foreground">
                  full body in frame
                </span>
              </li>

              <li>
                • Use good lighting
              </li>

              <li>
                • Holds: 2-3+ seconds
              </li>

              <li>
                • Reps: 3-5 clean reps
              </li>

            </ul>

          </div>

        </div>
      )}


      {/* Preview / Results */}

      {videoUrl &&
        step !==
          'select' && (

        <div className="space-y-4">

          <div className="flex items-center justify-between">

            <div className="flex items-center gap-2">

              <Video className="w-4 h-4 text-primary" />

              <span className="font-heading font-bold text-sm">
                {
                  exercise
                }
              </span>

            </div>


            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={
                reset
              }
              disabled={
                analyzing
              }
              className="text-muted-foreground"
            >

              <RotateCcw className="w-3.5 h-3.5 mr-1" />

              New video

            </Button>

          </div>


          {/* Video */}

          <video
            ref={
              videoRef
            }
            src={
              videoUrl
            }
            controls
            playsInline
            className="w-full rounded-2xl border border-border bg-black"
            onLoadedMetadata={
              handleMetadata
            }
          />


          {/* Trim */}

          {videoDuration >
            1 && (

            <Card className="p-4">

              <div className="flex items-center gap-2 mb-3">

                <Scissors className="w-4 h-4 text-primary" />

                <p className="text-xs font-bold uppercase tracking-wider">
                  Trim analysis window
                </p>

                {autoDetected && (
                  <span className="text-[10px] text-accent font-medium ml-auto">
                    Auto-detected by AI
                  </span>
                )}

              </div>


              <div className="space-y-3">

                <div>

                  <div className="flex justify-between text-xs text-muted-foreground mb-1">

                    <span>
                      Start
                    </span>

                    <span className="font-bold text-foreground">
                      {
                        fmtTime(
                          trimStart
                        )
                      }
                    </span>

                  </div>


                  <input
                    aria-label="Trim start time"
                    type="range"
                    min={0}
                    max={videoDuration}
                    step={0.1}
                    value={
                      trimStart
                    }
                    onChange={e =>
                      handleTrimStart(
                        parseFloat(
                          e.target.value
                        )
                      )
                    }
                    disabled={
                      analyzing
                    }
                    className="w-full accent-primary"
                  />

                </div>


                <div>

                  <div className="flex justify-between text-xs text-muted-foreground mb-1">

                    <span>
                      End
                    </span>

                    <span className="font-bold text-foreground">
                      {
                        fmtTime(
                          trimEnd
                        )
                      }
                    </span>

                  </div>


                  <input
                    aria-label="Trim end time"
                    type="range"
                    min={0}
                    max={videoDuration}
                    step={0.1}
                    value={
                      trimEnd
                    }
                    onChange={e =>
                      handleTrimEnd(
                        parseFloat(
                          e.target.value
                        )
                      )
                    }
                    disabled={
                      analyzing
                    }
                    className="w-full accent-primary"
                  />

                </div>


                <p className="text-[11px] text-muted-foreground">
                  Only this section is converted into
                  chronological still frames for AI analysis.
                </p>

              </div>

            </Card>
          )}


          {/* Analyze button */}

          {(step !==
            'results' ||
            !result) && (

            <Button
              type="button"
              className="w-full h-12 font-heading font-semibold"
              disabled={
                analyzing ||
                !videoFile
              }
              onClick={
                handleAnalyze
              }
            >

              {analyzing ? (

                <>

                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />

                  {
                    analysisStatus ||
                    'Analyzing form…'
                  }

                </>

              ) : (

                <>

                  <Eye className="w-4 h-4 mr-2" />

                  Analyze my form

                </>

              )}

            </Button>
          )}


          {/* Analysis progress */}

          {analyzing && (

            <div className="text-center text-xs text-muted-foreground px-4">

              <div>
                {
                  analysisStatus ||
                  'Preparing your analysis…'
                }
              </div>

              <div className="mt-1">
                This uses sampled frames rather than
                sending the video directly to the AI.
              </div>

            </div>

          )}


          {/* Results */}

          {result &&
            step ===
              'results' && (

            <>

              <div className="flex items-center gap-2">

                <Sparkles className="w-4 h-4 text-accent" />

                <h3 className="font-heading font-bold text-base">
                  Analysis Results
                </h3>

              </div>


              <AnalysisResults
                result={
                  result
                }
                exercise={
                  exercise
                }
              />


              <Button
                type="button"
                variant="outline"
                className="w-full h-11"
                onClick={() => {

                  setResult(
                    null
                  );

                  setAutoDetected(
                    false
                  );

                  setErrorMessage(
                    ''
                  );

                  const n =
                    new URLSearchParams(
                      searchParams
                    );

                  n.set(
                    'step',
                    'preview'
                  );

                  setSearchParams(
                    n
                  );
                }}
              >

                <RotateCcw className="w-4 h-4 mr-2" />

                Re-analyze with new trim

              </Button>

            </>
          )}

        </div>
      )}

    </div>
  );
}
