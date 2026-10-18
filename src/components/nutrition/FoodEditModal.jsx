import { useState } from 'react';
import { createPortal } from 'react-dom';

import {
  Button,
} from '@/components/ui/button';

import {
  Input,
} from '@/components/ui/input';

import {
  Card,
} from '@/components/ui/card';

import {
  Check,
  X,
  Plus,
  Trash2,
} from 'lucide-react';


export default function FoodEditModal({
  foods,
  imageUrl,
  onConfirm,
  onCancel,
  onSaveToMeals,
  defaultMealType = 'breakfast',
  title = 'Review Scan',
  subtitle = 'Edit anything the AI got wrong',
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveToMeals, setSaveToMeals] = useState(false);

  const [
    items,
    setItems,
  ] = useState(
    (foods || []).map(
      (food) => {
        const cleaned = Object.fromEntries(
          Object.entries(
            food || {}
          ).filter(
            ([key]) =>
              key !== 'image_url'
          )
        );
        return {
          ...cleaned,
          meal_type: food?.meal_type || defaultMealType || 'breakfast',
        };
      }
    )
  );

  const [selectedMeal, setSelectedMeal] = useState(
    foods?.[0]?.meal_type || defaultMealType || 'breakfast'
  );

  const applyMealToAll = (meal) => {
    setSelectedMeal(meal);
    setItems((previous) =>
      previous.map((item) => ({
        ...item,
        meal_type: meal,
      }))
    );
  };

  const update = (
    index,
    field,
    value
  ) => {
    setItems(
      (
        previous
      ) =>
        previous.map(
          (
            item,
            itemIndex
          ) => {

            if (
              itemIndex !==
              index
            ) {
              return item;
            }

            const textField =
              field === 'food_name' ||
              field === 'serving_size';

            return {
              ...item,
              [field]:
                textField
                  ? value
                  : value,
            };
          }
        )
    );
  };


  const addItem = () => {
    setItems(
      (
        previous
      ) => [
        ...previous,

        {
          food_name:
            '',

          serving_size:
            '1 serving',

          calories:
            0,

          protein_g:
            0,

          carbs_g:
            0,

          fat_g:
            0,

          meal_type:
            defaultMealType ||
            'snack',

          image_url:
            imageUrl,
        },
      ]
    );
  };


  const removeItem = (
    index
  ) => {
    setItems(
      (
        previous
      ) =>
        previous.filter(
          (
            _,
            itemIndex
          ) =>
            itemIndex !==
            index
        )
    );
  };


  const totalCals =
    items.reduce(
      (
        sum,
        item
      ) =>
        sum +
        (
          Number(
            item.calories
          ) || 0
        ),
      0
    );


  const validItems =
    items.filter(
      (item) =>
        item?.food_name
          ?.trim()
    );


  const modal =
    typeof document !==
      'undefined'
      ? createPortal(
          <div
            className="
              fixed
              inset-0
              z-[10000]
              flex
              items-center
              justify-center
              bg-black/40
              p-0
              sm:p-4
              pointer-events-auto
            "
          >

            {/* Panel */}

            <section
              className="
                relative
                z-10
                flex
                flex-col
                w-full
                max-w-lg
                max-h-[calc(100dvh-1rem)]
                sm:max-h-[90vh]
                overflow-hidden
                rounded-3xl
                border
                border-border
                bg-card
                shadow-2xl
                pointer-events-auto
              "
              style={{
                marginBottom:
                  'env(safe-area-inset-bottom)',
              }}
            >

              {/* =================================================
                  HEADER
                  ================================================= */}

              <header
                className="
                  shrink-0
                  flex
                  items-center
                  justify-between
                  px-5
                  pt-[max(0.75rem,env(safe-area-inset-top))]
                  pb-4
                  border-b
                  border-border
                  bg-background
                "
              >

                <div>

                  <h2 className="
                    font-heading
                    font-bold
                    text-lg
                  ">
                    {title}
                  </h2>


                  <p className="
                    text-xs
                    text-muted-foreground
                  ">
                    {subtitle}
                  </p>

                </div>


                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={
                    onCancel
                  }
                  aria-label="Close food review"
                  className="
                    pointer-events-auto
                    touch-manipulation
                  "
                >

                  <X className="
                    w-5
                    h-5
                  " />

                </Button>

              </header>


              {/* =================================================
                  SCROLLING FOOD CONTENT
                  ================================================= */}

              <div
                className="
                  flex-1
                  min-h-0
                  overflow-y-auto
                  overscroll-contain
                  px-5
                  py-4
                  space-y-4
                "
              >

                {/* Active Meal Selector for this scan/entry */}
                <div className="p-3 bg-muted/40 dark:bg-muted/20 rounded-2xl border border-border/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground font-heading">
                      Meal Category
                    </span>
                    <span className="text-[11px] text-primary font-semibold capitalize">
                      {selectedMeal}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 p-1 bg-background/80 dark:bg-card rounded-xl border border-border/60">
                    {[
                      { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
                      { value: 'lunch', label: 'Lunch', emoji: '☀️' },
                      { value: 'dinner', label: 'Dinner', emoji: '🌙' },
                      { value: 'snack', label: 'Snack', emoji: '🍎' },
                    ].map((m) => {
                      const isSelected = selectedMeal === m.value;
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            applyMealToAll(m.value);
                          }}
                          className={`
                            flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-xs font-semibold transition-all pointer-events-auto touch-manipulation cursor-pointer
                            ${
                              isSelected
                                ? 'bg-primary text-primary-foreground shadow-xs'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }
                          `}
                        >
                          <span>{m.emoji}</span>
                          <span className="hidden sm:inline">{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {items.map(
                  (
                    item,
                    index
                  ) => (

                    <Card
                      key={
                        index
                      }
                      className="
                        p-4
                        space-y-3
                      "
                    >

                      <div className="
                        flex
                        items-center
                        justify-between
                      ">

                        <p className="
                          text-xs
                          font-bold
                          text-muted-foreground
                          uppercase
                          tracking-wider
                        ">
                          Item {index + 1}
                        </p>


                        {items.length >
                          1 && (

                          <button
                            type="button"
                            onClick={() =>
                              removeItem(
                                index
                              )
                            }
                            className="
                              p-2
                              -m-2
                              text-destructive
                              hover:opacity-70
                              pointer-events-auto
                              touch-manipulation
                            "
                            aria-label={`Remove item ${
                              index + 1
                            }`}
                          >

                            <Trash2 className="
                              w-4
                              h-4
                            " />

                          </button>

                        )}

                      </div>


                      {/* Food name */}

                      <div>

                        <p className="
                          text-[11px]
                          text-muted-foreground
                          mb-1
                        ">
                          Food Name
                        </p>


                        <Input
                          value={
                            item.food_name ||
                            ''
                          }
                          onChange={
                            (event) =>
                              update(
                                index,
                                'food_name',
                                event.target.value
                              )
                          }
                          className="
                            h-10
                            text-sm
                          "
                          placeholder="e.g. Grilled Chicken Breast"
                        />

                      </div>


                      {/* Serving size */}

                      <div>

                        <p className="
                          text-[11px]
                          text-muted-foreground
                          mb-1
                        ">
                          Serving Size
                        </p>


                        <Input
                          value={
                            item.serving_size ||
                            ''
                          }
                          onChange={
                            (event) =>
                              update(
                                index,
                                'serving_size',
                                event.target.value
                              )
                          }
                          className="
                            h-10
                            text-sm
                          "
                          placeholder="e.g. 1 cup, 150g"
                        />

                      </div>


                      {/* Macros */}

                      <div className="
                        grid
                        grid-cols-2
                        gap-2
                      ">

                        <div>

                          <p className="
                            text-[11px]
                            text-muted-foreground
                            mb-1
                          ">
                            Calories
                          </p>


                          <Input
                            type="number"
                            inputMode="decimal"
                            value={
                              item.calories ??
                              ''
                            }
                            onChange={
                              (event) =>
                                update(
                                  index,
                                  'calories',
                                  event.target.value
                                )
                            }
                            className="
                              h-10
                              text-sm
                            "
                          />

                        </div>


                        <div>

                          <p className="
                            text-[11px]
                            text-muted-foreground
                            mb-1
                          ">
                            Protein (g)
                          </p>


                          <Input
                            type="number"
                            inputMode="decimal"
                            value={
                              item.protein_g ??
                              ''
                            }
                            onChange={
                              (event) =>
                                update(
                                  index,
                                  'protein_g',
                                  event.target.value
                                )
                            }
                            className="
                              h-10
                              text-sm
                            "
                          />

                        </div>


                        <div>

                          <p className="
                            text-[11px]
                            text-muted-foreground
                            mb-1
                          ">
                            Carbs (g)
                          </p>


                          <Input
                            type="number"
                            inputMode="decimal"
                            value={
                              item.carbs_g ??
                              ''
                            }
                            onChange={
                              (event) =>
                                update(
                                  index,
                                  'carbs_g',
                                  event.target.value
                                )
                            }
                            className="
                              h-10
                              text-sm
                            "
                          />

                        </div>


                        <div>

                          <p className="
                            text-[11px]
                            text-muted-foreground
                            mb-1
                          ">
                            Fat (g)
                          </p>


                          <Input
                            type="number"
                            inputMode="decimal"
                            value={
                              item.fat_g ??
                              ''
                            }
                            onChange={
                              (event) =>
                                update(
                                  index,
                                  'fat_g',
                                  event.target.value
                                )
                            }
                            className="
                              h-10
                              text-sm
                            "
                          />

                        </div>

                      </div>

                      {/* Meal Category */}
                      <div>
                        <p className="
                          text-[11px]
                          text-muted-foreground
                          mb-1.5
                          font-medium
                        ">
                          Meal
                        </p>
                        <div className="grid grid-cols-4 gap-1 p-1 bg-muted/60 dark:bg-muted/40 rounded-xl border border-border/60">
                          {[
                            { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
                            { value: 'lunch', label: 'Lunch', emoji: '☀️' },
                            { value: 'dinner', label: 'Dinner', emoji: '🌙' },
                            { value: 'snack', label: 'Snack', emoji: '🍎' },
                          ].map((m) => {
                            const isSelected = (item.meal_type || selectedMeal || defaultMealType || 'breakfast') === m.value;
                            return (
                              <button
                                key={m.value}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  update(index, 'meal_type', m.value);
                                }}
                                className={`
                                  flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 px-1 rounded-lg text-xs transition-all pointer-events-auto touch-manipulation
                                  ${
                                    isSelected
                                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                                      : 'text-muted-foreground hover:text-foreground hover:bg-background/60 font-medium'
                                  }
                                `}
                              >
                                <span className="text-xs">{m.emoji}</span>
                                <span className="text-[10px] sm:text-xs truncate">{m.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                    </Card>

                  )
                )}


                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="
                    w-full
                    h-10
                    gap-2
                    pointer-events-auto
                    touch-manipulation
                  "
                  onClick={
                    addItem
                  }
                >

                  <Plus className="
                    w-4
                    h-4
                  " />

                  Add Another Item

                </Button>


                <div className="
                  h-2
                " />

              </div>


              {/* =================================================
                  NON-SCROLLING ACTION FOOTER
                  ================================================= */}

              <footer
                className="
                  shrink-0
                  border-t
                  border-border
                  bg-card
                  px-5
                  pt-3
                  shadow-[0_-8px_24px_rgba(0,0,0,0.22)]
                "
                style={{
                  paddingBottom:
                    'max(0.875rem, env(safe-area-inset-bottom))',
                }}
              >

                <div className="
                  flex
                  items-center
                  justify-between
                  mb-2
                ">

                  <p className="
                    text-sm
                    text-muted-foreground
                  ">
                    Total
                  </p>


                  <p className="
                    font-heading
                    font-bold
                    text-sm
                  ">
                    {
                      Math.round(
                        totalCals
                      )
                    }{' '}
                    kcal ·{' '}
                    {
                      items.length
                    }{' '}
                    item
                    {
                      items.length !==
                      1
                        ? 's'
                        : ''
                    }
                  </p>

                </div>


                <p className="
                  text-[10px]
                  text-muted-foreground
                  mb-3
                  leading-relaxed
                ">
                  ⚠️ AI estimates are approximate and may not be
                  100% accurate. Portion sizes, cooking methods,
                  and brand differences can affect values.
                </p>


                {saveError && (
                  <p className="text-sm text-destructive mb-3" role="alert">
                    {saveError}
                  </p>
                )}

                {onSaveToMeals && (
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/40 hover:bg-muted/60 border border-border/70 cursor-pointer transition-colors text-xs select-none mb-3">
                    <input
                      type="checkbox"
                      checked={saveToMeals}
                      onChange={(e) => setSaveToMeals(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary w-4 h-4 accent-primary shrink-0"
                    />
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <span>⭐</span>
                      <span>Save to My Meals for quick 1-tap logging later</span>
                    </span>
                  </label>
                )}

                <Button
                  type="button"
                  onClick={async () => {
                    if (saving || validItems.length === 0) return;
                    setSaving(true);
                    setSaveError('');
                    try {
                      const normalizedItems =
                        validItems.map(
                          (item) => ({
                            ...item,
                            meal_type:
                              item.meal_type ||
                              selectedMeal ||
                              defaultMealType ||
                              'breakfast',
                            calories:
                              Number(item.calories) || 0,
                            protein_g:
                              Number(item.protein_g) || 0,
                            carbs_g:
                              Number(item.carbs_g) || 0,
                            fat_g:
                              Number(item.fat_g) || 0,
                          })
                        );

                      await onConfirm(normalizedItems);

                      if (saveToMeals && onSaveToMeals) {
                        try {
                          if (normalizedItems.length === 1) {
                            const item = normalizedItems[0];
                            onSaveToMeals({
                              name: item.food_name,
                              food_name: item.food_name,
                              meal_type: item.meal_type || selectedMeal || 'breakfast',
                              serving_size: item.serving_size || '1 serving',
                              calories: item.calories,
                              protein_g: item.protein_g,
                              carbs_g: item.carbs_g,
                              fat_g: item.fat_g,
                            });
                          } else if (normalizedItems.length > 1) {
                            const cals = normalizedItems.reduce((s, i) => s + (Number(i.calories) || 0), 0);
                            const p = normalizedItems.reduce((s, i) => s + (Number(i.protein_g) || 0), 0);
                            const c = normalizedItems.reduce((s, i) => s + (Number(i.carbs_g) || 0), 0);
                            const f = normalizedItems.reduce((s, i) => s + (Number(i.fat_g) || 0), 0);
                            const mealName = normalizedItems.map((i) => i.food_name).join(' + ');
                            onSaveToMeals({
                              name: mealName.slice(0, 60),
                              food_name: mealName.slice(0, 60),
                              meal_type: selectedMeal || defaultMealType || 'lunch',
                              serving_size: `${normalizedItems.length} items`,
                              calories: cals,
                              protein_g: Number(p.toFixed(1)),
                              carbs_g: Number(c.toFixed(1)),
                              fat_g: Number(f.toFixed(1)),
                              items: normalizedItems,
                            });
                          }
                        } catch (saveErr) {
                          console.warn('[FoodEditModal] onSaveToMeals note:', saveErr);
                        }
                      }
                    } catch (error) {
                      console.error('[FoodEditModal] Save failed:', error);
                      setSaveError(error?.message || 'Could not save this food. Please try again.');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={
                    saving ||
                    validItems.length ===
                    0
                  }
                  className="
                    w-full
                    h-12
                    min-h-12
                    font-heading
                    font-semibold
                    gap-2
                    pointer-events-auto
                    touch-manipulation
                  "
                >

                  <Check className="
                    w-4
                    h-4
                  " />

                  {saving ? 'Saving...' : 'Save to Log'}

                </Button>

              </footer>

            </section>

          </div>,

          document.body
        )
      : null;


  return modal;
}
