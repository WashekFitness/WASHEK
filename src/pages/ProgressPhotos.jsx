import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Camera,
  Image as ImageIcon,
  Scan,
  Trash2,
  Weight,
  TrendingDown,
  Sparkles,
  Lock,
  X,
  AlertCircle,
  Loader2,
  ArrowLeftRight,
  Check,
} from 'lucide-react';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

import {
  Card,
} from '@/components/ui/card';

import {
  Button,
} from '@/components/ui/button';

import {
  Input,
} from '@/components/ui/input';

import {
  toast,
} from 'sonner';

import {
  cn,
} from '@/lib/utils';

import {
  supabaseApi,
} from '@/lib/supabaseApi';

import {
  canAccess,
} from '@/lib/subscription';

import {
  useAppSettings,
  displayWeight,
  weightUnit,
} from '@/lib/AppSettingsContext';

import {
  getProgressPhotoPrompt,
} from '@/lib/trainingTypes';

import PageHeader from '@/components/layout/PageHeader';


/* ==========================================================
   AI SCHEMA
   ========================================================== */

const PROGRESS_PHOTO_SCHEMA = {
  type: 'object',

  additionalProperties: false,

  properties: {
    body_fat_range: {
      type: 'string',
    },

    body_fat_numeric: {
      type: 'number',
    },

    insights: {
      type: 'string',
    },
  },

  required: [
    'body_fat_range',
    'body_fat_numeric',
    'insights',
  ],
};


/* ==========================================================
   PHOTO HELPERS
   ========================================================== */

function getPhotoTimestamp(photo) {
  const raw =
    photo?.date ||
    photo?.created_at ||
    photo?.created_date ||
    '';

  if (!raw) {
    return 0;
  }

  const normalized =
    String(raw).length === 10
      ? `${raw}T23:59:59`
      : String(raw);

  const timestamp =
    Date.parse(normalized);

  return Number.isFinite(
    timestamp
  )
    ? timestamp
    : 0;
}


function sortPhotosNewestFirst(
  list
) {
  return [
    ...(list || []),
  ].sort(
    (
      a,
      b
    ) => {
      const timestampDifference =
        getPhotoTimestamp(b) -
        getPhotoTimestamp(a);

      if (
        timestampDifference !==
        0
      ) {
        return timestampDifference;
      }

      const createdA =
        Date.parse(
          String(
            a?.created_at ||
            a?.created_date ||
            ''
          )
        ) || 0;

      const createdB =
        Date.parse(
          String(
            b?.created_at ||
            b?.created_date ||
            ''
          )
        ) || 0;

      return (
        createdB -
        createdA
      );
    }
  );
}


function getPhotoDate(
  photo
) {
  return (
    photo?.date ||
    String(
      photo?.created_at ||
      photo?.created_date ||
      ''
    ).slice(0, 10)
  );
}


function formatPhotoDate(
  photo
) {
  const date =
    getPhotoDate(
      photo
    );

  if (!date) {
    return 'Unknown date';
  }

  const parsed =
    new Date(
      `${date}T12:00:00`
    );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return date;
  }

  return parsed.toLocaleDateString(
    'en',
    {
      month:
        'short',

      day:
        'numeric',

      year:
        'numeric',
    }
  );
}


function formatPhotoDateHeading(
  date
) {
  if (!date) {
    return 'Unknown date';
  }

  const parsed =
    new Date(
      `${date}T12:00:00`
    );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return date;
  }

  return parsed.toLocaleDateString(
    'en',
    {
      weekday:
        'long',

      month:
        'long',

      day:
        'numeric',

      year:
        'numeric',
    }
  );
}


/* ==========================================================
   PAGE
   ========================================================== */

function getPhotoDisplayUrl(photo) {
  return (
    photo?.resolved_photo_url ||
    photo?.photo_url ||
    null
  );
}

