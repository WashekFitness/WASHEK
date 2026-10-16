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
  Tag,
  Tags,
  Calendar,
  Search,
  Filter,
  Edit3,
  Plus,
  Download,
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
  Badge,
} from '@/components/ui/badge';

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
import PhotoTagModal from '@/components/photos/PhotoTagModal';


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
   PHOTO COMPRESSION FOR INSTANT UPLOAD & RAPID AI ANALYSIS
   ========================================================== */

async function compressImageFile(file, maxDimension = 1600, quality = 0.86) {
  if (!file || !file.type?.startsWith('image/')) return file;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width <= maxDimension && height <= maxDimension && file.size < 500 * 1024) {
          resolve(file);
          return;
        }
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const cleanName = (file.name || 'photo').replace(/\.[^/.]+$/, '') + '.jpg';
            resolve(new File([blob], cleanName, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    } catch {
      resolve(file);
    }
  });
}

/* ==========================================================
   PAGE
   ========================================================== */

function getPhotoDisplayUrl(photo) {
  if (!photo) return null;
  const candidate = photo?.resolved_photo_url || photo?.photo_url || photo?.file_url;
  if (!candidate) return null;
  const str = String(candidate).trim();
  if (!str) return null;
  if (
    str.startsWith('http://') ||
    str.startsWith('https://') ||
    str.startsWith('data:') ||
    str.startsWith('blob:')
  ) {
    return str;
  }
  // Construct clean Supabase storage public URL for raw storage paths
  const cleanPath = str.replace(/^\/+/, '');
  return `https://edvvwnaxmjuvwnxineph.supabase.co/storage/v1/object/public/media/${cleanPath}`;
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
    useState(() => {
      try {
        const raw = localStorage.getItem('washek_user');
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    });

  const userKey = user?.email || user?.id || 'athlete';


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

  const [
    lightboxPhoto,
    setLightboxPhoto,
  ] =
    useState(null);

  const [
    lightboxDragY,
    setLightboxDragY,
  ] =
    useState(0);

  const [
    isLightboxDragging,
    setIsLightboxDragging,
  ] =
    useState(false);

  const lightboxStartYRef = useRef(0);
  const lightboxDragYRef = useRef(0);
  const isLightboxDraggingRef = useRef(false);

  const [
    editingPhoto,
    setEditingPhoto,
  ] =
    useState(null);

  const [
    uploadModalOpen,
    setUploadModalOpen,
  ] =
    useState(false);

  const [
    pendingFile,
    setPendingFile,
  ] =
    useState(null);

  const [
    pendingFilePreview,
    setPendingFilePreview,
  ] =
    useState(null);

  const [
    activeTagFilter,
    setActiveTagFilter,
  ] =
    useState('all');

  const [
    searchQuery,
    setSearchQuery,
  ] =
    useState('');

  const [
    photoToDelete,
    setPhotoToDelete,
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
        userKey,
      ],

      queryFn:
        async () => {
          const rows =
            await supabaseApi.entities.ProgressPhoto.filter(
              {
                created_by: userKey,
              },

              '-date',

              100
            );

          return Promise.all(
            rows.map(async (photo) => {
              const directUrl = getPhotoDisplayUrl(photo);
              let resolved = photo?.resolved_photo_url;
              if (!resolved && photo?.photo_url) {
                resolved = await supabaseApi.storage.resolveMediaUrl(
                  photo.photo_url,
                  3600
                );
              }
              return {
                ...photo,
                resolved_photo_url: resolved || directUrl,
              };
            })
          );
        },

      enabled: true,
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

  /*
   * Collect all unique tags and their counts across the user's photos.
   */
  const allTags = useMemo(() => {
    const counts = new Map();
    photos.forEach((photo) => {
      let photoTags = [];
      if (Array.isArray(photo?.tags)) {
        photoTags = photo.tags;
      } else if (typeof photo?.tag === 'string' && photo.tag.trim()) {
        photoTags = [photo.tag.trim()];
      }
      photoTags.forEach((rawTag) => {
        const tag = String(rawTag).trim();
        if (tag) {
          counts.set(tag, (counts.get(tag) || 0) + 1);
        }
      });
    });
    return Array.from(counts.entries()).map(([tag, count]) => ({ tag, count }));
  }, [photos]);

  /*
   * Filtered photos based on active tag filter and search query.
   */
  const filteredPhotos = useMemo(() => {
    return recentPhotos.filter((photo) => {
      // 1. Tag filter
      if (activeTagFilter !== 'all') {
        let photoTags = [];
        if (Array.isArray(photo?.tags)) {
          photoTags = photo.tags.map((t) => String(t).toLowerCase());
        } else if (typeof photo?.tag === 'string' && photo.tag.trim()) {
          photoTags = [photo.tag.trim().toLowerCase()];
        }
        if (!photoTags.includes(activeTagFilter.toLowerCase())) {
          return false;
        }
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const labelText = String(photo?.label || photo?.custom_label || '').toLowerCase();
        const dateText = String(photo?.date || '').toLowerCase();
        const tagsText = Array.isArray(photo?.tags) ? photo.tags.join(' ').toLowerCase() : '';
        if (!labelText.includes(query) && !dateText.includes(query) && !tagsText.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [recentPhotos, activeTagFilter, searchQuery]);


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

      onMutate:
        async (id) => {
          await queryClient.cancelQueries({
            queryKey: ['progress-photos'],
          });
          queryClient.setQueriesData(
            { queryKey: ['progress-photos'] },
            (old) => {
              if (!Array.isArray(old)) return [];
              return old.filter((item) => item?.id !== id);
            }
          );
        },

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

      onError:
        (err) => {
          queryClient.invalidateQueries({
            queryKey: [
              'progress-photos',
            ],
          });
          toast.error(
            err?.message || 'Failed to delete photo.'
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
        (updatedPhoto, variables) => {
          const mergedItem = { ...(variables?.data || {}), ...(updatedPhoto || {}), id: variables.id };

          // 1. Instantly update all matching React Query caches
          queryClient.setQueriesData(
            { queryKey: ['progress-photos'] },
            (oldData) => {
              if (!Array.isArray(oldData)) return oldData;
              return oldData.map((item) =>
                item.id === variables.id ? { ...item, ...mergedItem } : item
              );
            }
          );

          // 2. Instantly update lightbox preview if open
          setLightboxPhoto((prev) => {
            if (prev && prev.id === variables.id) {
              return { ...prev, ...mergedItem };
            }
            return prev;
          });

          // 3. Invalidate to guarantee background sync
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
     UPLOAD & TAGGING HANDLERS
     ========================================================== */

  const handleFileSelected = async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      event.target.value = '';
      return;
    }

    try {
      const preview = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });

      setPendingFile(file);
      setPendingFilePreview(preview || URL.createObjectURL(file));
      setUploadModalOpen(true);
    } catch {
      setPendingFile(file);
      setPendingFilePreview(null);
      setUploadModalOpen(true);
    } finally {
      event.target.value = '';
    }
  };

  const handleSaveNewPhoto = async ({ date, label, custom_label, tags, weight_lbs }) => {
    if (!pendingFile) return;

    setUploading(true);
    try {
      const fileToUpload = await compressImageFile(pendingFile, 1600, 0.86);

      let uploaded = null;
      let localPreviewUrl = pendingFilePreview;

      try {
        uploaded = await supabaseApi.storage.uploadFile({
          file: fileToUpload,
        });
      } catch (uploadErr) {
        console.warn('[ProgressPhotos] Remote upload note:', uploadErr?.message || uploadErr);
        if (localPreviewUrl) {
          uploaded = {
            path: localPreviewUrl,
            file_url: localPreviewUrl,
          };
        } else {
          throw uploadErr;
        }
      }

      const photoPath = uploaded?.path || localPreviewUrl;
      const photoUrl = uploaded?.file_url || localPreviewUrl;

      await createMutation.mutateAsync({
        photo_url: photoPath,
        resolved_photo_url: photoUrl,
        created_by: userKey,
        date: date || today,
        created_date: date || today,
        label: label || '',
        custom_label: custom_label || label || '',
        tags: Array.isArray(tags) ? tags : [],
        weight_lbs: weight_lbs,
      });

      if (weight_lbs && userKey) {
        try {
          await supabaseApi.entities.WeightHistory?.create?.({
            weight_lbs,
            date: date || today,
            created_by: userKey,
            note: label ? `Progress photo: ${label}` : 'Progress photo check-in',
          });
        } catch {
          // ignore
        }
      }

      setUploadModalOpen(false);
      setPendingFile(null);
      setPendingFilePreview(null);
    } catch (error) {
      console.error('[ProgressPhotos] Upload failed:', error);
      toast.error(error?.message || 'The photo could not be uploaded.');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveEditPhoto = async ({ date, label, custom_label, tags, weight_lbs }) => {
    if (!editingPhoto?.id) return;

    try {
      const updatedFields = {
        ...editingPhoto,
        date: date || editingPhoto.date || today,
        created_date: date || editingPhoto.date || today,
        label: label !== undefined ? label : (editingPhoto.label || ''),
        custom_label: custom_label !== undefined ? custom_label : (editingPhoto.custom_label || ''),
        tags: Array.isArray(tags) ? tags : (editingPhoto.tags || []),
        weight_lbs: weight_lbs !== undefined ? weight_lbs : (editingPhoto.weight_lbs ?? null),
        created_by: editingPhoto.created_by || userKey,
      };

      await updateMutation.mutateAsync({
        id: editingPhoto.id,
        data: updatedFields,
      });

      // If weight was updated, record in weight history as well
      if (weight_lbs && Number.isFinite(Number(weight_lbs)) && userKey) {
        try {
          await supabaseApi.entities.WeightHistory?.create?.({
            date: date || editingPhoto.date || today,
            weight_lbs: Number(weight_lbs),
            created_by: userKey,
          });
        } catch (_wErr) {
          console.debug('[ProgressPhotos] WeightHistory sync note:', _wErr);
        }
      }

      toast.success('Photo details & weight updated!');
      setEditingPhoto(null);
    } catch (error) {
      toast.error(error?.message || 'Could not update photo details.');
    }
  };

  const handleDownloadPhoto = async (url, photo) => {
    try {
      toast.info('Saving photo to device…');
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const fileName = `washek-progress-${photo?.date || new Date().toISOString().slice(0, 10)}.jpg`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast.success('Photo saved to your device!');
    } catch (err) {
      console.warn('[ProgressPhotos] Download note:', err);
      // Direct fallback
      window.open(url, '_blank');
      toast.success('Photo opened to save!');
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


        let photoUrl =
          getPhotoDisplayUrl(photo);

        if (!photoUrl && photo?.photo_url) {
          try {
            photoUrl = await supabaseApi.storage.resolveMediaUrl(photo.photo_url, 3600);
          } catch (resErr) {
            console.warn('[ProgressPhotos] Failed to resolve photo URL:', resErr);
          }
        }

        if (!photoUrl && photo?.photo_url) {
          photoUrl = photo.photo_url;
        }

        if (!photoUrl) {
          throw new Error(
            'This progress photo does not have a valid image URL.'
          );
        }

        const rawResult =
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

        let parsed = rawResult;
        if (typeof parsed === 'string') {
          try {
            const clean = parsed
              .replace(/^\uFEFF/, '')
              .replace(/^```(?:json)?\s*/i, '')
              .replace(/\s*```$/i, '')
              .trim();
            parsed = JSON.parse(clean);
          } catch {
            // Keep
          }
        }

        if (parsed?.error || parsed?.message) {
          throw new Error(parsed.error || parsed.message);
        }

        let bodyFatRange =
          String(
            parsed?.body_fat_range ||
              ''
          ).trim();

        let bodyFatNumeric =
          Number(
            parsed?.body_fat_numeric
          );

        // Smart extraction if format was string or numeric had subtle variations
        if (!Number.isFinite(bodyFatNumeric) && bodyFatRange) {
          const match = bodyFatRange.match(/(\d+(?:\.\d+)?)[^\d]+(\d+(?:\.\d+)?)/);
          if (match) {
            bodyFatNumeric = Number(((parseFloat(match[1]) + parseFloat(match[2])) / 2).toFixed(1));
          } else {
            const single = bodyFatRange.match(/(\d+(?:\.\d+)?)/);
            if (single) {
              bodyFatNumeric = Number(parseFloat(single[1]).toFixed(1));
            }
          }
        }

        if (!bodyFatRange && Number.isFinite(bodyFatNumeric)) {
          bodyFatRange = `${(bodyFatNumeric - 1.5).toFixed(1)}-${(bodyFatNumeric + 1.5).toFixed(1)}%`;
        }

        const insights =
          String(
            parsed?.insights ||
              parsed?.coaching_insights ||
              parsed?.summary ||
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

  const handleLogWeight = async (photo) => {
    const clean = String(pendingWeight[photo.id] || '').replace(',', '.').trim();
    const raw = parseFloat(clean);

    if (!Number.isFinite(raw) || raw <= 0) {
      toast.error('Enter a valid weight first.');
      return;
    }

    const weightLbs =
      unit === 'metric'
        ? Math.round((raw / 0.453592) * 10) / 10
        : Math.round(raw * 10) / 10;

    try {
      await updateMutation.mutateAsync({
        id: photo.id,
        data: {
          ...photo,
          weight_lbs: weightLbs,
          created_by: photo.created_by || userKey,
        },
      });

      if (userKey) {
        try {
          await supabaseApi.entities.WeightHistory?.create?.({
            date: photo.date || today,
            weight_lbs: weightLbs,
            created_by: userKey,
          });
        } catch (_wErr) {
          console.debug('[ProgressPhotos] WeightHistory log note:', _wErr);
        }
      }

      setPendingWeight((previous) => ({
        ...previous,
        [photo.id]: '',
      }));

      toast.success('Weight logged!');
    } catch (error) {
      toast.error(error?.message || 'Weight could not be saved.');
    }
  };


  /* ==========================================================
     DELETE HANDLERS (NO WINDOW.CONFIRM)
     ========================================================== */

  const handleDelete = (photo) => {
    if (!photo?.id || deleteMutation.isPending) {
      return;
    }
    setPhotoToDelete(photo);
  };

  const handleConfirmDelete = async () => {
    if (!photoToDelete?.id) return;
    const id = photoToDelete.id;
    setPhotoToDelete(null);

    if (lightboxPhoto?.id === id) {
      setLightboxUrl(null);
      setLightboxPhoto(null);
    }

    if (editingPhoto?.id === id) {
      setEditingPhoto(null);
    }

    try {
      await deleteMutation.mutateAsync(id);
    } catch {
      // Handled in onError
    }
  };


  /* ==========================================================
     GROUP BY DATE
     ========================================================== */

  const grouped =
    useMemo(
      () => {
        const groups =
          {};

        filteredPhotos.forEach(
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
        filteredPhotos,
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
          PHOTO LIGHTBOX (WITH LOWERED CLOSE BUTTON & DETAILS)
          ===================================================== */}

      {lightboxUrl && (
        <div
          className="
            fixed
            inset-0
            z-[1000]
            bg-black/92
            backdrop-blur-md
            flex
            flex-col
            items-center
            justify-between
            p-4
            sm:p-6
          "
          style={{
            transform:
              lightboxDragY > 0
                ? `translateY(${lightboxDragY}px)`
                : undefined,
            opacity:
              lightboxDragY > 0
                ? Math.max(0.15, 1 - lightboxDragY / 350)
                : 1,
            transition: isLightboxDragging
              ? 'none'
              : 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease-out',
          }}
          onClick={() => {
            setLightboxUrl(null);
            setLightboxPhoto(null);
          }}
        >
          {/* Pull Down Handle Bar for Lightbox (Interactive on touch, mouse, and click) */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Pull down to close photo"
            className="w-full max-w-4xl pt-4 pb-2 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none z-40 group hover:bg-white/5 transition-colors"
            onTouchStart={(e) => {
              lightboxStartYRef.current = e.touches[0].clientY;
              lightboxDragYRef.current = 0;
              isLightboxDraggingRef.current = true;
              setIsLightboxDragging(true);
            }}
            onTouchMove={(e) => {
              if (!isLightboxDraggingRef.current) return;
              const delta = e.touches[0].clientY - lightboxStartYRef.current;
              const val = delta > 0 ? delta : 0;
              lightboxDragYRef.current = val;
              setLightboxDragY(val);
              if (e.cancelable) e.preventDefault();
            }}
            onTouchEnd={() => {
              if (!isLightboxDraggingRef.current) return;
              isLightboxDraggingRef.current = false;
              setIsLightboxDragging(false);
              if (lightboxDragYRef.current > 35) {
                setLightboxUrl(null);
                setLightboxPhoto(null);
              }
              setLightboxDragY(0);
              lightboxDragYRef.current = 0;
            }}
            onMouseDown={(e) => {
              lightboxStartYRef.current = e.clientY;
              lightboxDragYRef.current = 0;
              isLightboxDraggingRef.current = true;
              setIsLightboxDragging(true);
              const onMouseMove = (ev) => {
                if (!isLightboxDraggingRef.current) return;
                const delta = ev.clientY - lightboxStartYRef.current;
                const val = delta > 0 ? delta : 0;
                lightboxDragYRef.current = val;
                setLightboxDragY(val);
              };
              const onMouseUp = () => {
                if (!isLightboxDraggingRef.current) return;
                isLightboxDraggingRef.current = false;
                setIsLightboxDragging(false);
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                if (lightboxDragYRef.current > 35) {
                  setLightboxUrl(null);
                  setLightboxPhoto(null);
                }
                setLightboxDragY(0);
                lightboxDragYRef.current = 0;
              };
              window.addEventListener('mousemove', onMouseMove);
              window.addEventListener('mouseup', onMouseUp);
            }}
            onClick={() => {
              setLightboxUrl(null);
              setLightboxPhoto(null);
              setLightboxDragY(0);
              lightboxDragYRef.current = 0;
            }}
          >
            <div className="w-16 h-1.5 rounded-full bg-white/50 group-hover:bg-white/80 active:bg-primary transition-all duration-150" />
            <span className="text-[11px] text-white/60 group-hover:text-white/90 mt-1 select-none font-medium">
              pull down or tap to close
            </span>
          </div>

          {/* Top Header Bar with Save Photo, Edit, Delete and Close buttons */}
          <div
            className="
              w-full
              max-w-4xl
              flex
              items-center
              justify-between
              pt-2
              sm:pt-3
              pb-3
              px-2
              z-30
            "
            onTouchStart={(e) => {
              if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
                lightboxStartYRef.current = e.touches[0].clientY;
                lightboxDragYRef.current = 0;
                isLightboxDraggingRef.current = true;
                setIsLightboxDragging(true);
              }
            }}
            onTouchMove={(e) => {
              if (!isLightboxDraggingRef.current) return;
              if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
                const delta = e.touches[0].clientY - lightboxStartYRef.current;
                const val = delta > 0 ? delta : 0;
                lightboxDragYRef.current = val;
                setLightboxDragY(val);
                if (e.cancelable) e.preventDefault();
              }
            }}
            onTouchEnd={() => {
              if (!isLightboxDraggingRef.current) return;
              isLightboxDraggingRef.current = false;
              setIsLightboxDragging(false);
              if (lightboxDragYRef.current > 35) {
                setLightboxUrl(null);
                setLightboxPhoto(null);
              }
              setLightboxDragY(0);
              lightboxDragYRef.current = 0;
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0 pr-3">
              {lightboxPhoto?.label || lightboxPhoto?.custom_label ? (
                <p className="font-bold text-white text-sm sm:text-base truncate">
                  {lightboxPhoto?.label || lightboxPhoto?.custom_label}
                </p>
              ) : null}
              <p className="text-xs text-white/75 flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span>
                  {lightboxPhoto
                    ? formatPhotoDate(lightboxPhoto)
                    : 'Progress Photo'}
                </span>
                {lightboxPhoto?.weight_lbs ? (
                  <span className="text-white/60">
                    • {displayWeight(lightboxPhoto.weight_lbs, unit)}
                  </span>
                ) : null}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Prominent Save / Download Photo button */}
              <button
                type="button"
                aria-label="Save photo to device"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadPhoto(lightboxUrl, lightboxPhoto);
                }}
                className="
                  h-9
                  px-3.5
                  rounded-full
                  bg-primary
                  text-primary-foreground
                  hover:bg-primary/90
                  flex
                  items-center
                  gap-1.5
                  font-bold
                  text-xs
                  shadow-lg
                  shadow-primary/30
                  transition-all
                  hover:scale-105
                  active:scale-95
                  cursor-pointer
                "
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>

              {/* Edit Details */}
              <button
                type="button"
                aria-label="Edit photo details"
                className="
                  h-9
                  px-3
                  rounded-full
                  bg-white/15
                  hover:bg-white/25
                  border
                  border-white/20
                  text-white
                  flex
                  items-center
                  gap-1.5
                  font-semibold
                  text-xs
                  shadow-md
                  transition-all
                  hover:scale-105
                  active:scale-95
                  cursor-pointer
                "
                onClick={(e) => {
                  e.stopPropagation();
                  if (lightboxPhoto) {
                    setEditingPhoto(lightboxPhoto);
                    setLightboxUrl(null);
                    setLightboxPhoto(null);
                  }
                }}
              >
                <Tag className="w-3.5 h-3.5 text-primary" />
                <span className="hidden xs:inline">Edit</span>
              </button>

              {/* Delete button */}
              <button
                type="button"
                aria-label="Delete photo"
                className="
                  w-9
                  h-9
                  rounded-full
                  bg-white/10
                  hover:bg-destructive/80
                  border
                  border-white/20
                  text-white/80
                  hover:text-white
                  flex
                  items-center
                  justify-center
                  cursor-pointer
                  shadow-md
                  transition-all
                  hover:scale-105
                  active:scale-95
                "
                onClick={() => {
                  if (lightboxPhoto) handleDelete(lightboxPhoto);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {/* Close button (X) */}
              <button
                type="button"
                aria-label="Close photo"
                className="
                  w-9
                  h-9
                  rounded-full
                  bg-white/15
                  hover:bg-white/25
                  border
                  border-white/20
                  text-white
                  flex
                  items-center
                  justify-center
                  cursor-pointer
                  shadow-md
                  transition-all
                  hover:scale-105
                  active:scale-95
                "
                onClick={() => {
                  setLightboxUrl(null);
                  setLightboxPhoto(null);
                }}
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Center Image */}
          <div className="flex-1 flex items-center justify-center w-full max-w-4xl py-2 overflow-hidden">
            <img
              src={lightboxUrl}
              alt="Progress photo preview"
              className="
                max-w-full
                max-h-[76vh]
                object-contain
                rounded-xl
                shadow-2xl
              "
              onClick={(event) => event.stopPropagation()}
              onError={(e) => {
                console.warn('[ProgressPhotos] Lightbox image load note for:', lightboxUrl);
                if (lightboxUrl && !lightboxUrl.includes('/storage/v1/object/public/media/')) {
                  const match = lightboxUrl.match(/media\/([^?]+)/);
                  if (match && match[1]) {
                    e.currentTarget.src = `https://edvvwnaxmjuvwnxineph.supabase.co/storage/v1/object/public/media/${match[1]}`;
                  }
                }
              }}
            />
          </div>

          {/* Bottom Bar: Tags */}
          {lightboxPhoto && Array.isArray(lightboxPhoto.tags) && lightboxPhoto.tags.length > 0 && (
            <div
              className="
                w-full
                max-w-4xl
                flex
                flex-wrap
                items-center
                justify-center
                gap-1.5
                pt-2
                pb-4
                z-20
              "
              onClick={(e) => e.stopPropagation()}
            >
              {lightboxPhoto.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================
          PHOTO TAG & DETAILS MODALS
          ===================================================== */}

      <PhotoTagModal
        isOpen={uploadModalOpen}
        onClose={() => {
          setUploadModalOpen(false);
          setPendingFile(null);
          setPendingFilePreview(null);
        }}
        previewUrl={pendingFilePreview}
        onSave={handleSaveNewPhoto}
        isSaving={uploading}
        unit={unit}
      />

      <PhotoTagModal
        isOpen={!!editingPhoto}
        onClose={() => setEditingPhoto(null)}
        photo={editingPhoto}
        onSave={handleSaveEditPhoto}
        onDelete={handleDelete}
        isSaving={updateMutation.isPending}
        unit={unit}
      />

      {/* =====================================================
          DELETE CONFIRMATION MODAL (IN-APP DIALOG)
          ===================================================== */}

      {photoToDelete && (
        <div
          className="fixed inset-0 z-[1100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-50"
          onClick={() => !deleteMutation.isPending && setPhotoToDelete(null)}
        >
          <div
            className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-5 text-card-foreground animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-heading font-bold text-base leading-tight">
                  Delete Progress Photo?
                </h3>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {formatPhotoDate(photoToDelete)}
                  {photoToDelete.label || photoToDelete.custom_label
                    ? ` • ${photoToDelete.label || photoToDelete.custom_label}`
                    : ''}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed mb-5">
              Are you sure you want to delete this progress photo? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPhotoToDelete(null)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
                className="gap-1.5"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting…</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Photo</span>
                  </>
                )}
              </Button>
            </div>
          </div>
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
            handleFileSelected
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
            handleFileSelected
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
                          {formatPhotoDate(photo)}
                          {photo.label || photo.custom_label
                            ? ` — ${photo.label || photo.custom_label}`
                            : Array.isArray(photo.tags) && photo.tags.length > 0
                            ? ` — ${photo.tags[0]}`
                            : ''}
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
                          {formatPhotoDate(photo)}
                          {photo.label || photo.custom_label
                            ? ` — ${photo.label || photo.custom_label}`
                            : Array.isArray(photo.tags) && photo.tags.length > 0
                            ? ` — ${photo.tags[0]}`
                            : ''}
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
                      onClick={() => {
                        setLightboxUrl(
                          getPhotoDisplayUrl(compareLeft)
                        );
                        setLightboxPhoto(compareLeft);
                      }}
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
                        onError={(e) => {
                          if (compareLeft?.photo_url && !e.currentTarget.src.includes('/storage/v1/object/public/media/')) {
                            const clean = String(compareLeft.photo_url).replace(/^\/+/, '');
                            e.currentTarget.src = `https://edvvwnaxmjuvwnxineph.supabase.co/storage/v1/object/public/media/${clean}`;
                          }
                        }}
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
                      onClick={() => {
                        setLightboxUrl(
                          getPhotoDisplayUrl(compareRight)
                        );
                        setLightboxPhoto(compareRight);
                      }}
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
                        onError={(e) => {
                          if (compareRight?.photo_url && !e.currentTarget.src.includes('/storage/v1/object/public/media/')) {
                            const clean = String(compareRight.photo_url).replace(/^\/+/, '');
                            e.currentTarget.src = `https://edvvwnaxmjuvwnxineph.supabase.co/storage/v1/object/public/media/${clean}`;
                          }
                        }}
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
          RECENT-FIRST PHOTO HISTORY & TAG FILTER
          ===================================================== */}

      {recentPhotos.length > 0 && (
        <div className="space-y-3 mb-6 bg-card border border-border/70 rounded-2xl p-3.5 shadow-sm">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by label, tag, or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-9 text-xs bg-background"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Tag Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => setActiveTagFilter('all')}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full font-medium transition-all shrink-0 border',
                activeTagFilter === 'all'
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm font-semibold'
                  : 'bg-muted/60 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
              )}
            >
              All ({recentPhotos.length})
            </button>

            {allTags.map(({ tag, count }) => {
              const isSelected = activeTagFilter.toLowerCase() === tag.toLowerCase();
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setActiveTagFilter(isSelected ? 'all' : tag)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-full font-medium transition-all shrink-0 border flex items-center gap-1.5',
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm font-semibold'
                      : 'bg-muted/60 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                  )}
                >
                  <span>#{tag}</span>
                  <span className="text-[10px] opacity-80 font-bold">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Active filter summary */}
          {(activeTagFilter !== 'all' || searchQuery) && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
              <span>
                Showing {filteredPhotos.length} of {recentPhotos.length} photos
                {activeTagFilter !== 'all' && (
                  <>
                    {' '}tagged <strong className="text-primary font-semibold">#{activeTagFilter}</strong>
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveTagFilter('all');
                  setSearchQuery('');
                }}
                className="text-primary hover:underline font-medium text-[11px]"
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filtered empty state */}
      {recentPhotos.length > 0 && filteredPhotos.length === 0 && (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-2xl bg-card/50 my-6">
          <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No progress photos match your filter</p>
          <p className="text-xs text-muted-foreground mt-1">
            Try a different tag or search keyword.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 text-xs"
            onClick={() => {
              setActiveTagFilter('all');
              setSearchQuery('');
            }}
          >
            Clear Filters
          </Button>
        </div>
      )}

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
                            cursor-pointer
                            group
                            relative
                          "
                          onClick={async () => {
                            let url = getPhotoDisplayUrl(photo);
                            if (
                              !url ||
                              (
                                !url.startsWith('http://') &&
                                !url.startsWith('https://') &&
                                !url.startsWith('data:') &&
                                !url.startsWith('blob:')
                              )
                            ) {
                              try {
                                const resolved =
                                  await supabaseApi.storage.resolveMediaUrl(
                                    photo.photo_url,
                                    3600
                                  );
                                if (resolved) url = resolved;
                              } catch {
                                // keep url
                              }
                            }
                            if (url) {
                              setLightboxUrl(url);
                              setLightboxPhoto(photo);
                            } else {
                              toast.error('Unable to open photo.');
                            }
                          }}
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
                              transition-transform
                              duration-200
                              group-hover:scale-[1.01]
                            "
                            onError={(e) => {
                              if (
                                photo?.photo_url &&
                                !e.currentTarget.src.includes(
                                   '/storage/v1/object/public/media/'
                                )
                              ) {
                                const clean = String(photo.photo_url).replace(
                                  /^\/+/,
                                  ''
                                );
                                e.currentTarget.src = `https://edvvwnaxmjuvwnxineph.supabase.co/storage/v1/object/public/media/${clean}`;
                              }
                            }}
                          />

                        </button>


                        <div className="
                          p-4
                          space-y-3
                        ">

                          {/* Custom Label, Date Tag & Edit Button */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {photo.label || photo.custom_label ? (
                                <h3 className="font-bold text-sm text-foreground leading-tight truncate">
                                  {photo.label || photo.custom_label}
                                </h3>
                              ) : null}
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                <Calendar className="w-3 h-3 text-primary" />
                                <span>{formatPhotoDate(photo)}</span>
                              </p>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5 shrink-0"
                              onClick={() => setEditingPhoto(photo)}
                            >
                              <Tags className="w-3.5 h-3.5 text-primary" />
                              <span>Edit Tags</span>
                            </Button>
                          </div>

                          {/* Tag Badges */}
                          {Array.isArray(photo.tags) && photo.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {photo.tags.map((t) => (
                                <Badge
                                  key={t}
                                  variant="secondary"
                                  className="text-[11px] font-medium px-2 py-0.5 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 cursor-pointer transition-colors"
                                  onClick={() => setActiveTagFilter(t)}
                                >
                                  #{t}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingPhoto(photo)}
                              className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors pt-0.5"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add label or tags</span>
                            </button>
                          )}

                          {/* Weight */}

                          {photo.weight_lbs ? (
                            <button
                              type="button"
                              onClick={() => setEditingPhoto(photo)}
                              title="Click to edit weight or photo details"
                              className="flex items-center gap-1.5 text-sm text-foreground hover:text-primary transition-colors cursor-pointer group text-left"
                            >
                              <Weight className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                              <span className="font-semibold">
                                {displayWeight(photo.weight_lbs, unit)}
                              </span>
                              <span className="text-[10px] text-muted-foreground group-hover:text-primary underline decoration-dotted ml-1">
                                edit
                              </span>
                            </button>
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
