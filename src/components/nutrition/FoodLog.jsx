import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import FoodEditModal from './FoodEditModal';

const mealEmojis = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
};

export default function FoodLog({ entries, onDelete, onEdit }) {
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
                      <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <span>{entry.calories} kcal</span>
                        <span>P: {entry.protein_g || 0}g</span>
                        <span>C: {entry.carbs_g || 0}g</span>
                        <span>F: {entry.fat_g || 0}g</span>
                      </div>
                    </div>
                    <div className="flex items-center shrink-0">
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
          title="Edit Logged Food"
          subtitle="Correct anything you want to change"
          onConfirm={async (items) => {
            const updated = items[0];
            if (!updated) throw new Error('No food item to save.');
            await onEdit(editingEntry.id, updated);
            setEditingEntry(null);
          }}
          onCancel={() => setEditingEntry(null)}
        />
      )}
    </>
  );
}