export default function ProgressPhotos() {
  const queryClient =
    useQueryClient();

  const {
    settings,
  } =
    useAppSettings();

  const unit =
    settings?.unit ||
    'imperial';

  const today =
    new Date()
      .toISOString()
      .split('T')[0];


  const [
    user,
    setUser,
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
    useState(null);


  const [
    analysisError,
    setAnalysisError,
  ] =
    useState({});


  const [
    pendingWeight,
    setPendingWeight,
  ] =
    useState({});


  const [
    lightboxUrl,
    setLightboxUrl,
  ] =
    useState(null);


  /*
   * ---------------------------------------------------------
   * COMPARE STATE
   * ---------------------------------------------------------
   */

  const [
    compareMode,
    setCompareMode,
  ] =
    useState(false);


  const [
    compareLeftId,
    setCompareLeftId,
  ] =
    useState(null);


  const [
    compareRightId,
    setCompareRightId,
  ] =
    useState(null);


  const cameraInputRef =
    useRef(null);


  const galleryInputRef =
    useRef(null);


  /* ==========================================================
     LOAD USER
     ========================================================== */

  useEffect(
    () => {
      let mounted =
        true;

      supabaseApi.auth
        .me()
        .then(
          (
            currentUser
          ) => {
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
          (
            error
          ) => {
            console.error(
              '[ProgressPhotos] User load failed:',
              error
            );
          }
        );

      return () => {
        mounted =
          false;
      };
    },
    []
  );


  /* ==========================================================
     PLAN
     ========================================================== */

  const plan =
    user?.subscription_plan ||
    'free';


  const firstName =
    user?.first_name ||
    user?.full_name
      ?.split(' ')[0] ||
    'there';


  const canCompare =
    canAccess(
      plan,
      'progress_photos'
    );


  const canAnalyze =
    canAccess(
      plan,
      'ai_body_analysis'
    );


  const canSeeGraph =
    canAccess(
      plan,
      'progress_graph'
    );


  /* ==========================================================
     LOAD PHOTOS
     ========================================================== */

  const {
    data: photos = [],
  } =
    useQuery({
      queryKey: [
        'progress-photos',
        user?.email,
      ],

      queryFn:
        async () => {
          const rows =
            await supabaseApi.entities.ProgressPhoto.filter(
              {
                created_by:
                  user.email,
              },

              '-date',

              100
            );

          return Promise.all(
            rows.map(async (photo) => ({
              ...photo,
              resolved_photo_url:
                photo?.photo_url
                  ? await supabaseApi.storage.resolveMediaUrl(
                      photo.photo_url,
                      3600
                    )
                  : null,
            }))
          );
        },

      enabled:
        !!user?.email,
    });


  /*
   * Newest photos first.
   */

  const recentPhotos =
    useMemo(
      () =>
        sortPhotosNewestFirst(
          photos
        ),
      [photos]
    );


  /* ==========================================================
     INITIALIZE COMPARE PHOTOS
     ========================================================== */

  useEffect(
    () => {
      if (
        !canCompare
      ) {
        setCompareMode(
          false
        );

        return;
      }

      if (
        recentPhotos.length ===
        0
      ) {
        setCompareLeftId(
          null
        );

        setCompareRightId(
          null
        );

        return;
      }

      setCompareLeftId(
        (
          current
        ) =>
          recentPhotos.some(
            (
              photo
            ) =>
              photo.id ===
              current
          )
            ? current
            : recentPhotos[0]
                ?.id ||
              null
      );


      setCompareRightId(
        (
          current
        ) => {
          if (
            recentPhotos.some(
              (
                photo
              ) =>
                photo.id ===
                current
            )
          ) {
            return current;
          }

          return (
            recentPhotos[1]
              ?.id ||
            recentPhotos[0]
              ?.id ||
            null
          );
        }
      );
    },
    [
      recentPhotos,
      canCompare,
    ]
  );


  /* ==========================================================
     MUTATIONS
     ========================================================== */

  const createMutation =
    useMutation({
      mutationFn:
        (
          data
        ) =>
          supabaseApi.entities.ProgressPhoto.create(
            data
          ),

      onSuccess:
        () => {
          queryClient.invalidateQueries(
            {
              queryKey: [
                'progress-photos',
              ],
            }
          );

          toast.success(
            'Photo saved!'
          );
        },
    });


  const deleteMutation =
    useMutation({
      mutationFn:
        (
          id
        ) =>
          supabaseApi.entities.ProgressPhoto.delete(
            id
          ),

      onSuccess:
        () => {
          queryClient.invalidateQueries(
            {
              queryKey: [
                'progress-photos',
              ],
            }
          );

          toast.success(
            'Photo deleted.'
          );
        },
    });


  const updateMutation =
    useMutation({
      mutationFn:
        ({
          id,
          data,
        }) =>
          supabaseApi.entities.ProgressPhoto.update(
            id,
            data
          ),

      onSuccess:
        () => {
          queryClient.invalidateQueries(
            {
              queryKey: [
                'progress-photos',
              ],
            }
          );
        },
    });


  /* ==========================================================
     UPLOAD
     ========================================================== */

  const handleFileUpload =
    async (
      event
    ) => {
      const file =
        event.target
          ?.files?.[0];

      if (
        !file
      ) {
        return;
      }

      setUploading(
        true
      );

      try {
        if (
          !file.type.startsWith(
            'image/'
          )
        ) {
          throw new Error(
            'Please select an image file.'
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
            'The photo uploaded, but no storage path or temporary URL was returned.'
          );
        }

        await createMutation.mutateAsync(
          {
            photo_url:
              uploaded.path,

            date:
              today,
          }
        );
      } catch (
        error
      ) {
        console.error(
          '[ProgressPhotos] Upload failed:',
          error
        );

        toast.error(
          error?.message ||
            'The photo could not be uploaded.'
        );
      } finally {
        setUploading(
          false
        );

        event.target.value =
          '';
      }
    };


  /* ==========================================================
     AI ANALYSIS
     ========================================================== */

  const handleAnalyze =
    async (
      photo
    ) => {
      if (
        analyzing
      ) {
        return;
      }

      setAnalyzing(
        photo.id
      );

      setAnalysisError(
        (
          previous
        ) => ({
          ...previous,

          [photo.id]:
            '',
        })
      );

      try {
        const chronological =
          [...recentPhotos].sort(
            (
              a,
              b
            ) =>
              getPhotoTimestamp(
                a
              ) -
              getPhotoTimestamp(
                b
              )
          );

        const index =
          chronological.findIndex(
            (
              item
            ) =>
              item.id ===
              photo.id
          );

        const previousPhoto =
          index > 0
            ? [
                ...chronological.slice(
                  0,
                  index
                ),
              ]
                .reverse()
                .find(
                  (
                    item
                  ) =>
                    item.body_fat_estimate
                )
            : null;


        const previousContext =
          previousPhoto
            ? `Previous estimate from ${formatPhotoDate(
                previousPhoto
              )}: ${previousPhoto.body_fat_estimate}.`
            : '';


        const trainingType =
          user?.training_type ||
          'calisthenics';


        const equipment =
          user?.available_equipment ||
          '';


        const prompt =
          `${getProgressPhotoPrompt(
            trainingType,
            firstName,
            previousContext,
            equipment
          )}

IMPORTANT OUTPUT REQUIREMENT:

Return ONLY this JSON object:

{
  "body_fat_range": "14-17%",
  "body_fat_numeric": 15.5,
  "insights": "Your personalized coaching observations..."
}

body_fat_range must be a range, not an exact percentage.
body_fat_numeric must be the numeric midpoint of that range.
insights must contain personalized coaching analysis.
`;


        const photoUrl =
          getPhotoDisplayUrl(photo);

        if (!photoUrl) {
          throw new Error(
            'This progress photo does not have a valid image URL.'
          );
        }


        const result =
          await supabaseApi.ai.invoke(
            {
              type:
                'progress_photo',

              prompt,

              file_urls: [
                photoUrl,
              ],

              response_json_schema:
                PROGRESS_PHOTO_SCHEMA,
            }
          );


        const bodyFatRange =
          String(
            result?.body_fat_range ||
              ''
          ).trim();


        const bodyFatNumeric =
          Number(
            result?.body_fat_numeric
          );


        const insights =
          String(
            result?.insights ||
              ''
          ).trim();


        if (
          !bodyFatRange
        ) {
          throw new Error(
            'The AI did not return a body-fat range.'
          );
        }


        if (
          !Number.isFinite(
            bodyFatNumeric
          )
        ) {
          throw new Error(
            'The AI did not return a valid body-fat estimate.'
          );
        }


        if (
          !insights
        ) {
          throw new Error(
            'The AI did not return coaching insights.'
          );
        }


        await updateMutation.mutateAsync(
          {
            id:
              photo.id,

            data: {
              body_fat_estimate:
                bodyFatRange,

              body_fat_numeric:
                bodyFatNumeric,

              ai_insights:
                insights,
            },
          }
        );


        setAnalysisError(
          (
            previous
          ) => ({
            ...previous,

            [photo.id]:
              '',
          })
        );


        toast.success(
          'Analysis complete!'
        );
      } catch (
        error
      ) {
        console.error(
          '[ProgressPhotos] AI analysis failed:',
          error
        );

        setAnalysisError(
          (
            previous
          ) => ({
            ...previous,

            [photo.id]:
              error?.message ||
              'AI analysis failed. Please try again.',
          })
        );

        toast.error(
          error?.message ||
            'AI analysis failed. Please try again.'
        );
      } finally {
        setAnalyzing(
          null
        );
      }
    };


  /* ==========================================================
     WEIGHT
     ========================================================== */

  const handleLogWeight =
    async (
      photo
    ) => {
      const raw =
        parseFloat(
          pendingWeight[
            photo.id
          ]
        );

      if (
        !Number.isFinite(
          raw
        ) ||
        raw <= 0
      ) {
        toast.error(
          'Enter a valid weight first.'
        );

        return;
      }


      const weightLbs =
        unit ===
        'metric'
          ? raw /
            0.453592
          : raw;


      try {
        await updateMutation.mutateAsync(
          {
            id:
              photo.id,

            data: {
              weight_lbs:
                weightLbs,
            },
          }
        );


        setPendingWeight(
          (
            previous
          ) => ({
            ...previous,

            [photo.id]:
              '',
          })
        );


        toast.success(
          'Weight logged!'
        );
      } catch (
        error
      ) {
        toast.error(
          error?.message ||
            'Weight could not be saved.'
        );
      }
    };


  /* ==========================================================
     DELETE
     ========================================================== */

  const handleDelete =
    (
      photo
    ) => {
      if (
        !photo?.id ||
        deleteMutation.isPending
      ) {
        return;
      }


      const confirmed =
        window.confirm(
          `Delete this progress photo from ${formatPhotoDate(
            photo
          )}?`
        );


      if (
        !confirmed
      ) {
        return;
      }


      deleteMutation.mutate(
        photo.id
      );
    };


  /* ==========================================================
     GROUP BY DATE
     ========================================================== */

  const grouped =
    useMemo(
      () => {
        const groups =
          {};

        recentPhotos.forEach(
          (
            photo
          ) => {
            const date =
              getPhotoDate(
                photo
              ) ||
              today;

            if (
              !groups[date]
            ) {
              groups[date] =
                [];
            }

            groups[date].push(
              photo
            );
          }
        );

        return groups;
      },
      [
        recentPhotos,
        today,
      ]
    );


  /* ==========================================================
     GRAPH DATA
     ========================================================== */

  const bodyFatGraphData =
    useMemo(
      () =>
        [...photos]
          .filter(
            (
              photo
            ) =>
              photo?.body_fat_numeric &&
              photo?.date
          )
          .sort(
            (
              a,
              b
            ) =>
              String(
                a.date
              ).localeCompare(
                String(
                  b.date
                )
              )
          )
          .map(
            (
              photo
            ) => ({
              date:
                String(
                  photo.date
                ).slice(
                  5
                ),

              bf:
                Number(
                  photo.body_fat_numeric
                ),
            })
          ),
      [photos]
    );


  const weightGraphData =
    useMemo(
      () =>
        [...photos]
          .filter(
            (
              photo
            ) =>
              photo?.weight_lbs &&
              photo?.date
          )
          .sort(
            (
              a,
              b
            ) =>
              String(
                a.date
              ).localeCompare(
                String(
                  b.date
                )
              )
          )
          .map(
            (
              photo
            ) => ({
              date:
                String(
                  photo.date
                ).slice(
                  5
                ),

              weight:
                unit ===
                'metric'
                  ? Number(
                      (
                        Number(
                          photo.weight_lbs
                        ) *
                        0.453592
                      ).toFixed(
                        1
                      )
                    )
                  : Number(
                      photo.weight_lbs
                    ),
            })
          ),
      [
        photos,
        unit,
      ]
    );


  /* ==========================================================
     COMPARE PHOTOS
     ========================================================== */

  const compareLeft =
    recentPhotos.find(
      (
        photo
      ) =>
        photo.id ===
        compareLeftId
    ) ||
    null;


  const compareRight =
    recentPhotos.find(
      (
        photo
      ) =>
        photo.id ===
        compareRightId
    ) ||
    null;


  /* ==========================================================
     LOADING
     ========================================================== */

  if (!user) {
    return (
      <div className="
        flex
        items-center
        justify-center
        min-h-[50vh]
      ">
        <Loader2 className="
          w-7
          h-7
          animate-spin
          text-primary
        " />
      </div>
    );
  }


  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <div className="
      px-5
      safe-bottom
    ">

      {/* =====================================================
          PHOTO LIGHTBOX
          ===================================================== */}

      {lightboxUrl && (
        <div
          className="
            fixed
            inset-0
            z-[1000]
            bg-black/90
            flex
            items-center
            justify-center
            p-4
          "
          onClick={() =>
            setLightboxUrl(
              null
            )
          }
        >

          <button
            type="button"
            aria-label="Close photo"
            className="
              absolute
              top-5
              right-5
              z-20
              w-10
              h-10
              rounded-full
              bg-black/70
              text-white
              flex
              items-center
              justify-center
            "
            onClick={() =>
              setLightboxUrl(
                null
              )
            }
          >

            <X className="w-5 h-5" />

          </button>


          <img
            src={
              lightboxUrl
            }
            alt="Progress"
            className="
              max-w-full
              max-h-[90vh]
              object-contain
              rounded-xl
            "
            onClick={(event) =>
              event.stopPropagation()
            }
          />

        </div>
      )}


      {/* =====================================================
          HEADER
          ===================================================== */}

      <PageHeader
        title="Progress Photos"
        subtitle="Track your transformation visually"
      />


      <div className="mb-5" />


      {/* =====================================================
          PLAN BADGES
          ===================================================== */}

      <div className="
        flex
        flex-wrap
        gap-2
        mb-5
      ">

        <span
          className={cn(
            `
              text-[10px]
              font-bold
              px-2.5
              py-1
              rounded-full
              border
            `,

            canCompare
              ? `
                border-primary/40
                bg-primary/10
                text-primary
              `
              : `
                border-border
                bg-muted
                text-muted-foreground
              `
          )}
        >

          {canCompare
            ? '✓'
            : '🔒'}{' '}

          Photo save & compare —
          Progress+

        </span>


        <span
          className={cn(
            `
              text-[10px]
              font-bold
              px-2.5
              py-1
              rounded-full
              border
            `,

            canAnalyze
              ? `
                border-primary/40
                bg-primary/10
                text-primary
              `
              : `
                border-border
                bg-muted
                text-muted-foreground
              `
          )}
        >

          {canAnalyze
            ? '✓'
            : '🔒'}{' '}

          AI Analysis —
          Performance+

        </span>


        <span
          className={cn(
            `
              text-[10px]
              font-bold
              px-2.5
              py-1
              rounded-full
              border
            `,

            canSeeGraph
              ? `
                border-chart-4/40
                bg-chart-4/10
                text-chart-4
              `
              : `
                border-border
                bg-muted
                text-muted-foreground
              `
          )}
        >

          {canSeeGraph
            ? '✓'
            : '🔒'}{' '}

          Progress Graph —
          Elite

        </span>

      </div>


      {/* =====================================================
          UPLOAD
          ===================================================== */}

      <div className="mb-5">

        {uploading ? (

          <div className="
            flex
            items-center
            justify-center
            gap-3
            p-4
            rounded-2xl
            border-2
            border-dashed
            border-border
            bg-card
          ">

            <Loader2 className="
              w-5
              h-5
              animate-spin
              text-primary
            " />

            <span className="
              font-medium
              text-sm
            ">
              Uploading…
            </span>

          </div>

        ) : (

          <div className="
            grid
            grid-cols-2
            gap-3
          ">

            <button
              type="button"
              className="
                flex
                flex-col
                items-center
                gap-2
                p-4
                rounded-2xl
                border-2
                border-dashed
                border-border
                bg-card
                hover:border-primary/50
                transition-colors
              "
              onClick={() =>
                cameraInputRef.current?.click()
              }
            >

              <Camera className="
                w-5
                h-5
                text-primary
              " />

              <span className="
                font-medium
                text-sm
              ">
                Take Photo
              </span>

            </button>


            <button
              type="button"
              className="
                flex
                flex-col
                items-center
                gap-2
                p-4
                rounded-2xl
                border-2
                border-dashed
                border-border
                bg-card
                hover:border-primary/50
                transition-colors
              "
              onClick={() =>
                galleryInputRef.current?.click()
              }
            >

              <ImageIcon className="
                w-5
                h-5
                text-accent
              " />

              <span className="
                font-medium
                text-sm
              ">
                Upload Photo
              </span>

            </button>

          </div>

        )}


        <input
          ref={
            cameraInputRef
          }
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={
            handleFileUpload
          }
          disabled={
            uploading
          }
        />


        <input
          ref={
            galleryInputRef
          }
          type="file"
          accept="image/*"
          className="hidden"
          onChange={
            handleFileUpload
          }
          disabled={
            uploading
          }
        />

      </div>


      {/* =====================================================
          SIDE-BY-SIDE COMPARISON
          ===================================================== */}

      {canCompare &&
        recentPhotos.length >=
          2 && (

        <Card className="
          p-4
          mb-6
        ">

          <div className="
            flex
            items-center
            justify-between
            gap-3
            mb-3
          ">

            <div className="
              flex
              items-center
              gap-2
              min-w-0
            ">

              <ArrowLeftRight className="
                w-4
                h-4
                text-primary
                shrink-0
              " />


              <div className="min-w-0">

                <p className="
                  font-heading
                  font-bold
                  text-sm
                ">
                  Compare Progress
                </p>

                <p className="
                  text-[10px]
                  text-muted-foreground
                ">
                  Put two different dates side by side.
                </p>

              </div>

            </div>


            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setCompareMode(
                  (
                    current
                  ) =>
                    !current
                )
              }
            >
              {
                compareMode
                  ? 'Hide'
                  : 'Compare'
              }
            </Button>

          </div>


          {compareMode && (
            <div className="
              space-y-4
            ">

              {/* Photo selectors */}

              <div className="
                grid
                grid-cols-2
                gap-2
              ">

                <label className="
                  text-[10px]
                  text-muted-foreground
                ">

                  Earlier photo

                  <select
                    value={
                      compareLeftId ||
                      ''
                    }
                    onChange={(
                      event
                    ) =>
                      setCompareLeftId(
                        event.target.value ||
                          null
                      )
                    }
                    className="
                      mt-1
                      w-full
                      h-10
                      rounded-xl
                      border
                      border-border
                      bg-background
                      px-2
                      text-xs
                      text-foreground
                      outline-none
                    "
                  >

                    {recentPhotos.map(
                      (
                        photo
                      ) => (
                        <option
                          key={
                            photo.id
                          }
                          value={
                            photo.id
                          }
                        >
                          {
                            formatPhotoDate(
                              photo
                            )
                          }
                        </option>
                      )
                    )}

                  </select>

                </label>


                <label className="
                  text-[10px]
                  text-muted-foreground
                ">

                  Later photo

                  <select
                    value={
                      compareRightId ||
                      ''
                    }
                    onChange={(
                      event
                    ) =>
                      setCompareRightId(
                        event.target.value ||
                          null
                      )
                    }
                    className="
                      mt-1
                      w-full
                      h-10
                      rounded-xl
                      border
                      border-border
                      bg-background
                      px-2
                      text-xs
                      text-foreground
                      outline-none
                    "
                  >

                    {recentPhotos.map(
                      (
                        photo
                      ) => (
                        <option
                          key={
                            photo.id
                          }
                          value={
                            photo.id
                          }
                        >
                          {
                            formatPhotoDate(
                              photo
                            )
                          }
                        </option>
                      )
                    )}

                  </select>

                </label>

              </div>


              {compareLeftId ===
                compareRightId && (
                <p className="
                  text-[10px]
                  text-amber-500
                  text-center
                ">
                  Choose two different photos to see a comparison.
                </p>
              )}


              {/* Side-by-side images */}

              <div className="
                grid
                grid-cols-2
                gap-2
              ">

                <div className="min-w-0">

                  <p className="
                    text-[10px]
                    font-bold
                    text-muted-foreground
                    uppercase
                    tracking-wider
                    mb-2
                  ">
                    Earlier
                  </p>


                  {getPhotoDisplayUrl(compareLeft) ? (

                    <button
                      type="button"
                      className="
                        block
                        w-full
                        overflow-hidden
                        rounded-xl
                        border
                        border-border
                        bg-black
                      "
                      onClick={() =>
                        setLightboxUrl(
                          getPhotoDisplayUrl(compareLeft)
                        )
                      }
                    >

                      <img
                        src={
                          getPhotoDisplayUrl(compareLeft)
                        }
                        alt="Earlier progress"
                        className="
                          w-full
                          aspect-[3/4]
                          object-contain
                        "
                      />

                    </button>

                  ) : (

                    <div className="
                      aspect-[3/4]
                      rounded-xl
                      bg-muted
                      flex
                      items-center
                      justify-center
                      text-xs
                      text-muted-foreground
                    ">
                      No photo
                    </div>

                  )}


                  <p className="
                    text-[10px]
                    text-muted-foreground
                    text-center
                    mt-2
                  ">
                    {
                      compareLeft
                        ? formatPhotoDate(
                            compareLeft
                          )
                        : '—'
                    }
                  </p>

                </div>


                <div className="min-w-0">

                  <p className="
                    text-[10px]
                    font-bold
                    text-muted-foreground
                    uppercase
                    tracking-wider
                    mb-2
                  ">
                    Later
                  </p>


                  {getPhotoDisplayUrl(compareRight) ? (

                    <button
                      type="button"
                      className="
                        block
                        w-full
                        overflow-hidden
                        rounded-xl
                        border
                        border-border
                        bg-black
                      "
                      onClick={() =>
                        setLightboxUrl(
                          getPhotoDisplayUrl(compareRight)
                        )
                      }
                    >

                      <img
                        src={
                          getPhotoDisplayUrl(compareRight)
                        }
                        alt="Later progress"
                        className="
                          w-full
                          aspect-[3/4]
                          object-contain
                        "
                      />

                    </button>

                  ) : (

                    <div className="
                      aspect-[3/4]
                      rounded-xl
                      bg-muted
                      flex
                      items-center
                      justify-center
                      text-xs
                      text-muted-foreground
                    ">
                      No photo
                    </div>

                  )}


                  <p className="
                    text-[10px]
                    text-muted-foreground
                    text-center
                    mt-2
                  ">
                    {
                      compareRight
                        ? formatPhotoDate(
                            compareRight
                          )
                        : '—'
                    }
                  </p>

                </div>

              </div>


              {/* Compare weight / body-fat data when available */}

              {compareLeft &&
                compareRight && (

                <div className="
                  grid
                  grid-cols-2
                  gap-2
                ">

                  <div className="
                    rounded-xl
                    border
                    border-border
                    bg-muted/30
                    p-3
                  ">

                    <p className="
                      text-[10px]
                      text-muted-foreground
                      uppercase
                      tracking-wider
                      mb-2
                    ">
                      Earlier
                    </p>


                    <div className="
                      space-y-1
                    ">

                      {compareLeft.weight_lbs ? (
                        <p className="text-xs font-semibold">
                          Weight: {
                            displayWeight(
                              compareLeft.weight_lbs,
                              unit
                            )
                          }
                        </p>
                      ) : (
                        <p className="
                          text-[10px]
                          text-muted-foreground
                        ">
                          Weight not logged
                        </p>
                      )}


                      {compareLeft.body_fat_estimate && (
                        <p className="
                          text-xs
                          font-semibold
                        ">
                          AI BF: {
                            compareLeft.body_fat_estimate
                          }
                        </p>
                      )}

                    </div>

                  </div>


                  <div className="
                    rounded-xl
                    border
                    border-border
                    bg-muted/30
                    p-3
                  ">

                    <p className="
                      text-[10px]
                      text-muted-foreground
                      uppercase
                      tracking-wider
                      mb-2
                    ">
                      Later
                    </p>


                    <div className="
                      space-y-1
                    ">

                      {compareRight.weight_lbs ? (
                        <p className="text-xs font-semibold">
                          Weight: {
                            displayWeight(
                              compareRight.weight_lbs,
                              unit
                            )
                          }
                        </p>
                      ) : (
                        <p className="
                          text-[10px]
                          text-muted-foreground
                        ">
                          Weight not logged
                        </p>
                      )}


                      {compareRight.body_fat_estimate && (
                        <p className="
                          text-xs
                          font-semibold
                        ">
                          AI BF: {
                            compareRight.body_fat_estimate
                          }
                        </p>
                      )}

                    </div>

                  </div>

                </div>

              )}

            </div>
          )}

        </Card>
      )}


      {/* =====================================================
          GRAPHS
          ===================================================== */}

      {canSeeGraph &&
        (
          bodyFatGraphData.length >=
            2 ||
          weightGraphData.length >=
            2
        ) && (

        <div className="
          space-y-4
          mb-6
        ">

          {bodyFatGraphData.length >=
            2 && (

            <Card className="p-4">

              <div className="
                flex
                items-center
                gap-2
                mb-1
              ">

                <TrendingDown className="
                  w-4
                  h-4
                  text-primary
                " />

                <p className="
                  font-heading
                  font-bold
                  text-sm
                ">
                  Body Fat Trend
                </p>

              </div>


              <p className="
                text-[10px]
                text-muted-foreground
                mb-3
              ">
                AI estimates only — useful for tracking direction over time.
              </p>


              <ResponsiveContainer
                width="100%"
                height={170}
              >

                <LineChart
                  data={
                    bodyFatGraphData
                  }
                >

                  <CartesianGrid
                    stroke="hsl(var(--border))"
                    strokeDasharray="3 3"
                  />


                  <XAxis
                    dataKey="date"
                    tick={{
                      fontSize:
                        10,

                      fill:
                        'hsl(var(--muted-foreground))',
                    }}
                    axisLine={false}
                    tickLine={false}
                  />


                  <YAxis
                    tick={{
                      fontSize:
                        10,

                      fill:
                        'hsl(var(--muted-foreground))',
                    }}
                    axisLine={false}
                    tickLine={false}
                  />


                  <Tooltip
                    contentStyle={{
                      background:
                        'hsl(var(--card))',

                      border:
                        '1px solid hsl(var(--border))',

                      borderRadius:
                        '8px',

                      fontSize:
                        12,
                    }}
                  />


                  <Line
                    type="monotone"
                    dataKey="bf"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{
                      r: 3,
                    }}
                    activeDot={{
                      r: 5,
                    }}
                  />

                </LineChart>

              </ResponsiveContainer>

            </Card>
          )}


          {weightGraphData.length >=
            2 && (

            <Card className="p-4">

              <div className="
                flex
                items-center
                gap-2
                mb-1
              ">

                <Weight className="
                  w-4
                  h-4
                  text-accent
                " />

                <p className="
                  font-heading
                  font-bold
                  text-sm
                ">
                  Weight Trend
                </p>

              </div>


              <ResponsiveContainer
                width="100%"
                height={170}
              >

                <LineChart
                  data={
                    weightGraphData
                  }
                >

                  <CartesianGrid
                    stroke="hsl(var(--border))"
                    strokeDasharray="3 3"
                  />


                  <XAxis
                    dataKey="date"
                    tick={{
                      fontSize:
                        10,

                      fill:
                        'hsl(var(--muted-foreground))',
                    }}
                    axisLine={false}
                    tickLine={false}
                  />


                  <YAxis
                    tick={{
                      fontSize:
                        10,

                      fill:
                        'hsl(var(--muted-foreground))',
                    }}
                    axisLine={false}
                    tickLine={false}
                  />


                  <Tooltip
                    contentStyle={{
                      background:
                        'hsl(var(--card))',

                      border:
                        '1px solid hsl(var(--border))',

                      borderRadius:
                        '8px',

                      fontSize:
                        12,
                    }}
                  />


                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="hsl(var(--accent))"
                    strokeWidth={2}
                    dot={{
                      r: 3,
                    }}
                    activeDot={{
                      r: 5,
                    }}
                  />

                </LineChart>

              </ResponsiveContainer>

            </Card>
          )}

        </div>
      )}


      {/* =====================================================
          EMPTY STATE
          ===================================================== */}

      {recentPhotos.length ===
        0 && (

        <div className="
          text-center
          py-16
          text-muted-foreground
        ">

          <Camera className="
            w-12
            h-12
            mx-auto
            mb-3
            opacity-30
          " />


          <p className="text-sm">
            No photos yet. Add your first one!
          </p>

        </div>
      )}


      {/* =====================================================
          RECENT-FIRST PHOTO HISTORY
          ===================================================== */}

      <div className="
        space-y-6
      ">

        {Object.entries(
          grouped
        )
          .sort(
            (
              [a],
              [b]
            ) =>
              String(b).localeCompare(
                String(a)
              )
          )
          .map(
            (
              [
                date,
                dayPhotos,
              ]
            ) => (

              <section
                key={
                  date
                }
              >

                <div className="
                  flex
                  items-center
                  justify-between
                  mb-3
                ">

                  <p className="
                    text-xs
                    font-bold
                    text-muted-foreground
                    uppercase
                    tracking-widest
                  ">
                    {
                      formatPhotoDateHeading(
                        date
                      )
                    }
                  </p>


                  <span className="
                    text-[10px]
                    text-muted-foreground
                  ">
                    {
                      dayPhotos.length
                    }{' '}

                    photo
                    {
                      dayPhotos.length ===
                      1
                        ? ''
                        : 's'
                    }
                  </span>

                </div>


                <div className="
                  space-y-4
                ">

                  {dayPhotos.map(
                    (
                      photo
                    ) => (

                      <Card
                        key={
                          photo.id
                        }
                        className="
                          overflow-hidden
                        "
                      >

                        {/* Photo */}

                        <button
                          type="button"
                          className="
                            block
                            w-full
                            bg-black
                          "
                          onClick={() =>
                            setLightboxUrl(
                              photo.photo_url
                            )
                          }
                        >

                          <img
                            src={
                              getPhotoDisplayUrl(photo)
                            }
                            alt="Progress"
                            className="
                              w-full
                              object-contain
                              max-h-72
                            "
                          />

                        </button>


                        <div className="
                          p-4
                          space-y-3
                        ">

                          {/* Weight */}

                          {photo.weight_lbs ? (

                            <div className="
                              flex
                              items-center
                              gap-2
                              text-sm
                            ">

                              <Weight className="
                                w-4
                                h-4
                                text-primary
                              " />

                              <span className="
                                font-semibold
                              ">
                                {
                                  displayWeight(
                                    photo.weight_lbs,
                                    unit
                                  )
                                }
                              </span>

                            </div>

                          ) : (

                            <div className="
                              flex
                              gap-2
                            ">

                              <Input
                                type="number"
                                inputMode="decimal"
                                placeholder={`Log weight (${weightUnit(
                                  unit
                                )})`}
                                className="
                                  h-9
                                  text-sm
                                "
                                value={
                                  pendingWeight[
                                    photo.id
                                  ] ||
                                  ''
                                }
                                onChange={(
                                  event
                                ) =>
                                  setPendingWeight(
                                    (
                                      previous
                                    ) => ({
                                      ...previous,

                                      [photo.id]:
                                        event.target.value,
                                    })
                                  )
                                }
                              />


                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleLogWeight(
                                    photo
                                  )
                                }
                              >
                                Save
                              </Button>

                            </div>

                          )}


                          {/* AI analysis */}

                          {canAnalyze ? (

                            photo.ai_insights ? (

                              <div className="
                                bg-primary/8
                                rounded-xl
                                p-3
                                space-y-2
                                border
                                border-primary/15
                              ">

                                <div className="
                                  flex
                                  items-center
                                  gap-2
                                ">

                                  <Sparkles className="
                                    w-3.5
                                    h-3.5
                                    text-primary
                                  " />


                                  <p className="
                                    text-xs
                                    font-bold
                                    text-primary
                                    uppercase
                                    tracking-wider
                                  ">
                                    Kael's Take
                                  </p>


                                  {photo.body_fat_estimate && (

                                    <span className="
                                      ml-auto
                                      text-xs
                                      font-semibold
                                      text-muted-foreground
                                    ">
                                      ~{
                                        photo.body_fat_estimate
                                      }{' '}
                                      BF
                                    </span>

                                  )}

                                </div>


                                <p className="
                                  text-sm
                                  leading-relaxed
                                ">
                                  {
                                    photo.ai_insights
                                  }
                                </p>


                                <p className="
                                  text-[10px]
                                  text-muted-foreground
                                  italic
                                ">
                                  ⚠️ AI estimate only — not medically precise
                                </p>

                              </div>

                            ) : (

                              <div className="
                                space-y-2
                              ">

                                {analysisError[
                                  photo.id
                                ] && (

                                  <div className="
                                    flex
                                    items-start
                                    gap-2
                                    p-3
                                    rounded-xl
                                    border
                                    border-destructive/30
                                    bg-destructive/5
                                  ">

                                    <AlertCircle className="
                                      w-4
                                      h-4
                                      text-destructive
                                      shrink-0
                                      mt-0.5
                                    " />


                                    <p className="
                                      text-xs
                                      text-destructive
                                      leading-relaxed
                                    ">
                                      {
                                        analysisError[
                                          photo.id
                                        ]
                                      }
                                    </p>

                                  </div>

                                )}


                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="
                                    w-full
                                    gap-2
                                  "
                                  disabled={
                                    analyzing ===
                                    photo.id
                                  }
                                  onClick={() =>
                                    handleAnalyze(
                                      photo
                                    )
                                  }
                                >

                                  {analyzing ===
                                  photo.id ? (

                                    <>

                                      <Loader2 className="
                                        w-4
                                        h-4
                                        animate-spin
                                      " />

                                      Analyzing…

                                    </>

                                  ) : (

                                    <>

                                      <Scan className="
                                        w-4
                                        h-4
                                      " />

                                      {
                                        analysisError[
                                          photo.id
                                        ]
                                          ? 'Try Analysis Again'
                                          : "Get Kael's Analysis"
                                      }

                                    </>

                                  )}

                                </Button>

                              </div>

                            )

                          ) : (

                            <div className="
                              flex
                              items-center
                              gap-2
                              p-3
                              rounded-xl
                              bg-muted/50
                              border
                              border-border
                            ">

                              <Lock className="
                                w-4
                                h-4
                                text-muted-foreground
                                shrink-0
                              " />


                              <p className="
                                text-xs
                                text-muted-foreground
                              ">

                                AI body analysis is available on the{' '}

                                <span className="
                                  font-semibold
                                  text-primary
                                ">
                                  Performance
                                </span>{' '}

                                plan and above.

                              </p>

                            </div>

                          )}


                          {/* Delete */}

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="
                              w-full
                              text-destructive
                              hover:text-destructive
                              gap-2
                            "
                            onClick={() =>
                              handleDelete(
                                photo
                              )
                            }
                            disabled={
                              deleteMutation.isPending
                            }
                          >

                            <Trash2 className="
                              w-4
                              h-4
                            " />

                            Delete

                          </Button>

                        </div>

                      </Card>

                    )
                  )}

                </div>

              </section>

            )
          )}

      </div>


      {/* =====================================================
          PROGRESS+ EXPLANATION
          ===================================================== */}

      {canCompare &&
        recentPhotos.length >=
          2 && (

        <div className="
          mt-6
          mb-4
          flex
          items-start
          gap-2
          rounded-xl
          border
          border-primary/15
          bg-primary/5
          p-3
        ">

          <Check className="
            w-4
            h-4
            text-primary
            shrink-0
            mt-0.5
          " />


          <p className="
            text-xs
            text-muted-foreground
            leading-relaxed
          ">

            Progress+ lets you save your progress photos and
            compare two different dates side by side so you can
            clearly see how your physique has changed.

          </p>

        </div>
      )}

    </div>
  );
}
