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

import MobileSelect from '@/components/ui/MobileSelect';
import FoodScanner from '@/components/nutrition/FoodScanner';
import ManualFoodEntry from '@/components/nutrition/ManualFoodEntry';
import FoodLog from '@/components/nutrition/FoodLog';

import PullToRefresh from '@/components/layout/PullToRefresh';
import PageHeader from '@/components/layout/PageHeader';

import { calcNutritionGoals } from '@/lib/nutritionGoals';
import { getLocalDateKey } from '@/lib/messageLimit';

export default function Nutrition() {
  const queryClient =
    useQueryClient();

  /*
   * ============================================================
   * CURRENT LOCAL DATE
   * ============================================================
   *
   * This MUST use the browser's local calendar date.
   *
   * Do NOT use:
   *
   * new Date().toISOString().split('T')[0]
   *
   * because that uses UTC and can cause food to appear on the
   * wrong day for users in US time zones and other time zones.
   */
  const today =
    getLocalDateKey();


  const [
    searchParams,
    setSearchParams,
  ] = useSearchParams();


  const mealType =
    searchParams.get('meal') ||
    'snack';


  const setMealType =
    (value) => {
      const next =
        new URLSearchParams(
          searchParams
        );

      next.set(
        'meal',
        value
      );

      setSearchParams(
        next
      );
    };


  /*
   * ============================================================
   * USER
   * ============================================================
   */

  const [
    user,
    setUser,
  ] = useState(null);


  useEffect(() => {
    let active = true;

    supabaseApi.auth
      .me()
      .then((currentUser) => {
        if (!active) {
          return;
        }

        setUser(
          currentUser
        );
      })
      .catch((error) => {
        console.error(
          '[Nutrition] Failed to load user:',
          error
        );
      });

    return () => {
      active = false;
    };
  }, []);


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
      user?.email,
    ],

    queryFn: () =>
      supabaseApi.entities.NutritionEntry.filter(
        {
          date: today,
          created_by: user.email,
        },
        '-created_date',
        100
      ),

    enabled:
      !!user?.email,
  });


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

            meal_type:
              data.meal_type ||
              mealType,
          }
        ),

      onMutate: async (data) => {
        await queryClient.cancelQueries({
          queryKey: [
            'nutrition',
            today,
            user?.email,
          ],
        });

        const previous =
          queryClient.getQueryData([
            'nutrition',
            today,
            user?.email,
          ]);

        const optimistic = {
          id:
            `_opt_${Date.now()}`,

          date: today,

          meal_type:
            data.meal_type ||
            mealType,

          ...data,
        };

        queryClient.setQueryData(
          [
            'nutrition',
            today,
            user?.email,
          ],

          (old) => [
            ...(old || []),
            optimistic,
          ]
        );

        return {
          prev: previous,
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
              user?.email,
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

      onSuccess: () => {
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
      }) =>
        supabaseApi.entities.NutritionEntry.update(
          id,
          {
            food_name:
              data.food_name,

            serving_size:
              data.serving_size,

            calories:
              Number(
                data.calories
              ) || 0,

            protein_g:
              Number(
                data.protein_g
              ) || 0,

            carbs_g:
              Number(
                data.carbs_g
              ) || 0,

            fat_g:
              Number(
                data.fat_g
              ) || 0,

            meal_type:
              data.meal_type ||
              mealType,

            image_url:
              data.image_url ||
              null,
          }
        ),

      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [
            'nutrition',
            today,
            user?.email,
          ],
        });

        queryClient.invalidateQueries({
          queryKey: [
            'nutrition',
          ],
        });

        toast.success(
          'Food updated!'
        );
      },

      onError: (error) => {
        console.error(
          '[Nutrition] Failed to update food entry:',
          error
        );

        toast.error(
          error?.message ||
            'Unable to update food.'
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
            user?.email,
          ],
        });

        const previous =
          queryClient.getQueryData([
            'nutrition',
            today,
            user?.email,
          ]);

        queryClient.setQueryData(
          [
            'nutrition',
            today,
            user?.email,
          ],

          (old) =>
            (old || []).filter(
              (entry) =>
                entry.id !== id
            )
        );

        return {
          prev: previous,
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
              user?.email,
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

      onSuccess: () => {
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
    <PullToRefresh
      queryKeys={[
        [
          'nutrition',
          today,
          user?.email,
        ],
      ]}
    >

      <div className="
        px-5
        pb-4
      ">

        <PageHeader
          title="Nutrition"
          subtitle="Track your fuel"
        />


        <div className="mb-5" />


        {/* ====================================================
            CALORIE / MACRO SUMMARY
            ==================================================== */}

        <div className="
          flex
          items-center
          gap-6
          mb-6
          p-4
          bg-card
          rounded-2xl
          border
          border-border
        ">

          {/* Calorie Ring */}

          <div className="
            relative
            w-24
            h-24
            shrink-0
          ">

            <svg
              className="
                w-24
                h-24
                -rotate-90
              "
              viewBox="0 0 100 100"
              aria-hidden="true"
            >

              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="8"
              />


              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${progress * 2.64} 264`}
                className="
                  transition-all
                  duration-700
                "
              />

            </svg>


            <div className="
              absolute
              inset-0
              flex
              flex-col
              items-center
              justify-center
            ">

              <Flame className="
                w-4
                h-4
                text-primary
                mb-0.5
              " />


              <p className="
                font-heading
                font-bold
                text-sm
              ">
                {Math.round(
                  totals.calories
                )}
              </p>


              <p className="
                text-[9px]
                text-muted-foreground
              ">
                / {calorieGoal}
              </p>

            </div>

          </div>


          {/* Macro Bars */}

          <div className="
            flex-1
            space-y-2
          ">

            {[
              {
                label: 'Protein',
                value: totals.protein,
                goal: goals.protein,
                icon: Drumstick,
                color: 'bg-primary',
              },

              {
                label: 'Carbs',
                value: totals.carbs,
                goal: goals.carbs,
                icon: Wheat,
                color: 'bg-accent',
              },

              {
                label: 'Fat',
                value: totals.fat,
                goal: goals.fat,
                icon: Droplets,
                color: 'bg-chart-4',
              },
            ].map(
              ({
                label,
                value,
                goal,
                color,
              }) => {

                const safeGoal =
                  Math.max(
                    Number(goal) || 1,
                    1
                  );

                const macroProgress =
                  Math.min(
                    (
                      Number(value) /
                      safeGoal
                    ) * 100,
                    100
                  );

                return (
                  <div
                    key={label}
                  >

                    <div className="
                      flex
                      items-center
                      justify-between
                      text-xs
                      mb-0.5
                    ">

                      <span className="
                        text-muted-foreground
                      ">
                        {label}
                      </span>


                      <span className="
                        font-medium
                      ">
                        {Math.round(
                          Number(value) || 0
                        )}g / {goal}g
                      </span>

                    </div>


                    <div className="
                      h-1.5
                      bg-muted
                      rounded-full
                      overflow-hidden
                    ">

                      <div
                        className={`
                          h-full
                          ${color}
                          rounded-full
                          transition-all
                          duration-500
                        `}
                        style={{
                          width:
                            `${macroProgress}%`,
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
            MEAL TYPE
            ==================================================== */}

        <div className="
          flex
          items-center
          gap-3
          mb-4
        ">

          <p className="
            text-sm
            font-medium
          ">
            Add to:
          </p>


          <MobileSelect
            value={mealType}
            onValueChange={
              setMealType
            }
            placeholder="Meal"
            triggerClassName="
              w-32
              h-9
            "
            options={[
              {
                value: 'breakfast',
                label: 'Breakfast',
              },

              {
                value: 'lunch',
                label: 'Lunch',
              },

              {
                value: 'dinner',
                label: 'Dinner',
              },

              {
                value: 'snack',
                label: 'Snack',
              },
            ]}
          />

        </div>


        {/* ====================================================
            FOOD INPUTS
            ==================================================== */}

        <div className="
          space-y-4
        ">

          <FoodScanner
            onFoodDetected={
              (food) =>
                createMutation.mutate(
                  food
                )
            }

            userPlan={
              user?.subscription_plan ||
              'free'
            }
          />


          <ManualFoodEntry
            onSubmit={
              (food) =>
                createMutation.mutate(
                  food
                )
            }
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
            />

          </div>

        </div>

      </div>

    </PullToRefresh>
  );
}
