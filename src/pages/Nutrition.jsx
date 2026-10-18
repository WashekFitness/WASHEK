import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import {
  Flame,
  Drumstick,
  Wheat,
  Droplets,
} from 'lucide-react';

import { toast } from 'sonner';

import { supabaseApi } from '@/lib/supabaseApi';

import FoodScanner from '@/components/nutrition/FoodScanner';
import ManualFoodEntry from '@/components/nutrition/ManualFoodEntry';
import FoodLog from '@/components/nutrition/FoodLog';
import SavedMealsManager from '@/components/nutrition/SavedMealsManager';

import PageHeader from '@/components/layout/PageHeader';

import { calcNutritionGoals } from '@/lib/nutritionGoals';
import { useMidnightSync } from '@/hooks/useMidnightSync';

export default function Nutrition() {
  const queryClient =
    useQueryClient();

  /*
   * ============================================================
   * USER & TIMEZONE SYNCHRONIZATION
   * ============================================================
   */
  const [
    user,
    setUser,
  ] = useState(() => {
    try {
      const raw = localStorage.getItem('washek_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const userKey = user?.email || user?.id || 'athlete';

  /*
   * Synchronized to the user's specific calendar day and timezone.
   * At exactly 12:00:00 AM midnight in their timezone, todayKey
   * automatically advances, instantly resetting macro tracking for
   * the fresh day and invalidating relevant queries.
   */
  const { todayKey: today, timeZone } = useMidnightSync(user);

  useEffect(() => {
    let active = true;

    supabaseApi.auth
      .me()
      .then((currentUser) => {
        if (!active) {
          return;
        }

        if (currentUser) {
          setUser(currentUser);
        }
      })
      .catch((error) => {
        console.warn(
          '[Nutrition] Auth check note:',
          error?.message || error
        );
      });

    return () => {
      active = false;
    };
  }, []);


function getSmartDefaultMeal() {
  try {
    const saved = localStorage.getItem('washek_active_meal');
    if (saved && ['breakfast', 'lunch', 'dinner', 'snack'].includes(saved)) {
      return saved;
    }
  } catch (_e) {
    // LocalStorage unavailable
  }
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'snack';
  if (hour >= 18 && hour < 22) return 'dinner';
  return 'snack';
}

  const [
    searchParams,
  ] = useSearchParams();

  const [activeTab, setActiveTab] = useState(() => {
    try {
      const url = new URL(window.location.href);
      const tabParam = url.searchParams.get('tab') || url.searchParams.get('view');
      return tabParam === 'saved' ? 'saved' : 'log';
    } catch {
      return 'log';
    }
  });

  const [mealType, setMealTypeState] = useState(() => {
    const param = searchParams.get('meal');
    if (param && ['breakfast', 'lunch', 'dinner', 'snack'].includes(param.toLowerCase())) {
      return param.toLowerCase();
    }
    return getSmartDefaultMeal();
  });

  const setMealType = (value) => {
    const normalized = String(value || 'breakfast').toLowerCase();
    setMealTypeState(normalized);
    try {
      localStorage.setItem('washek_active_meal', normalized);
    } catch (_e) {
      // LocalStorage write ignored
    }
    // Update URL silently without triggering React Router route re-mounts or scroll jumps
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('meal') !== normalized) {
        url.searchParams.set('meal', normalized);
        window.history.replaceState(window.history.state, '', url.pathname + url.search);
      }
    } catch (_e) {
      // Ignore
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    try {
      const url = new URL(window.location.href);
      if (tab === 'saved') {
        url.searchParams.set('tab', 'saved');
      } else {
        url.searchParams.delete('tab');
      }
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
    } catch (_e) {
      // Ignore
    }
  };


  /*
   * ============================================================
   * TODAY'S NUTRITION
   * ============================================================
   */

  const {
    data: entries = [],
  } = useQuery({
    queryKey: [
      'nutrition',
      today,
      userKey,
    ],

    queryFn: () =>
      supabaseApi.entities.NutritionEntry.filter(
        {
          date: today,
          created_by: userKey,
        },
        '-created_date',
        100
      ),

    enabled: true,
  });

  /*
   * ============================================================
   * SAVED MEALS & SNACKS LIBRARY
   * ============================================================
   */
  const { data: savedMeals = [] } = useQuery({
    queryKey: ['saved_meals', userKey],
    queryFn: async () => {
      try {
        const results = await supabaseApi.entities.SavedMeal.filter(
          { created_by: userKey },
          '-created_at',
          200
        );
        return results || [];
      } catch (err) {
        console.warn('[Nutrition] Fetch saved meals note:', err);
        const list = await supabaseApi.entities.SavedMeal.list('-created_at', 200);
        return list || [];
      }
    },
  });

  const saveToMealsMutation = useMutation({
    mutationFn: (mealData) =>
      supabaseApi.entities.SavedMeal.create({
        ...mealData,
        created_by: userKey,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['saved_meals', userKey], (old = []) => [
        saved,
        ...old.filter((m) => m.id !== saved.id),
      ]);
      queryClient.invalidateQueries({ queryKey: ['saved_meals'] });
      toast.success(`Saved "${saved.name || saved.food_name || 'meal'}" to your Saved Meals!`);
    },
    onError: (err) => {
      console.error('[Nutrition] Save to meals failed:', err);
      toast.error(err?.message || 'Failed to save to meals library.');
    },
  });

  const handleSaveToMeals = (mealData) => {
    saveToMealsMutation.mutate(mealData);
  };

  /*
   * ============================================================
   * CREATE FOOD ENTRY
   * ============================================================
   */

  const createMutation =
    useMutation({
      mutationFn: (data) =>
        supabaseApi.entities.NutritionEntry.create(
          {
            ...data,

            date: today,

            created_by: userKey,

            meal_type:
              data.meal_type ||
              mealType ||
              'breakfast',
          }
        ),

      onMutate: async (data) => {
        await queryClient.cancelQueries({
          queryKey: [
            'nutrition',
            today,
            userKey,
          ],
        });

        const previous =
          queryClient.getQueryData([
            'nutrition',
            today,
            userKey,
          ]);

        const optimistic = {
          id:
            `_opt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,

          date: today,

          created_by: userKey,

          meal_type:
            data.meal_type ||
            mealType ||
            'breakfast',

          calories:
            Number(data.calories) || 0,

          protein_g:
            Number(data.protein_g) || 0,

          carbs_g:
            Number(data.carbs_g) || 0,

          fat_g:
            Number(data.fat_g) || 0,

          ...data,
        };

        queryClient.setQueryData(
          [
            'nutrition',
            today,
            userKey,
          ],

          (old) => [
            ...(old || []),
            optimistic,
          ]
        );

        return {
          prev: previous,
          userKey,
        };
      },

      onError: (
        error,
        _data,
        context
      ) => {
        if (context?.prev) {
          queryClient.setQueryData(
            [
              'nutrition',
              today,
              context.userKey || userKey,
            ],
            context.prev
          );
        }

        console.error(
          '[Nutrition] Failed to create food entry:',
          error
        );

        toast.error(
          error?.message ||
            'Unable to add food.'
        );
      },

      onSuccess: (savedEntry, _variables, context) => {
        const key = context?.userKey || userKey;
        if (savedEntry) {
          queryClient.setQueryData(
            [
              'nutrition',
              today,
              key,
            ],
            (old) => {
              const current = old || [];
              const filtered = current.filter(
                (item) => !String(item.id).startsWith('_opt_') && item.id !== savedEntry.id
              );
              return [...filtered, savedEntry];
            }
          );
        }

        queryClient.invalidateQueries({
          queryKey: [
            'nutrition',
          ],
        });

        toast.success(
          'Food added!'
        );
      },
    });


  /*
   * ============================================================
   * UPDATE FOOD ENTRY
   * ============================================================
   *
   * This supports the Edit button in FoodLog.
   */

  const updateMutation =
    useMutation({
      mutationFn: ({
        id,
        data,
      }) => {
        const payload = {};
        if (data.food_name !== undefined) payload.food_name = data.food_name;
        if (data.serving_size !== undefined) payload.serving_size = data.serving_size;
        if (data.calories !== undefined) payload.calories = Number(data.calories) || 0;
        if (data.protein_g !== undefined) payload.protein_g = Number(data.protein_g) || 0;
        if (data.carbs_g !== undefined) payload.carbs_g = Number(data.carbs_g) || 0;
        if (data.fat_g !== undefined) payload.fat_g = Number(data.fat_g) || 0;
        if (data.meal_type !== undefined) payload.meal_type = data.meal_type;
        if (data.image_url !== undefined) payload.image_url = data.image_url;

        return supabaseApi.entities.NutritionEntry.update(id, payload);
      },

      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({
          queryKey: [
            'nutrition',
            today,
            userKey,
          ],
        });

        const previous =
          queryClient.getQueryData([
            'nutrition',
            today,
            userKey,
          ]);

        queryClient.setQueryData(
          [
            'nutrition',
            today,
            userKey,
          ],
          (old) =>
            (old || []).map((entry) =>
              entry.id === id
                ? {
                    ...entry,
                    ...data,
                    meal_type: data.meal_type !== undefined ? data.meal_type : entry.meal_type,
                  }
                : entry
            )
        );

        return {
          prev: previous,
          userKey,
        };
      },

      onError: (error, _variables, context) => {
        if (context?.prev) {
          queryClient.setQueryData(
            [
              'nutrition',
              today,
              context.userKey || userKey,
            ],
            context.prev
          );
        }

        console.error(
          '[Nutrition] Failed to update food entry:',
          error
        );

        toast.error(
          error?.message ||
            'Unable to update food.'
        );
      },

      onSuccess: (updatedEntry, _variables, context) => {
        const key = context?.userKey || userKey;
        if (updatedEntry) {
          queryClient.setQueryData(
            [
              'nutrition',
              today,
              key,
            ],
            (old) =>
              (old || []).map((entry) =>
                entry.id === updatedEntry.id ? { ...entry, ...updatedEntry } : entry
              )
          );
        }

        queryClient.invalidateQueries({
          queryKey: [
            'nutrition',
          ],
        });

        toast.success(
          'Food updated!'
        );
      },
    });


  /*
   * ============================================================
   * DELETE FOOD ENTRY
   * ============================================================
   */

  const deleteMutation =
    useMutation({
      mutationFn: (id) =>
        supabaseApi.entities.NutritionEntry.delete(
          id
        ),

      onMutate: async (id) => {
        await queryClient.cancelQueries({
          queryKey: [
            'nutrition',
            today,
            userKey,
          ],
        });

        const previous =
          queryClient.getQueryData([
            'nutrition',
            today,
            userKey,
          ]);

        queryClient.setQueryData(
          [
            'nutrition',
            today,
            userKey,
          ],

          (old) =>
            (old || []).filter(
              (entry) =>
                entry.id !== id
            )
        );

        return {
          prev: previous,
          userKey,
        };
      },

      onError: (
        error,
        _id,
        context
      ) => {
        if (context?.prev) {
          queryClient.setQueryData(
            [
              'nutrition',
              today,
              context.userKey || userKey,
            ],
            context.prev
          );
        }

        console.error(
          '[Nutrition] Failed to delete food entry:',
          error
        );

        toast.error(
          error?.message ||
            'Unable to delete food.'
        );
      },

      onSuccess: (_data, id, context) => {
        const key = context?.userKey || userKey;
        queryClient.setQueryData(
          [
            'nutrition',
            today,
            key,
          ],
          (old) =>
            (old || []).filter(
              (entry) =>
                entry.id !== id
            )
        );

        queryClient.invalidateQueries({
          queryKey: [
            'nutrition',
          ],
        });

        toast.success(
          'Food removed.'
        );
      },
    });


  /*
   * ============================================================
   * TOTALS
   * ============================================================
   */

  const totals =
    entries.reduce(
      (
        accumulated,
        entry
      ) => ({
        calories:
          accumulated.calories +
          (
            Number(
              entry?.calories
            ) || 0
          ),

        protein:
          accumulated.protein +
          (
            Number(
              entry?.protein_g
            ) || 0
          ),

        carbs:
          accumulated.carbs +
          (
            Number(
              entry?.carbs_g
            ) || 0
          ),

        fat:
          accumulated.fat +
          (
            Number(
              entry?.fat_g
            ) || 0
          ),
      }),

      {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      }
    );


  /*
   * ============================================================
   * GOALS
   * ============================================================
   */

  const goals =
    calcNutritionGoals(
      user
    );


  const calorieGoal =
    Number(
      goals?.calories
    ) || 1;


  const progress =
    Math.min(
      (
        totals.calories /
        calorieGoal
      ) * 100,
      100
    );


  /*
   * ============================================================
   * RENDER
   * ============================================================
   */

  return (
    <div className="
        px-5
        pb-4
      ">

        <PageHeader
          title="Nutrition"
          subtitle="Track your fuel"
        />


        {/* ====================================================
            SUBPAGE NAVIGATION TABS
            ==================================================== */}
        <div className="flex items-center gap-1.5 my-4 p-1 bg-muted/60 dark:bg-muted/30 rounded-2xl border border-border/80 dark:border-white/[0.08] shadow-2xs">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              handleTabChange('log');
            }}
            className={`
              flex-1 flex items-center justify-center py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer touch-manipulation select-none text-center
              ${
                activeTab === 'log'
                  ? 'bg-card text-foreground shadow-xs border border-border/80 dark:border-white/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }
            `}
          >
            <span>Daily Log</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              handleTabChange('saved');
            }}
            className={`
              flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer touch-manipulation select-none text-center
              ${
                activeTab === 'saved'
                  ? 'bg-card text-foreground shadow-xs border border-border/80 dark:border-white/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }
            `}
          >
            <span>Saved Meals & Snacks</span>
            {savedMeals.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs bg-amber-500/15 border border-amber-500/25 text-amber-600 dark:text-amber-400 font-bold leading-none">
                {savedMeals.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'saved' ? (
          <div className="pt-1">
            <SavedMealsManager
              userKey={userKey}
              activeMealType={mealType}
              onLogMeal={(food) => {
                createMutation.mutate(food);
                handleTabChange('log');
              }}
              isModal={false}
            />
          </div>
        ) : (
          <>


        {/* ====================================================
            CALORIE / MACRO SUMMARY
            ==================================================== */}

        <div className="
          w-full
          mb-6
          p-5
          sm:p-6
          bg-card
          rounded-2xl
          border
          border-border/90
          dark:border-white/[0.08]
          shadow-[0_4px_24px_rgba(15,23,42,0.06),0_1px_3px_rgba(15,23,42,0.03)]
          dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_rgba(0,0,0,0.45)]
        ">

          {/* Calorie Overview Header */}
          <div className="
            flex
            flex-col
            sm:flex-row
            items-start
            sm:items-center
            justify-between
            gap-4
            pb-5
            mb-5
            border-b
            border-border/80
            dark:border-white/[0.07]
          ">
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 shrink-0">
                <svg
                  className="w-16 h-16 -rotate-90"
                  viewBox="0 0 100 100"
                  aria-hidden="true"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="hsl(var(--muted))"
                    strokeWidth="9"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={`${progress * 2.51} 251`}
                    className="transition-all duration-700"
                  />
                </svg>

                <div className="absolute inset-0 flex items-center justify-center">
                  <Flame className="w-5 h-5 text-primary drop-shadow" />
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase font-heading">
                  Daily Energy
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="font-heading font-extrabold text-2xl text-foreground">
                    {Math.round(totals.calories).toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    / {calorieGoal.toLocaleString()} kcal
                  </span>
                </div>
                <p className="text-xs text-primary font-medium mt-0.5">
                  {Math.max(0, calorieGoal - Math.round(totals.calories)).toLocaleString()} kcal remaining
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <span className="text-xs text-muted-foreground font-medium">
                {Math.round(progress)}% of daily target
              </span>
            </div>
          </div>


          {/* Macro Bars - spanning the full width of the box */}
          <div className="w-full space-y-4">

            {[
              {
                label: 'Protein',
                value: totals.protein,
                goal: goals.protein,
                icon: Drumstick,
                barGradient: 'from-blue-600 via-blue-500 to-sky-400',
                textColor: 'text-blue-400',
                badgeBg: 'bg-blue-500/15 border-blue-500/25',
                glow: 'shadow-[0_0_12px_rgba(59,130,246,0.35)]',
              },

              {
                label: 'Carbs',
                value: totals.carbs,
                goal: goals.carbs,
                icon: Wheat,
                barGradient: 'from-emerald-600 via-emerald-500 to-teal-400',
                textColor: 'text-emerald-400',
                badgeBg: 'bg-emerald-500/15 border-emerald-500/25',
                glow: 'shadow-[0_0_12px_rgba(16,185,129,0.35)]',
              },

              {
                label: 'Fat',
                value: totals.fat,
                goal: goals.fat,
                icon: Droplets,
                barGradient: 'from-amber-600 via-amber-500 to-orange-400',
                textColor: 'text-amber-400',
                badgeBg: 'bg-amber-500/15 border-amber-500/25',
                glow: 'shadow-[0_0_12px_rgba(245,158,11,0.35)]',
              },
            ].map(
              ({
                label,
                value,
                goal,
                icon: Icon,
                barGradient,
                textColor,
                badgeBg,
                glow,
              }) => {
                const safeGoal = Math.max(Number(goal) || 1, 1);
                const roundedVal = Math.round(Number(value) || 0);
                const macroProgress = Math.min((Number(value) / safeGoal) * 100, 100);
                const realPercent = Math.round((Number(value) / safeGoal) * 100);

                return (
                  <div
                    key={label}
                    className="w-full"
                  >

                    <div className="
                      flex
                      items-center
                      justify-between
                      mb-1.5
                    ">

                      <div className="flex items-center gap-2">
                        <div className={`
                          w-5
                          h-5
                          rounded-md
                          flex
                          items-center
                          justify-center
                          border
                          ${badgeBg}
                        `}>
                          <Icon className={`w-3 h-3 ${textColor}`} />
                        </div>

                        <span className="
                          font-heading
                          font-semibold
                          text-sm
                          text-foreground
                          tracking-wide
                        ">
                          {label}
                        </span>
                      </div>


                      <div className="flex items-center gap-2">
                        <span className="text-xs">
                          <strong className="font-bold text-sm text-foreground">
                            {roundedVal}g
                          </strong>
                          <span className="text-muted-foreground font-normal ml-0.5">
                            / {goal}g
                          </span>
                        </span>

                        <span className={`
                          text-[10px]
                          font-bold
                          px-1.5
                          py-0.5
                          rounded-full
                          border
                          ${badgeBg}
                          ${textColor}
                        `}>
                          {realPercent}%
                        </span>
                      </div>

                    </div>


                    {/* Full-width Macro Bar */}
                    <div className="
                      relative
                      h-3
                      w-full
                      bg-slate-100
                      dark:bg-muted/70
                      rounded-full
                      overflow-hidden
                      border
                      border-slate-200/80
                      dark:border-white/[0.06]
                      p-0.5
                      shadow-inner
                    ">

                      <div
                        className={`
                          h-full
                          bg-gradient-to-r
                          ${barGradient}
                          rounded-full
                          transition-all
                          duration-500
                          ${macroProgress > 0 ? glow : ''}
                        `}
                        style={{
                          width: `${Math.max(macroProgress, roundedVal > 0 ? 3 : 0)}%`,
                        }}
                      />

                    </div>

                  </div>
                );
              }
            )}

          </div>

        </div>


        {/* ====================================================
            MEAL TYPE SELECTOR TABS
            ==================================================== */}

        <div className="mb-5">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-heading">
              Select Meal
            </span>
            <span className="text-xs text-primary font-semibold capitalize flex items-center gap-1.5">
              <span className="text-muted-foreground font-normal">Active:</span>
              <span className="px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary font-bold">
                {mealType === 'breakfast' && '🌅 Breakfast'}
                {mealType === 'lunch' && '☀️ Lunch'}
                {mealType === 'dinner' && '🌙 Dinner'}
                {mealType === 'snack' && '🍎 Snack'}
              </span>
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 p-1.5 bg-card border border-border/80 dark:border-white/[0.08] rounded-2xl shadow-xs">
            {[
              { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
              { value: 'lunch', label: 'Lunch', emoji: '☀️' },
              { value: 'dinner', label: 'Dinner', emoji: '🌙' },
              { value: 'snack', label: 'Snack', emoji: '🍎' },
            ].map((m) => {
              const active = mealType === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMealType(m.value);
                  }}
                  className={`
                    flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-2.5 px-1 sm:px-2 rounded-xl text-xs font-semibold transition-all touch-manipulation cursor-pointer select-none
                    ${
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25 scale-[1.02]'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }
                  `}
                >
                  <span className="text-base sm:text-sm">{m.emoji}</span>
                  <span className="text-[11px] sm:text-xs truncate">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>


        {/* ====================================================
            FOOD INPUTS
            ==================================================== */}

        <div className="
          space-y-4
        ">
          <FoodScanner
            defaultMealType={mealType}
            onFoodDetected={
              (food) =>
                createMutation.mutate(
                  food
                )
            }
            onSaveToMeals={handleSaveToMeals}
            userPlan={
              user?.subscription_plan ||
              'free'
            }
          />


          <ManualFoodEntry
            defaultMealType={mealType}
            onSubmit={
              (food) =>
                createMutation.mutate(
                  food
                )
            }
            onSaveToMeals={handleSaveToMeals}
          />


          {/* ==================================================
              TODAY'S LOG
              ================================================== */}

          <div className="pt-2">

            <h3 className="
              font-heading
              font-bold
              mb-3
            ">
              Today's Log
            </h3>


            <FoodLog
              entries={
                entries
              }

              onDelete={
                (id) =>
                  deleteMutation.mutate(
                    id
                  )
              }

              onEdit={
                (
                  id,
                  data
                ) =>
                  updateMutation.mutateAsync({
                    id,
                    data,
                  })
              }

              onSaveToMeals={handleSaveToMeals}
            />

          </div>

        </div>
          </>
        )}

      </div>
  );
}
