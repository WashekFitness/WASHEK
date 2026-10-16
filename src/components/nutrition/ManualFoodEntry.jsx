import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Plus } from 'lucide-react';

export default function ManualFoodEntry({ onSubmit, defaultMealType = 'snack' }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({
    food_name: '',
    calories: '',
    protein_g: '',
    carbs_g: '',
    fat_g: '',
    serving_size: '',
    meal_type: defaultMealType || 'snack',
  });

  useEffect(() => {
    setData((d) => ({
      ...d,
      meal_type: d.food_name ? d.meal_type : (defaultMealType || 'snack'),
    }));
  }, [defaultMealType]);

  const handleSubmit = () => {
    if (!data.food_name || !data.calories) return;
    onSubmit({
      ...data,
      meal_type: data.meal_type || defaultMealType || 'snack',
      calories: Number(data.calories),
      protein_g: Number(data.protein_g) || 0,
      carbs_g: Number(data.carbs_g) || 0,
      fat_g: Number(data.fat_g) || 0,
    });
    setData({
      food_name: '',
      calories: '',
      protein_g: '',
      carbs_g: '',
      fat_g: '',
      serving_size: '',
      meal_type: defaultMealType || 'snack',
    });
    setOpen(false);
  };

  if (!open) {
    return (
      <Button variant="outline" className="w-full h-12" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-2" /> Add Manually
      </Button>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Food Name</Label>
          <Input value={data.food_name} onChange={e => setData(d => ({ ...d, food_name: e.target.value }))} placeholder="e.g. Chicken breast" />
        </div>
        <div>
          <Label className="text-xs">Calories</Label>
          <Input type="number" value={data.calories} onChange={e => setData(d => ({ ...d, calories: e.target.value }))} placeholder="kcal" />
        </div>
        <div>
          <Label className="text-xs">Serving</Label>
          <Input value={data.serving_size} onChange={e => setData(d => ({ ...d, serving_size: e.target.value }))} placeholder="e.g. 150g" />
        </div>
        <div>
          <Label className="text-xs">Protein (g)</Label>
          <Input type="number" value={data.protein_g} onChange={e => setData(d => ({ ...d, protein_g: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs">Carbs (g)</Label>
          <Input type="number" value={data.carbs_g} onChange={e => setData(d => ({ ...d, carbs_g: e.target.value }))} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs">Fat (g)</Label>
          <Input type="number" value={data.fat_g} onChange={e => setData(d => ({ ...d, fat_g: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <Label className="text-xs mb-1.5 block">Meal</Label>
          <div className="grid grid-cols-4 gap-1 p-1 bg-muted/60 dark:bg-muted/40 rounded-xl border border-border/60">
            {[
              { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
              { value: 'lunch', label: 'Lunch', emoji: '☀️' },
              { value: 'dinner', label: 'Dinner', emoji: '🌙' },
              { value: 'snack', label: 'Snack', emoji: '🍎' },
            ].map((m) => {
              const isSelected = (data.meal_type || defaultMealType || 'snack') === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setData((d) => ({ ...d, meal_type: m.value }))}
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
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 h-12" onClick={() => setOpen(false)}>Cancel</Button>
        <Button className="flex-1 h-12" onClick={handleSubmit} disabled={!data.food_name || !data.calories}>Add Food</Button>
      </div>
    </Card>
  );
}