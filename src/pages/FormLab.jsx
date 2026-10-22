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
  computeKinematicMetrics,
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
  endTime,
  category = 'dynamic'
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
     * High-density biomechanical sampling density to guarantee exact rep counting and spot-on hold times:
     * Provides multiple frames for every repetition's initiation, depth inflection, and lockout.
     */
    let frameCount = 14;
    if (windowDuration > 25) {
      frameCount = 28;
    } else if (windowDuration > 15) {
      frameCount = 24;
    } else if (windowDuration > 8) {
      frameCount = 20;
    } else if (windowDuration > 4) {
      frameCount = 16;
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

    const maxDimension = 540;
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

    // Lightweight offscreen motion canvas for kinematic tracking
    const motionCanvas = document.createElement('canvas');
    motionCanvas.width = 64;
    motionCanvas.height = 64;
    const motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });
    let prevImageData = null;
    const motionSamples = [];

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

      // Track motion energy and vertical displacement
      if (motionCtx) {
        motionCtx.drawImage(canvas, 0, 0, 64, 64);
        const currData = motionCtx.getImageData(0, 0, 64, 64).data;
        if (prevImageData) {
          let diffSum = 0;
          let weightedY = 0;
          let totalWeight = 0;
          for (let p = 0; p < currData.length; p += 4) {
            const dR = Math.abs(currData[p] - prevImageData[p]);
            const dG = Math.abs(currData[p + 1] - prevImageData[p + 1]);
            const dB = Math.abs(currData[p + 2] - prevImageData[p + 2]);
            const pixelDiff = (dR + dG + dB) / 3;
            diffSum += pixelDiff;
            const pixelY = Math.floor((p / 4) / 64) / 64;
            weightedY += pixelDiff * pixelY;
            totalWeight += pixelDiff;
          }
          const motionEnergy = diffSum / (64 * 64 * 255);
          const verticalCentroid = totalWeight > 0 ? weightedY / totalWeight : 0.5;
          motionSamples.push({
            timestamp,
            motionEnergy,
            verticalCentroid,
          });
        } else {
          motionSamples.push({
            timestamp,
            motionEnergy: 0,
            verticalCentroid: 0.5,
          });
        }
        prevImageData = currData;
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);

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

    const kinematics = computeKinematicMetrics(
      motionSamples,
      category,
      windowDuration
    );

    return {
      frames,
      duration,
      start:
        safeStart,
      end:
        safeEnd,
      kinematics,
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
 * AnalysisResults, with exact rep count and spot-on hold times
 * strictly bounded by the analyzed section.
 */
function normalizeResult(
  value,
  fallbackStart,
  fallbackEnd,
  kinematics = null,
  category = 'dynamic'
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

  const windowDuration = Math.max(0.1, fallbackEnd - fallbackStart);
  const isHold = category === 'hold';

  let finalRepCount = null;
  let finalHoldTime = null;

  if (isHold) {
    // Static isometric holds do not have rep counts
    finalRepCount = null;

    let rawHold = source.hold_time_seconds ?? source.hold_time ?? source.duration_seconds;
    if (rawHold != null) {
      let parsedHold = Number(rawHold);
      if (Number.isFinite(parsedHold) && parsedHold > 0) {
        // Hold time strictly cannot exceed the analyzed section duration
        finalHoldTime = Math.min(windowDuration, Math.round(parsedHold * 10) / 10);
      }
    }

    // If model didn't provide hold time or returned 0, use kinematically measured hold time
    if (finalHoldTime == null || finalHoldTime <= 0) {
      if (kinematics?.detectedHoldSeconds && kinematics.detectedHoldSeconds > 0) {
        finalHoldTime = Math.min(windowDuration, Math.round(kinematics.detectedHoldSeconds * 10) / 10);
      } else {
        finalHoldTime = Math.round(windowDuration * 10) / 10;
      }
    }
  } else {
    // Dynamic rep-based exercises do not have static hold times
    finalHoldTime = null;

    let rawReps = source.rep_count ?? source.reps ?? source.repetition_count;
    let modelReps = null;
    if (rawReps != null) {
      let parsedReps = Number(rawReps);
      if (Number.isFinite(parsedReps) && parsedReps >= 0) {
        modelReps = Math.round(parsedReps);
      }
    }

    if (modelReps !== null && modelReps > 0) {
      finalRepCount = modelReps;
      // If kinematic analysis detected a higher verified complete cycle count (e.g. 10 reps)
      // that the model slightly undercounted due to frame sampling
      if (kinematics?.detectedReps && kinematics.detectedReps > 0) {
        if (kinematics.detectedReps > modelReps && (kinematics.detectedReps - modelReps) >= 2) {
          finalRepCount = kinematics.detectedReps;
        }
      }
    } else if (kinematics?.detectedReps && kinematics.detectedReps > 0) {
      finalRepCount = kinematics.detectedReps;
    } else {
      finalRepCount = modelReps !== null ? modelReps : 1;
    }
  }

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
      finalRepCount,

    hold_time_seconds:
      finalHoldTime,

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
 * Build multimodal prompt with frame timeline and kinematic telemetry.
 */
function buildFrameAnalysisPrompt(
  exercise,
  category,
  user,
  start,
  end,
  frameTimeline,
  kinematicSummary = ''
) {
  const basePrompt =
    buildFormAnalysisPrompt(
      exercise,
      category,
      user,
      start,
      end,
      kinematicSummary
    );

  return `
${basePrompt}

CHRONOLOGICAL FRAME TIMELINE (ANALYZED SECTION ONLY: ${start.toFixed(2)}s to ${end.toFixed(2)}s):

${frameTimeline}

${kinematicSummary ? `KINEMATIC SUMMARY OF ANALYZED SECTION:\n${kinematicSummary}\n` : ''}

VERY IMPORTANT ACCURACY RULES:
1. COUNTING REPS: If the athlete performs 10 reps in this analyzed section, you must count exactly 10 reps.
2. HOLD TIMES: For static holds, measure the exact duration in seconds held strictly within this analyzed section.
3. BOUNDARIES: Only analyze movement within this analyzed section (${start.toFixed(2)}s to ${end.toFixed(2)}s).

OUTPUT RULE:
Return ONLY valid JSON matching the structure. Do not use markdown. Do not wrap in backticks.
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

  useEffect(() => {
    const handleSubUpdated = (e) => {
      const p = e.detail?.plan;
      if (p) {
        setUser((prev) => (prev ? { ...prev, subscription_plan: p } : prev));
      }
    };
    window.addEventListener('washek_subscription_updated', handleSubUpdated);
    return () => window.removeEventListener('washek_subscription_updated', handleSubUpdated);
  }, []);

  const plan = (() => {
    if (user?.subscription_plan && user.subscription_plan !== 'free') {
      return user.subscription_plan.toLowerCase().trim();
    }
    try {
      const storedPlan = localStorage.getItem('washek_subscription_plan');
      if (storedPlan && storedPlan !== 'free') return storedPlan.toLowerCase().trim();
      const storedUser = localStorage.getItem('washek_user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        if (parsed?.subscription_plan && parsed.subscription_plan !== 'free') {
          return parsed.subscription_plan.toLowerCase().trim();
        }
      }
    } catch (_err) {
      // ignore
    }
    return 'free';
  })();

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
          kinematics,
        } =
          await extractVideoFrames(
            videoFile,
            trimStart,
            trimEnd ||
              videoDuration,
            exCategory
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
            frameTimeline,
            kinematics?.summary || ''
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
            end,
            kinematics,
            exCategory
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
