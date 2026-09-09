import { useState, useRef } from 'react';

import {
  Camera,
  Package,
  Loader2,
  Lock,
  AlertCircle,
} from 'lucide-react';

import {
  Card,
} from '@/components/ui/card';

import {
  supabaseApi,
} from '@/lib/supabaseApi';

import {
  canAccess,
} from '@/lib/subscription';

import FoodEditModal from './FoodEditModal';


/*
 * ============================================================
 * FOOD MEMORY
 * ============================================================
 */

const FOOD_MEMORY_KEY =
  'washek_food_memory';


function getFoodMemory() {
  try {
    const raw =
      localStorage.getItem(
        FOOD_MEMORY_KEY
      );

    if (!raw) {
      return {};
    }

    const parsed =
      JSON.parse(raw);

    return parsed &&
      typeof parsed === 'object'
      ? parsed
      : {};
  } catch {
    return {};
  }
}


function saveFoodMemory(
  foods
) {
  try {
    const memory =
      getFoodMemory();

    for (
      const food of
      foods || []
    ) {
      const name =
        String(
          food?.food_name ||
            ''
        )
          .trim()
          .toLowerCase();

      if (!name) {
        continue;
      }

      memory[name] = {
        calories:
          food.calories,

        protein_g:
          food.protein_g,

        carbs_g:
          food.carbs_g,

        fat_g:
          food.fat_g,

        serving_size:
          food.serving_size,
      };
    }

    localStorage.setItem(
      FOOD_MEMORY_KEY,
      JSON.stringify(
        memory
      )
    );
  } catch (
    error
  ) {
    console.warn(
      '[FoodScanner] Could not save food memory:',
      error
    );
  }
}


function buildMemoryContext() {
  const memory =
    getFoodMemory();

  const entries =
    Object.entries(
      memory
    );

  if (
    !entries.length
  ) {
    return '';
  }

  /*
   * Keep this deliberately small.
   * A huge history makes the multimodal request unnecessarily large.
   */
  const recent =
    entries.slice(
      -20
    );

  const lines =
    recent
      .map(
        ([
          name,
          value,
        ]) =>
          `- ${name}: ${value.calories ?? '?'} kcal, ${value.protein_g ?? '?'}g protein, ${value.carbs_g ?? '?'}g carbs, ${value.fat_g ?? '?'}g fat (${value.serving_size || 'per serving'})`
      )
      .join(
        '\n'
      );

  return `

PREVIOUSLY CORRECTED FOODS:
These are reference examples only. Use them when the same food is visibly present.

${lines}
`;
}


/*
 * ============================================================
 * NUMBER / NORMALIZATION HELPERS
 * ============================================================
 */

function numberOrZero(
  value
) {
  const parsed =
    Number(
      value
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    parsed
  );
}


function normalizeFood(
  food
) {
  if (
    !food ||
    typeof food !==
      'object'
  ) {
    return null;
  }

  const foodName =
    String(
      food.food_name ||
        food.name ||
        ''
    ).trim();

  if (
    !foodName
  ) {
    return null;
  }

  return {
    food_name:
      foodName,

    serving_size:
      String(
        food.serving_size ||
          'Estimated serving'
      ).trim(),

    calories:
      Math.round(
        numberOrZero(
          food.calories
        )
      ),

    protein_g:
      Number(
        numberOrZero(
          food.protein_g
        ).toFixed(
          1
        )
      ),

    carbs_g:
      Number(
        numberOrZero(
          food.carbs_g
        ).toFixed(
          1
        )
      ),

    fat_g:
      Number(
        numberOrZero(
          food.fat_g
        ).toFixed(
          1
        )
      ),
  };
}


function normalizeFoods(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value
      .map(
        normalizeFood
      )
      .filter(
        Boolean
      );
  }

  if (
    value &&
    typeof value ===
      'object'
  ) {
    if (
      Array.isArray(
        value.foods
      )
    ) {
      return value.foods
        .map(
          normalizeFood
        )
        .filter(
          Boolean
        );
    }

    const one =
      normalizeFood(
        value
      );

    return one
      ? [one]
      : [];
  }

  return [];
}


