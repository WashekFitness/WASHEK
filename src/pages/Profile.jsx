import {
  useState,
  useEffect,
} from 'react';

import {
  useNavigate,
} from 'react-router-dom';

import {
  useQuery,
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
  Dumbbell,
  Target,
  RefreshCw,
  Zap,
} from 'lucide-react';

import AppSettingsModal from '@/components/AppSettingsModal';

import ExpandableText from '@/components/ExpandableText';

import PricingSection from '@/components/profile/PricingSection';

import QuickAccess from '@/components/layout/QuickAccess';

import {
  supabaseApi,
} from '@/lib/supabaseApi';

import {
  supabase,
} from '@/lib/supabase';

import {
  computeStats,
} from '@/lib/messageLimit';

import {
  toast,
} from 'sonner';



export default function Profile() {
  const navigate = useNavigate();

  const [user, setUser] =
    useState(null);

  const [regenerating, setRegenerating] =
    useState(false);


  useEffect(() => {
    let active = true;

    supabaseApi.auth
      .me()
      .then((currentUser) => {
        if (active) {
          setUser(currentUser);
        }
      })
      .catch((error) => {
        console.error(
          '[PROFILE] Failed to load profile:',
          error
        );

        if (active) {
          toast.error(
            error?.message ||
              'Unable to load your profile.'
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);


  const {
    data: programs = [],
  } = useQuery({
    queryKey: [
      'programs',
      user?.email,
    ],

    queryFn: () =>
      supabaseApi.entities.WorkoutProgram.filter(
        {
          status: 'active',
          created_by: user.email,
        },
        '-created_date',
        1
      ),

    enabled: !!user?.email,
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


  const activeProgram =
    programs[0];


  const plan =
    user?.subscription_plan ||
    'free';


  const stats =
    user
      ? computeStats(
          user,
          plan
        )
      : null;


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


  const handleRegenerate = async () => {
    if (
      !user?.fitness_level ||
      !user?.primary_goal
    ) {
      navigate('/onboarding');
      return;
    }

    setRegenerating(true);

    try {
      if (activeProgram) {
        await supabaseApi.entities.WorkoutProgram.update(
          activeProgram.id,
          {
            status: 'completed',
          }
        );
      }

      navigate('/onboarding');
    } catch (error) {
      console.error(
        '[PROFILE] Regeneration failed:',
        error
      );

      toast.error(
        error?.message ||
          'Unable to start a new program.'
      );
    } finally {
      setRegenerating(false);
    }
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

          <div className="
            w-16
            h-16
            rounded-2xl
            bg-primary/15
            flex
            items-center
            justify-center
            shrink-0
          ">
            <User className="
              w-8
              h-8
              text-primary
            " />
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


            <Badge
              className={`
                mt-1
                border-0
                text-xs
                ${planColors[plan] || planColors.free}
              `}
            >
              {planLabels[plan] || 'Free'} Plan
            </Badge>

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
              h-1.5
              bg-muted
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
                      : 'bg-primary'
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
              {stats.remaining} messages remaining · resets monthly
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
          ACTIONS
          ==================================================== */}

      <div className="
        relative
        z-0
        space-y-2
      ">

        <Button
          type="button"
          variant="outline"
          className="
            w-full
            h-12
            justify-start
          "
          onClick={
            handleRegenerate
          }
          disabled={
            regenerating
          }
        >

          <RefreshCw
            className={`
              w-4
              h-4
              mr-3
              ${
                regenerating
                  ? 'animate-spin'
                  : ''
              }
            `}
          />

          Generate New Program

        </Button>

      </div>


      {/* ====================================================
          PRICING
          ==================================================== */}

      <div className="
        relative
        z-0
        pt-2
      ">
        <PricingSection />
      </div>

    </div>
  );
}
