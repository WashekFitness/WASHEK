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
  title = 'Review Scan',
  subtitle = 'Edit anything the AI got wrong',
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [
    items,
    setItems,
  ] = useState(
    (foods || []).map(
      (food) =>
        Object.fromEntries(
          Object.entries(
            food || {}
          ).filter(
            ([key]) =>
              key !== 'image_url'
          )
        )
    )
  );


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
