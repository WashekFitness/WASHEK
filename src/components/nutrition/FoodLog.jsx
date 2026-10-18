import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Pencil, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import FoodEditModal from './FoodEditModal';

const mealEmojis = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
};

export default function FoodLog({ entries, onDelete, onEdit, onSaveToMeals }) {
  const [editingEntry, setEditingEntry] = useState(null);

  const grouped = entries.reduce((acc, entry) => {
    const meal = entry.meal_type || 'snack';
    if (!acc[meal]) acc[meal] = [];
    acc[meal].push(entry);
    return acc;
  }, {});

  const mealOrder = ['breakfast', 'lunch', 'dinner', 'snack'];

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">No food logged today.</p>
        <p className="text-xs mt-1">Scan or add your first meal!</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {mealOrder.map(meal => {
          const items = grouped[meal];
          if (!items?.length) return null;

          const mealCalories = items.reduce((sum, e) => sum + (Number(e.calories) || 0), 0);

          return (
            <div key={meal}>
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="font-heading font-bold text-sm capitalize">
                  {mealEmojis[meal]} {meal}
                </p>
                <span className="text-xs text-muted-foreground">{Math.round(mealCalories)} kcal</span>
              </div>
              <div className="space-y-1.5">
                {items.map((entry) => (
                  <Card key={entry.id} className="p-3 flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{entry.food_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span>{entry.calories} kcal</span>
                        <span className="text-border/80">•</span>
                        <span>P: {entry.protein_g || 0}g</span>
                        <span className="text-border/80">•</span>
                        <span>C: {entry.carbs_g || 0}g</span>
                        <span className="text-border/80">•</span>
                        <span>F: {entry.fat_g || 0}g</span>
                        <span className="text-border/80">•</span>
                        <div className="inline-flex items-center gap-1 bg-muted/80 dark:bg-muted/50 border border-border/80 dark:border-white/10 rounded-md px-1.5 py-0.5 shadow-2xs">
                          <span className="text-[10px] text-muted-foreground font-semibold">Meal:</span>
                          <select
                            value={entry.meal_type || 'breakfast'}
                            onChange={(e) => {
                              const nextMeal = e.target.value;
                              if (nextMeal && nextMeal !== (entry.meal_type || 'breakfast')) {
                                onEdit(entry.id, {
                                  ...entry,
                                  meal_type: nextMeal,
                                });
                              }
                            }}
                            aria-label={`Change meal for ${entry.food_name}`}
                            className="text-xs font-semibold text-foreground bg-transparent cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-primary capitalize touch-manipulation dark:text-white"
                          >
                            <option value="breakfast" className="bg-card text-foreground">🌅 Breakfast</option>
                            <option value="lunch" className="bg-card text-foreground">☀️ Lunch</option>
                            <option value="dinner" className="bg-card text-foreground">🌙 Dinner</option>
                            <option value="snack" className="bg-card text-foreground">🍎 Snack</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center shrink-0">
                      {onSaveToMeals && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-amber-500"
                          onClick={() =>
                            onSaveToMeals({
                              name: entry.food_name,
                              food_name: entry.food_name,
                              meal_type: entry.meal_type || 'breakfast',
                              serving_size: entry.serving_size || '1 serving',
                              calories: Number(entry.calories) || 0,
                              protein_g: Number(entry.protein_g) || 0,
                              carbs_g: Number(entry.carbs_g) || 0,
                              fat_g: Number(entry.fat_g) || 0,
                            })
                          }
                          aria-label={`Save ${entry.food_name} to My Meals`}
                          title="Save to My Meals"
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingEntry(entry)}
                        aria-label={`Edit ${entry.food_name}`}
                      >
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onDelete(entry.id)}
                        aria-label={`Delete ${entry.food_name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {editingEntry && (
        <FoodEditModal
          foods={[editingEntry]}
          imageUrl={editingEntry.image_url}
          defaultMealType={editingEntry.meal_type || 'breakfast'}
          onSaveToMeals={onSaveToMeals}
          title="Edit Logged Food"
          subtitle="Correct anything you want to change"
          onConfirm={async (items) => {
            const updated = items[0];
            if (!updated) throw new Error('No food item to save.');
            await onEdit(editingEntry.id, {
              ...editingEntry,
              ...updated,
              meal_type: updated.meal_type || editingEntry.meal_type || 'breakfast',
            });
            setEditingEntry(null);
          }}
          onCancel={() => setEditingEntry(null)}
        />
      )}
    </>
  );
}
