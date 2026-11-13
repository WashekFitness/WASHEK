import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';

import {
  useNavigate,
} from 'react-router-dom';

import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  Card,
} from '@/components/ui/card';

import {
  Button,
} from '@/components/ui/button';

import {
  Badge,
} from '@/components/ui/badge';

import {
  User,
  Camera,
  Trash2,
  Dumbbell,
  Target,
  Zap,
  Move,
} from 'lucide-react';

import AvatarAdjustModal from '@/components/profile/AvatarAdjustModal';
import AppSettingsModal from '@/components/AppSettingsModal';

import ExpandableText from '@/components/ExpandableText';

import PricingSection from '@/components/profile/PricingSection';

import QuickAccess from '@/components/layout/QuickAccess';

import { useAuth } from '@/lib/AuthContext';
import { isLogo, cleanseAvatarUrl } from '@/lib/avatarUtils';
import { getCachedActiveProgram } from '@/lib/cacheStore';

import {
  supabaseApi,
} from '@/lib/supabaseApi';

import {
  supabase,
} from '@/lib/supabase';

import {
  getCachedMessageStats,
  getServerMessageStats,
  getPlanLimit,
} from '@/lib/messageLimit';
import { useMidnightSync } from '@/hooks/useMidnightSync';

import {
  toast,
} from 'sonner';