/*
 * ============================================================
 * AI JSON PARSER
 * ============================================================
 *
 * Food Scan intentionally does NOT request JSON schema from
 * openrouter/free anymore.
 *
 * The model returns ordinary text containing JSON.
 * We parse it ourselves here.
 */

function parseFoodAIResult(
  value
) {
  /*
   * Some models may return an object anyway.
   */
  if (
    value &&
    typeof value ===
      'object'
  ) {
    return value;
  }

  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  let text =
    value.trim();

  /*
   * Remove a markdown JSON fence.
   */
  text =
    text.replace(
      /^```(?:json)?\s*/i,
      ''
    );

  text =
    text.replace(
      /\s*```$/i,
      ''
    );

  /*
   * First attempt: whole response is JSON.
   */
  try {
    return JSON.parse(
      text
    );
  } catch {
    /*
     * Some free models may put a little text before/after
     * the JSON. Attempt to extract the outermost object.
     */
  }

  const firstBrace =
    text.indexOf(
      '{'
    );

  const lastBrace =
    text.lastIndexOf(
      '}'
    );

  if (
    firstBrace >= 0 &&
    lastBrace >
      firstBrace
  ) {
    const candidate =
      text.slice(
        firstBrace,
        lastBrace +
          1
      );

    try {
      return JSON.parse(
        candidate
      );
    } catch {
      return null;
    }
  }

  /*
   * Also support an array response just in case.
   */

  const firstBracket =
    text.indexOf(
      '['
    );

  const lastBracket =
    text.lastIndexOf(
      ']'
    );

  if (
    firstBracket >= 0 &&
    lastBracket >
      firstBracket
  ) {
    const candidate =
      text.slice(
        firstBracket,
        lastBracket +
          1
      );

    try {
      return JSON.parse(
        candidate
      );
    } catch {
      return null;
    }
  }

  return null;
}


/*
 * ============================================================
 * PROMPTS
 * ============================================================
 */

function buildFoodPrompt() {
  return `
You are Kael, the nutrition-analysis system for WASHEK.

Analyze the supplied food photograph as accurately as possible.

IDENTIFY:
- Every distinct visible food item that can reasonably be identified.
- Specific food names when the image supports them.
- Visible sauces, dressings, oils, toppings, breading, or other visible ingredients.

ESTIMATE:
- Visible serving size.
- Calories.
- Protein grams.
- Carbohydrate grams.
- Fat grams.

IMPORTANT ACCURACY RULES:
- A photograph does not provide laboratory precision, so return a defensible estimate rather than false precision.
- Estimate the amount actually visible, not a generic restaurant serving. Use plate/container size, item count, thickness, volume, and relative scale when available.
- Account for visible calorie-dense additions such as oils, butter, cheese, dressings, sauces, breading, nuts, and toppings when they are reasonably identifiable.
- Do not invent hidden ingredients. If an ingredient cannot be supported by the image, do not add it just to make the numbers fit.
- Prefer standard nutrition references for recognizable foods and scale them to the estimated visible portion.
- Perform a final nutrition sanity check before returning the answer. Calories should be broadly compatible with the reported protein, carbohydrates, and fat (about 4 kcal/g protein + 4 kcal/g carbs + 9 kcal/g fat, allowing for fiber, rounding, and normal food-label differences).
- If the macro-derived calorie estimate and stated calories differ substantially, revisit the portion size and macro estimates and correct the inconsistency.
- Do not inflate protein simply because a food is associated with fitness or a high-protein diet.
- Do not assume cooking oil, sauces, or dressings are zero-calorie when they are visibly present; estimate only what is reasonably supported.
- If portion size is uncertain, choose the most defensible midpoint estimate and make the serving_size description explicit.
- Use sensible one-decimal precision for grams and whole-number calories; do not manufacture extra precision.

Return ONLY valid JSON.

Do not use Markdown.
Do not add an explanation before or after the JSON.
Do not wrap the JSON in \`\`\` fences.

Return exactly this structure:

{
  "foods": [
    {
      "food_name": "specific food name",
      "serving_size": "estimated visible serving",
      "calories": 0,
      "protein_g": 0,
      "carbs_g": 0,
      "fat_g": 0
    }
  ]
}

${buildMemoryContext()}
`;
}