export default function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: authUser, setUser: setAuthUser } = useAuth();

  const [user, setUser] = useState(() => authUser);

  useEffect(() => {
    if (authUser) {
      setUser((prev) => {
        if (
          prev?.id === authUser.id &&
          prev?.subscription_plan === authUser.subscription_plan &&
          prev?.subscription_status === authUser.subscription_status &&
          prev?.avatar_url === authUser.avatar_url &&
          prev?.kael_msg_count === authUser.kael_msg_count &&
          prev?.kael_msg_month === authUser.kael_msg_month
        ) {
          return prev;
        }
        return authUser;
      });
    }
  }, [
    authUser?.id,
    authUser?.subscription_plan,
    authUser?.subscription_status,
    authUser?.avatar_url,
    authUser?.kael_msg_count,
    authUser?.kael_msg_month,
  ]);

  const fileInputRef = useRef(null);

  // Filter out any app logo from avatar URL so only custom photos are loaded
  const [avatarUrl, setAvatarUrl] = useState(() => {
    try {
      if (localStorage.getItem('washek_avatar_explicitly_removed') === 'true') {
        return null;
      }
      const stored = localStorage.getItem('washek_custom_avatar');
      if (stored && !isLogo(stored)) {
        return stored;
      }
      return null;
    } catch {
      return null;
    }
  });

  // Modal state for fine-grained image cropping, framing & positioning
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [imageToAdjust, setImageToAdjust] = useState(null);

  const { timeZone } = useMidnightSync(user || authUser);

  const avatarKey = `${user?.id || user?.email || 'default'}_${user?.avatar_url || ''}_${user?.photo_url || ''}`;

  useEffect(() => {
    if (user?.id || user?.email) {
      const userKey = user.id || user.email;
      const isExplicitlyRemoved = localStorage.getItem('washek_avatar_explicitly_removed') === 'true';

      const candidate =
        localStorage.getItem(`washek_custom_avatar_${userKey}`) ||
        localStorage.getItem('washek_custom_avatar') ||
        (!isExplicitlyRemoved ? (user.avatar_url || user.photo_url) : null);

      // Guarantee that if the user does not have a custom picture, the logo is NEVER filled in!
      if (candidate && !isLogo(candidate)) {
        setAvatarUrl(candidate);
      } else {
        // If candidate was a logo, cleanse it immediately across all storage layers so it never returns!
        if (candidate && isLogo(candidate)) {
          try {
            localStorage.removeItem(`washek_custom_avatar_${userKey}`);
            localStorage.removeItem('washek_custom_avatar');
            const stored = localStorage.getItem('washek_user');
            if (stored) {
              const parsed = JSON.parse(stored);
              parsed.avatar_url = null;
              parsed.photo_url = null;
              localStorage.setItem('washek_user', JSON.stringify(parsed));
            }
          } catch (_err) {
            // Ignore storage cleanup error
          }

          if (user?.id) {
            supabase.from('profiles').update({ avatar_url: null, photo_url: null }).eq('id', user.id).then(() => {}).catch(() => {});
          }
        }
        setAvatarUrl(null);
      }
    }
  }, [avatarKey]);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast.error('Image is too large. Please select an image under 15MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target.result;
      // Open adjuster modal so user can adjust what part of the picture shows
      setImageToAdjust(rawDataUrl);
      setAdjustModalOpen(true);
    };
    reader.onerror = () => {
      toast.error('Could not load image file.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveAdjustedAvatar = (croppedDataUrl) => {
    const userKey = user?.id || user?.email || 'default';
    try {
      localStorage.removeItem('washek_avatar_explicitly_removed');
      localStorage.setItem(`washek_custom_avatar_${userKey}`, croppedDataUrl);
      localStorage.setItem('washek_custom_avatar', croppedDataUrl);
      const stored = localStorage.getItem('washek_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.avatar_url = croppedDataUrl;
        parsed.photo_url = croppedDataUrl;
        localStorage.setItem('washek_user', JSON.stringify(parsed));
      }
    } catch (storageErr) {
      console.warn('LocalStorage error storing avatar:', storageErr);
    }


    if (user?.id) {
      supabase.from('profiles').update({ avatar_url: croppedDataUrl, photo_url: croppedDataUrl }).eq('id', user.id).then(() => {}).catch(() => {});
    }

    // Update in-memory user states
    setUser((prev) => (prev ? { ...prev, avatar_url: croppedDataUrl, photo_url: croppedDataUrl } : prev));
    if (setAuthUser) {
      setAuthUser((prev) => (prev ? { ...prev, avatar_url: croppedDataUrl, photo_url: croppedDataUrl } : prev));
    }

    setAvatarUrl(croppedDataUrl);
    setAdjustModalOpen(false);
    setImageToAdjust(null);
    window.dispatchEvent(new CustomEvent('washek_avatar_changed', { detail: { avatarUrl: croppedDataUrl } }));
    toast.success('Profile picture saved successfully!');
  };

  const handleRemoveAvatar = (e) => {
    e?.stopPropagation();
    const userKey = user?.id || user?.email || 'default';
    try {
      localStorage.setItem('washek_avatar_explicitly_removed', 'true');
      localStorage.removeItem(`washek_custom_avatar_${userKey}`);
      localStorage.removeItem('washek_custom_avatar');
      const stored = localStorage.getItem('washek_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.avatar_url = null;
        parsed.photo_url = null;
        localStorage.setItem('washek_user', JSON.stringify(parsed));
      }
    } catch (err) {
      console.warn('LocalStorage remove error:', err);
    }


    if (user?.id) {
      supabase.from('profiles').update({ avatar_url: null, photo_url: null }).eq('id', user.id).then(() => {}).catch(() => {});
    }

    // Update local and auth states
    setUser((prev) => (prev ? { ...prev, avatar_url: null, photo_url: null } : prev));
    if (setAuthUser) {
      setAuthUser((prev) => (prev ? { ...prev, avatar_url: null, photo_url: null } : prev));
    }

    setAvatarUrl(null);
    window.dispatchEvent(new CustomEvent('washek_avatar_changed', { detail: { avatarUrl: null } }));
    toast.success('Custom picture removed. Default avatar restored.');
  };


  useEffect(() => {
    let active = true;

    supabaseApi.auth
      .me(true)
      .then((currentUser) => {
        if (active && currentUser) {
          if (isLogo(currentUser.avatar_url) || isLogo(currentUser.photo_url)) {
            currentUser.avatar_url = null;
            currentUser.photo_url = null;
          }
          if (localStorage.getItem('washek_avatar_explicitly_removed') === 'true') {
            const userKey = currentUser.id || currentUser.email;
            const hasNew = localStorage.getItem(`washek_custom_avatar_${userKey}`) || localStorage.getItem('washek_custom_avatar');
            if (!hasNew) {
              currentUser.avatar_url = null;
              currentUser.photo_url = null;
            }
          }
          setUser((prev) => {
            if (
              prev &&
              prev.id === currentUser.id &&
              prev.avatar_url === currentUser.avatar_url &&
              prev.subscription_plan === currentUser.subscription_plan &&
              prev.full_name === currentUser.full_name
            ) {
              return prev;
            }
            return currentUser;
          });
        }
      })
      .catch((error) => {
        console.debug('[PROFILE] Notice checking profile:', error?.message || error);
      });

    return () => {
      active = false;
    };
  }, [authUser?.id]);

  // Synchronize profile data and program state whenever a new program is generated or profile is saved
  useEffect(() => {
    const handleProgramOrProfileUpdate = () => {
      try {
        const stored = localStorage.getItem('washek_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          setUser((prev) => ({ ...(prev || {}), ...parsed }));
        }
      } catch (e) {
        // ignore
      }
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    };

    window.addEventListener('washek-program-updated', handleProgramOrProfileUpdate);
    window.addEventListener('washek-profile-updated', handleProgramOrProfileUpdate);
    window.addEventListener('storage', handleProgramOrProfileUpdate);

    return () => {
      window.removeEventListener('washek-program-updated', handleProgramOrProfileUpdate);
      window.removeEventListener('washek-profile-updated', handleProgramOrProfileUpdate);
      window.removeEventListener('storage', handleProgramOrProfileUpdate);
    };
  }, [queryClient]);

  const userKey = user?.id || user?.uid || user?.email || 'guest';

  const {
    data: programs = [],
  } = useQuery({
    queryKey: [
      'programs',
      userKey,
    ],

    queryFn: async () => {
      try {
        const remote = await supabaseApi.entities.WorkoutProgram.filter(
          {
            status: 'active',
          },
          '-created_at',
          10
        );
        if (remote && remote.length > 0) {
          const match = remote.find((p) =>
            p.user_id === user?.id ||
            p.user_id === user?.uid ||
            p.created_by === user?.email ||
            p.created_by === user?.id ||
            !p.user_id
          );
          if (match) return [match];
        }
      } catch (err) {
        console.debug('Failed to fetch remote workout programs:', err);
      }
      const cached = getCachedActiveProgram(userKey);
      return cached ? [cached] : [];
    },

    initialData: () => {
      const cached = getCachedActiveProgram(userKey);
      return cached ? [cached] : [];
    },
  });

  const {
    data: logs = [],
  } = useQuery({
    queryKey: [
      'logs',
      user?.email,
    ],

    queryFn: () =>
      supabaseApi.entities.WorkoutLog.filter(
        {
          created_by: user.email,
        },
        '-date',
        999
      ),

    enabled: !!user?.email,
  });

  const activeProgram = programs[0] || getCachedActiveProgram(userKey);

  // Resolve subscription status
  const currentSubStatus = String(
    user?.subscription_status ||
    (() => {
      try {
        return localStorage.getItem('washek_subscription_status') || '';
      } catch {
        return '';
      }
    })()
  ).toLowerCase().trim();

  // Resolve plan strictly respecting authoritative user subscription status
  const plan = (() => {
    if (currentSubStatus === 'canceled' || currentSubStatus === 'cancelled' || currentSubStatus === 'inactive') {
      return 'free';
    }

    if (user?.subscription_plan) {
      return String(user.subscription_plan).toLowerCase().trim() || 'free';
    }

    try {
      const storedPlan = localStorage.getItem('washek_subscription_plan');
      if (storedPlan && storedPlan !== 'free') return storedPlan.toLowerCase().trim();
      const storedUser = localStorage.getItem('washek_user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        const parsedStatus = String(parsed?.subscription_status || '').toLowerCase().trim();
        if (parsedStatus === 'canceled' || parsedStatus === 'cancelled' || parsedStatus === 'inactive') {
          return 'free';
        }
        if (parsed?.subscription_plan && parsed.subscription_plan !== 'free') {
          return parsed.subscription_plan.toLowerCase().trim();
        }
      }
    } catch (_err) {
      // ignore
    }
    return 'free';
  })();

  // Listen for real-time subscription plan upgrades / cancellations
  useEffect(() => {
    const handleSubUpdated = (e) => {
      const newPlan = e.detail?.plan;
      const newStatus = e.detail?.status || (newPlan === 'free' ? 'canceled' : 'active');
      if (newPlan) {
        setUser((prev) => prev ? {
          ...prev,
          subscription_plan: newPlan,
          subscription_status: newStatus,
          tier: newPlan,
          plan: newPlan,
        } : prev);
        if (setAuthUser) {
          setAuthUser((prev) => prev ? {
            ...prev,
            subscription_plan: newPlan,
            subscription_status: newStatus,
            tier: newPlan,
            plan: newPlan,
          } : prev);
        }
      }
    };
    window.addEventListener('washek_subscription_updated', handleSubUpdated);
    return () => window.removeEventListener('washek_subscription_updated', handleSubUpdated);
  }, [setAuthUser]);

  const handlePlanChange = useCallback((newPlan) => {
    setUser((prev) => {
      if (!prev || prev.subscription_plan === newPlan) return prev;
      return {
        ...prev,
        subscription_plan: newPlan,
        subscription_status: newPlan === 'free' ? 'canceled' : (prev.subscription_status || 'active'),
        tier: newPlan,
        plan: newPlan,
      };
    });
  }, []);

  // Immediate local-cached stats + live server-authoritative Kael monthly quota stats
  const immediateCachedStats = user ? getCachedMessageStats(user, plan, timeZone) : null;

  const {
    data: serverKaelStats,
  } = useQuery({
    queryKey: ['kael-usage', user?.id, timeZone],
    queryFn: async () => {
      const live = await getServerMessageStats(timeZone);
      if (live && typeof live.used === 'number') {
        return live;
      }
      return null;
    },
    initialData: () => immediateCachedStats || undefined,
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Listen for real-time quota broadcast events from Kael chat or API
  useEffect(() => {
    const handleQuotaUpdate = (e) => {
      if (e?.detail) {
        queryClient.setQueryData(['kael-usage', user?.id, timeZone], e.detail);
      }
    };

    window.addEventListener('kael-quota-updated', handleQuotaUpdate);
    return () => {
      window.removeEventListener('kael-quota-updated', handleQuotaUpdate);
    };
  }, [user?.id, timeZone, queryClient]);

  const stats = (() => {
    const base = serverKaelStats || immediateCachedStats;
    if (!base) return null;
    const effectiveLimit = getPlanLimit(plan);
    const cachedUsed = immediateCachedStats?.monthKey === base.monthKey
      ? Number(immediateCachedStats.used || 0)
      : 0;
    const rawUsed = Number(base.used || 0);
    const used = base.forceAuthoritative ? rawUsed : Math.max(rawUsed, cachedUsed);
    return {
      ...base,
      plan,
      used,
      limit: effectiveLimit,
      remaining: Math.max(0, effectiveLimit - used),
    };
  })();


  const planLabels = {
    free: 'Free',
    progress: 'Progress',
    performance: 'Performance',
    elite: 'Elite',
  };


  const planColors = {
    free:
      'bg-muted text-muted-foreground',

    progress:
      'bg-accent/15 text-accent',

    performance:
      'bg-primary/15 text-primary',

    elite:
      'bg-chart-4/15 text-chart-4',
  };



  if (!user) {
    return (
      <div className="
        min-h-[60vh]
        flex
        items-center
        justify-center
      ">
        <div className="
          w-8
          h-8
          border-4
          border-muted
          border-t-primary
          rounded-full
          animate-spin
        " />
      </div>
    );
  }


  return (
    <div
      className="
        relative
        z-0
        w-full
        px-5
        safe-bottom
        space-y-4
        pt-2
      "
    >

      {/* ====================================================
          PROFILE HEADER
          ==================================================== */}

      <div
        className="
          relative
          z-[80]
          flex
          items-center
          justify-between
          min-h-12
          pointer-events-auto
        "
      >

        <h1
          className="
            relative
            z-10
            font-heading
            text-2xl
            font-bold
          "
        >
          Profile
        </h1>


        <div
          className="
            relative
            z-[90]
            flex
            items-center
            pointer-events-auto
          "
        >
          <AppSettingsModal />
        </div>

      </div>


      {/* ====================================================
          USER CARD
          ==================================================== */}

      <Card className="
        relative
        z-0
        p-5
      ">

        <div className="
          flex
          items-center
          gap-4
        ">

          {/* Custom Picture or Default Avatar Box */}
          <div className="relative shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
              id="avatar-image-upload"
            />

            <button
              type="button"
              onClick={() => {
                if (avatarUrl) {
                  setImageToAdjust(avatarUrl);
                  setAdjustModalOpen(true);
                } else {
                  fileInputRef.current?.click();
                }
              }}
              className="
                group
                relative
                block
                p-0.5
                rounded-2xl
                bg-gradient-to-br
                from-primary/40
                via-primary/15
                to-transparent
                border
                border-primary/30
                shrink-0
                shadow-sm
                shadow-primary/20
                hover:border-primary/60
                transition-all
                cursor-pointer
                focus:outline-none
                focus:ring-2
                focus:ring-primary/40
                text-left
              "
              title={avatarUrl ? "Click to adjust framing or reposition picture" : "Click to upload a custom profile picture"}
              aria-label={avatarUrl ? "Adjust profile picture framing" : "Upload custom profile picture"}
            >
              <div className="w-14 h-14 rounded-[14px] bg-card/90 flex items-center justify-center overflow-hidden relative">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={user.full_name || 'Profile'}
                    className="w-full h-full object-cover rounded-[14px]"
                  />
                ) : (
                  <User className="
                    w-7
                    h-7
                    text-primary
                  " />
                )}

                {/* Subtle hover overlay */}
                <div className="
                  absolute
                  inset-0
                  bg-black/55
                  opacity-0
                  group-hover:opacity-100
                  transition-opacity
                  flex
                  flex-col
                  items-center
                  justify-center
                  rounded-[14px]
                ">
                  {avatarUrl ? (
                    <>
                      <Move className="w-4 h-4 text-white drop-shadow" />
                      <span className="text-[9px] font-semibold text-white/90 leading-tight mt-0.5">
                        Adjust
                      </span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4 text-white drop-shadow" />
                      <span className="text-[9px] font-semibold text-white/90 leading-tight mt-0.5">
                        Upload
                      </span>
                    </>
                  )}
                </div>
              </div>
            </button>

            {/* Camera corner badge - click to upload/change */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="
                absolute
                -bottom-1
                -right-1
                w-5
                h-5
                rounded-full
                bg-primary
                text-primary-foreground
                flex
                items-center
                justify-center
                shadow-md
                border-2
                border-background
                hover:scale-110
                active:scale-95
                transition-transform
                cursor-pointer
                z-10
              "
              title={avatarUrl ? "Choose a different picture file" : "Upload picture"}
              aria-label={avatarUrl ? "Choose different picture" : "Upload picture"}
            >
              <Camera className="w-2.5 h-2.5" />
            </button>
          </div>


          <div className="
            flex-1
            min-w-0
          ">

            <h2 className="
              font-heading
              font-bold
              text-lg
              truncate
            ">
              {user.full_name || 'Athlete'}
            </h2>


            <p className="
              text-sm
              text-muted-foreground
              truncate
            ">
              {user.email}
            </p>


            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge
                className={`
                  border-0
                  text-xs
                  ${planColors[plan] || planColors.free}
                `}
              >
                {planLabels[plan] || 'Free'} Plan
              </Badge>

              {avatarUrl ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setImageToAdjust(avatarUrl);
                      setAdjustModalOpen(true);
                    }}
                    className="
                      inline-flex
                      items-center
                      gap-1
                      text-[11px]
                      font-medium
                      text-primary
                      hover:text-primary/80
                      transition-colors
                      px-2
                      py-0.5
                      rounded-md
                      hover:bg-primary/10
                    "
                    title="Adjust framing, zoom, or reposition what part shows"
                  >
                    <Move className="w-3 h-3" />
                    Adjust crop
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="
                      inline-flex
                      items-center
                      gap-1
                      text-[11px]
                      font-medium
                      text-muted-foreground
                      hover:text-foreground
                      transition-colors
                      px-2
                      py-0.5
                      rounded-md
                      hover:bg-muted/60
                    "
                    title="Select a different photo file"
                  >
                    <Camera className="w-3 h-3" />
                    Change
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="
                      inline-flex
                      items-center
                      gap-1
                      text-[11px]
                      font-medium
                      text-muted-foreground
                      hover:text-destructive
                      transition-colors
                      px-2
                      py-0.5
                      rounded-md
                      hover:bg-destructive/10
                    "
                    title="Remove custom picture and revert to default avatar"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="
                    inline-flex
                    items-center
                    gap-1
                    text-[11px]
                    font-medium
                    text-primary
                    hover:text-primary/80
                    transition-colors
                    px-2
                    py-0.5
                    rounded-md
                    hover:bg-primary/10
                  "
                >
                  <Camera className="w-3 h-3" />
                  Upload picture
                </button>
              )}
            </div>

          </div>

        </div>


        {/* =================================================
            KAEL MESSAGE USAGE
            ================================================= */}

        {stats && (
          <div className="
            mt-4
            pt-4
            border-t
            border-border
          ">

            <div className="
              flex
              items-center
              justify-between
              mb-1.5
            ">

              <span className="
                text-xs
                text-muted-foreground
                flex
                items-center
                gap-1.5
              ">
                <Zap className="
                  w-3.5
                  h-3.5
                " />

                Kael Messages
              </span>


              <span className="
                text-xs
                font-semibold
              ">
                {stats.used} / {stats.limit}
              </span>

            </div>


            <div className="
              w-full
              h-2
              bg-muted/80
              rounded-full
              overflow-hidden
            ">

              <div
                className={`
                  h-full
                  rounded-full
                  transition-all
                  ${
                    stats.remaining === 0
                      ? 'bg-destructive'
                      : 'bg-gradient-to-r from-primary to-accent'
                  }
                `}
                style={{
                  width:
                    `${Math.min(
                      (
                        stats.used /
                        Math.max(
                          stats.limit,
                          1
                        )
                      ) *
                        100,
                      100
                    )}%`,
                }}
              />

            </div>


            <p className="
              text-[10px]
              text-muted-foreground
              mt-1
            ">
              {stats.remaining} messages remaining · resets on the 1st at 12:00 AM ({timeZone})
            </p>

          </div>
        )}

      </Card>


      {/* ====================================================
          TRAINING PROFILE
          ==================================================== */}

      <Card className="
        relative
        z-0
        p-4
      ">

        <h3 className="
          font-heading
          font-bold
          text-sm
          mb-3
          text-muted-foreground
          uppercase
          tracking-wider
        ">
          Training Profile
        </h3>


        <div className="
          space-y-3
        ">

          <div className="
            flex
            items-center
            justify-between
          ">

            <div className="
              flex
              items-center
              gap-2
            ">

              <Dumbbell className="
                w-4
                h-4
                text-muted-foreground
              " />

              <span className="text-sm">
                Level
              </span>

            </div>


            <span className="
              text-sm
              font-medium
              capitalize
            ">
              {user.fitness_level || '—'}
            </span>

          </div>


          <div className="
            flex
            flex-col
            gap-1
          ">

            <div className="
              flex
              items-center
              gap-2
            ">

              <Target className="
                w-4
                h-4
                text-muted-foreground
              " />

              <span className="text-sm">
                Primary Goal
              </span>

            </div>


            <div className="pl-6">

              <ExpandableText
                text={
                  user.primary_goal
                }
                limit={80}
                className="
                  text-sm
                  font-medium
                  text-foreground/80
                "
              />

            </div>

          </div>


          <div className="
            flex
            items-center
            justify-between
          ">

            <div className="
              flex
              items-center
              gap-2
            ">

              <Zap className="
                w-4
                h-4
                text-muted-foreground
              " />

              <span className="text-sm">
                Total Workouts
              </span>

            </div>


            <span className="
              text-sm
              font-medium
            ">
              {logs.length}
            </span>

          </div>

        </div>

      </Card>


      {/* ====================================================
          ACTIVE PROGRAM
          ==================================================== */}

      {activeProgram && (
        <Card className="
          relative
          z-0
          p-4
        ">

          <h3 className="
            font-heading
            font-bold
            text-sm
            mb-3
            text-muted-foreground
            uppercase
            tracking-wider
          ">
            Active Program
          </h3>


          <p className="
            font-heading
            font-bold
          ">
            {activeProgram.program_name}
          </p>


          <p className="
            text-sm
            text-muted-foreground
            mt-1
          ">
            Week {activeProgram.current_week || 1} of{' '}
            {activeProgram.duration_weeks || 12}
          </p>


          <div className="
            w-full
            h-2
            bg-muted
            rounded-full
            mt-3
            overflow-hidden
          ">

            <div
              className="
                h-full
                bg-primary
                rounded-full
              "
              style={{
                width:
                  `${
                    (
                      (
                        activeProgram.current_week ||
                        1
                      ) /
                      (
                        activeProgram.duration_weeks ||
                        12
                      )
                    ) *
                    100
                  }%`,
              }}
            />

          </div>

        </Card>
      )}


      {/* ====================================================
          QUICK ACCESS
          ==================================================== */}

      <div className="
        relative
        z-0
      ">
        <QuickAccess />
      </div>


      {/* ====================================================
          PRICING
          ==================================================== */}

      <div className="
        relative
        z-0
        pt-2
      ">
        <PricingSection onPlanChange={handlePlanChange} currentPlanProp={plan} />
      </div>

      {/* ====================================================
          AVATAR FRAMING & POSITION ADJUSTMENT MODAL
          ==================================================== */}
      <AvatarAdjustModal
        isOpen={adjustModalOpen}
        onClose={() => {
          setAdjustModalOpen(false);
          setImageToAdjust(null);
        }}
        imageSrc={imageToAdjust}
        onSave={handleSaveAdjustedAvatar}
        onSelectNewImage={(newUrl) => setImageToAdjust(newUrl)}
      />

    </div>
  );
}