function buildBarcodePrompt() {
  return `
You are Kael's nutrition-label analysis system for WASHEK.

Analyze the supplied food package or Nutrition Facts image.

When the Nutrition Facts label is readable:
- use the printed serving size
- use the printed calories
- use the printed protein
- use the printed carbohydrates
- use the printed fat

Do NOT invent printed nutrition values.

If the exact product or label cannot be read, make that clear in the product name rather than pretending certainty.

Return ONLY valid JSON.

Do not use Markdown.
Do not add commentary outside the JSON.

Return exactly:

{
  "food_name": "product name",
  "serving_size": "serving size",
  "calories": 0,
  "protein_g": 0,
  "carbs_g": 0,
  "fat_g": 0
}

${buildMemoryContext()}
`;
}


/*
 * ============================================================
 * COMPONENT
 * ============================================================
 */

export default function FoodScanner({
  onFoodDetected,
  userPlan = 'free',
}) {
  const [
    scanning,
    setScanning,
  ] =
    useState(
      false
    );

  const [
    scanMode,
    setScanMode,
  ] =
    useState(
      null
    );

  const [
    pendingFoods,
    setPendingFoods,
  ] =
    useState(
      null
    );

  const [
    error,
    setError,
  ] =
    useState(
      ''
    );

  const inputRef =
    useRef(
      null
    );


  /*
   * ----------------------------------------------------------
   * ACCESS
   * ----------------------------------------------------------
   */

  const snapLocked =
    !canAccess(
      userPlan,
      'snap_food'
    );

  const barcodeLocked =
    !canAccess(
      userPlan,
      'scan_barcode'
    );


  /*
   * ----------------------------------------------------------
   * RESET INPUT
   * ----------------------------------------------------------
   */

  const resetFileInput =
    () => {
      if (
        inputRef.current
      ) {
        inputRef.current.value =
          '';
      }
    };


  /*
   * ----------------------------------------------------------
   * OPEN CAMERA/GALLERY
   * ----------------------------------------------------------
   */

  const openScanner =
    (
      mode
    ) => {
      setError(
        ''
      );

      setScanMode(
        mode
      );

      window.setTimeout(
        () => {
          inputRef.current?.click();
        },
        50
      );
    };


  /*
   * ==========================================================
   * FOOD PHOTO
   * ==========================================================
   */

  const handleFoodPhoto =
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

      if (
        snapLocked
      ) {
        setError(
          'Food scanning is available on the Progress plan and above.'
        );

        resetFileInput();

        return;
      }

      setScanning(
        true
      );

      setScanMode(
        'photo'
      );

      setError(
        ''
      );

      try {
        /*
         * ------------------------------------------------------
         * VALIDATE IMAGE
         * ------------------------------------------------------
         */

        if (
          !file.type.startsWith(
            'image/'
          )
        ) {
          throw new Error(
            'Please choose an image of your food.'
          );
        }


        /*
         * ------------------------------------------------------
         * UPLOAD
         * ------------------------------------------------------
         */

        const uploaded =
          await supabaseApi.storage.uploadFile(
            {
              file,
            }
          );

        const imageUrl =
          uploaded?.file_url;

        if (
          !imageUrl
        ) {
          throw new Error(
            'The food photo uploaded, but no image URL was returned.'
          );
        }


        /*
         * ------------------------------------------------------
         * AI REQUEST
         *
         * NO response_json_schema HERE.
         *
         * This is the actual fix for the OpenRouter 404:
         *
         * "No endpoints found that can handle the requested
         * parameters."
         * ------------------------------------------------------
         */

        console.log(
          '[FoodScanner] Starting food image analysis.'
        );

        const rawResult =
          await supabaseApi.ai.invoke(
            {
              type:
                'food_scan',

              prompt:
                buildFoodPrompt(),

              file_urls: [
                imageUrl,
              ],
            }
          );


        /*
         * ------------------------------------------------------
         * PARSE MODEL OUTPUT
         * ------------------------------------------------------
         */

        const parsedResult =
          parseFoodAIResult(
            rawResult
          );

        if (
          !parsedResult
        ) {
          throw new Error(
            'Kael returned an unreadable food analysis. Please try another photo.'
          );
        }


        const foods =
          normalizeFoods(
            parsedResult
          );


        if (
          !foods.length
        ) {
          throw new Error(
            'Kael could not identify any food items in that photo. Try a clearer photo with the entire meal visible.'
          );
        }


        /*
         * ------------------------------------------------------
         * SAVE MEMORY
         * ------------------------------------------------------
         */

        saveFoodMemory(
          foods
        );


        /*
         * ------------------------------------------------------
         * OPEN EDIT/CONFIRMATION
         * ------------------------------------------------------
 */

        setPendingFoods(
          {
            foods,

            imageUrl,
          }
        );

      } catch (
        caught
      ) {
        console.error(
          '[FoodScanner] Food scan failed:',
          caught
        );

        setError(
          caught?.message ||
            'Food analysis failed. Please try again.'
        );
      } finally {
        setScanning(
          false
        );

        setScanMode(
          null
        );

        resetFileInput();
      }
    };


  /*
   * ==========================================================
   * BARCODE / PACKAGE PHOTO
   * ==========================================================
   */

  const handleBarcodePhoto =
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

      if (
        barcodeLocked
      ) {
        setError(
          'Package scanning is available on the Progress plan and above.'
        );

        resetFileInput();

        return;
      }

      setScanning(
        true
      );

      setScanMode(
        'barcode'
      );

      setError(
        ''
      );

      try {
        if (
          !file.type.startsWith(
            'image/'
          )
        ) {
          throw new Error(
            'Please choose an image of the package or nutrition label.'
          );
        }


        const uploaded =
          await supabaseApi.storage.uploadFile(
            {
              file,
            }
          );


        const imageUrl =
          uploaded?.file_url;


        if (
          !imageUrl
        ) {
          throw new Error(
            'The package photo uploaded, but no image URL was returned.'
          );
        }


        /*
         * Same fix here:
         * no structured-output schema.
         */

        const rawResult =
          await supabaseApi.ai.invoke(
            {
              type:
                'food_barcode',

              prompt:
                buildBarcodePrompt(),

              file_urls: [
                imageUrl,
              ],
            }
          );


        const parsedResult =
          parseFoodAIResult(
            rawResult
          );


        if (
          !parsedResult
        ) {
          throw new Error(
            'Kael returned an unreadable label analysis. Try a clearer photo of the Nutrition Facts panel.'
          );
        }


        const foods =
          normalizeFoods(
            parsedResult
          );


        if (
          !foods.length
        ) {
          throw new Error(
            'Kael could not read that package. Try a clearer photo of the Nutrition Facts label.'
          );
        }


        saveFoodMemory(
          foods
        );


        setPendingFoods(
          {
            foods,

            imageUrl,
          }
        );

      } catch (
        caught
      ) {
        console.error(
          '[FoodScanner] Package scan failed:',
          caught
        );

        setError(
          caught?.message ||
            'Package analysis failed. Please try again.'
        );
      } finally {
        setScanning(
          false
        );

        setScanMode(
          null
        );

        resetFileInput();
      }
    };


  /*
   * ==========================================================
   * FILE ROUTER
   * ==========================================================
   *
   * One hidden input is used for both modes.
   */

  const handleFileChange =
    async (
      event
    ) => {
      if (
        scanMode ===
        'barcode'
      ) {
        await handleBarcodePhoto(
          event
        );

        return;
      }

      await handleFoodPhoto(
        event
      );
    };


  /*
   * ==========================================================
   * CONFIRM FOOD
   * ==========================================================
   */

  const handleConfirm =
    (
      items
    ) => {
      const foods =
        normalizeFoods(
          items
        );

      if (
        !foods.length
      ) {
        setError(
          'There were no valid food items to save.'
        );

        return;
      }

      /*
       * Remember corrected values for future scans.
       */

      saveFoodMemory(
        foods
      );


      /*
       * Send each detected food back to the nutrition
       * tracker exactly as before.
       */

      for (
        const food of
        foods
      ) {
        onFoodDetected(
          food
        );
      }


      setPendingFoods(
        null
      );

      setError(
        ''
      );
    };


  /*
   * ==========================================================
   * CANCEL EDIT
   * ==========================================================
   */

  const handleCancel =
    () => {
      setPendingFoods(
        null
      );

      setError(
        ''
      );
    };


  /*
   * ==========================================================
   * EDIT MODAL
   * ==========================================================
   */

  if (
    pendingFoods
  ) {
    return (
      <FoodEditModal
        foods={
          pendingFoods.foods
        }

        imageUrl={
          pendingFoods.imageUrl
        }

        onConfirm={
          handleConfirm
        }

        onCancel={
          handleCancel
        }
      />
    );
  }


  /*
   * ==========================================================
   * SCANNING UI
   * ==========================================================
   */

  if (
    scanning
  ) {
    return (
      <Card className="p-8 flex flex-col items-center gap-3">

        <Loader2 className="w-10 h-10 text-primary animate-spin" />

        <p className="font-heading font-bold">
          {scanMode ===
          'barcode'
            ? 'Reading your food label…'
            : 'Analyzing your food…'}
        </p>

        <p className="text-sm text-muted-foreground text-center">
          Kael is identifying the food and estimating its nutrition.
        </p>

      </Card>
    );
  }


  /*
   * ==========================================================
   * MAIN UI
   * ==========================================================
   */

  return (
    <div className="space-y-3">

      {error && (
        <Card className="p-3 border-destructive/30 bg-destructive/5">

          <div className="flex items-start gap-2">

            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />

            <div className="flex-1">

              <p className="text-xs font-semibold text-destructive">
                Food analysis failed
              </p>

              <p className="text-xs text-muted-foreground mt-1 break-words">
                {
                  error
                }
              </p>

              <button
                type="button"
                className="text-xs font-semibold text-primary mt-2"
                onClick={() =>
                  setError(
                    ''
                  )
                }
              >
                Dismiss
              </button>

            </div>

          </div>

        </Card>
      )}


      <input
        ref={
          inputRef
        }

        type="file"

        accept="image/*"

        capture="environment"

        className="hidden"

        onChange={
          handleFileChange
        }
      />


      <div className="grid grid-cols-2 gap-3">

        {/* SNAP FOOD */}

        <Card
          className={`
            p-5
            flex
            flex-col
            items-center
            gap-2
            transition-all
            ${
              snapLocked
                ? 'opacity-60'
                : 'cursor-pointer hover:border-primary/40 active:scale-[0.98]'
            }
          `}

          onClick={() => {
            if (
              snapLocked
            ) {
              setError(
                'Food scanning is available on the Progress plan and above.'
              );

              return;
            }

            openScanner(
              'photo'
            );
          }}
        >

          <div
            className={`
              w-12
              h-12
              rounded-2xl
              flex
              items-center
              justify-center
              ${
                snapLocked
                  ? 'bg-muted'
                  : 'bg-primary/15'
              }
            `}
          >

            {snapLocked ? (
              <Lock className="w-6 h-6 text-muted-foreground" />
            ) : (
              <Camera className="w-6 h-6 text-primary" />
            )}

          </div>

          <p className="font-heading font-bold text-sm">
            Snap Food
          </p>

          <p className="text-[10px] text-muted-foreground text-center">
            {snapLocked
              ? 'Progress plan+'
              : 'Take a photo of your meal'}
          </p>

        </Card>


        {/* SCAN PACKAGE */}

        <Card
          className={`
            p-5
            flex
            flex-col
            items-center
            gap-2
            transition-all
            ${
              barcodeLocked
                ? 'opacity-60'
                : 'cursor-pointer hover:border-primary/40 active:scale-[0.98]'
            }
          `}

          onClick={() => {
            if (
              barcodeLocked
            ) {
              setError(
                'Package scanning is available on the Progress plan and above.'
              );

              return;
            }

            openScanner(
              'barcode'
            );
          }}
        >

          <div
            className={`
              w-12
              h-12
              rounded-2xl
              flex
              items-center
              justify-center
              ${
                barcodeLocked
                  ? 'bg-muted'
                  : 'bg-accent/15'
              }
            `}
          >

            {barcodeLocked ? (
              <Lock className="w-6 h-6 text-muted-foreground" />
            ) : (
              <Package className="w-6 h-6 text-accent" />
            )}

          </div>

          <p className="font-heading font-bold text-sm">
            Scan Package
          </p>

          <p className="text-[10px] text-muted-foreground text-center">
            {barcodeLocked
              ? 'Progress plan+'
              : 'Photo of food packaging'}
          </p>

        </Card>

      </div>

    </div>
  );
}
