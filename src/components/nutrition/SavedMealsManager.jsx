import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  Flame,
  Drumstick,
  Wheat,
  Droplets,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabaseApi } from '@/lib/supabaseApi';

const MEAL_EMOJIS = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
};

export default function SavedMealsManager({
  userKey = 'athlete',
  activeMealType = 'breakfast',
  onLogMeal,
  onClose,
  isModal = false,
}) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isCreating, setIsCreating] = useState(false);
  const [editingMeal, setEditingMeal] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    meal_type: activeMealType || 'breakfast',
    serving_size: '1 serving',
    calories: '',
    protein_g: '',
    carbs_g: '',
    fat_g: '',
  });

  const { data: savedMeals = [], isLoading } = useQuery({
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
        console.warn('[SavedMealsManager] Fetch fallback to list:', err);
        const list = await supabaseApi.entities.SavedMeal.list('-created_at', 200);
        return list || [];
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: (newMeal) =>
      supabaseApi.entities.SavedMeal.create({
        ...newMeal,
        created_by: userKey,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['saved_meals', userKey], (old = []) => [
        saved,
        ...old.filter((m) => m.id !== saved.id),
      ]);
      queryClient.invalidateQueries({ queryKey: ['saved_meals'] });
      toast.success(`Saved "${saved.name || 'meal'}" to your library!`);
      setIsCreating(false);
      resetForm();
    },
    onError: (err) => {
      console.error('[SavedMealsManager] Create error:', err);
      toast.error(err?.message || 'Failed to save meal.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) =>
      supabaseApi.entities.SavedMeal.update(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['saved_meals', userKey], (old = []) =>
        old.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
      );
      queryClient.invalidateQueries({ queryKey: ['saved_meals'] });
      toast.success(`Updated "${updated.name}" macros!`);
      setEditingMeal(null);
      resetForm();
    },
    onError: (err) => {
      console.error('[SavedMealsManager] Update error:', err);
      toast.error(err?.message || 'Failed to update meal.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => supabaseApi.entities.SavedMeal.delete(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData(['saved_meals', userKey], (old = []) =>
        old.filter((m) => m.id !== id)
      );
      queryClient.invalidateQueries({ queryKey: ['saved_meals'] });
      toast.success('Removed from saved meals.');
    },
    onError: (err) => {
      console.error('[SavedMealsManager] Delete error:', err);
      toast.error(err?.message || 'Failed to delete saved meal.');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      meal_type: activeMealType || 'breakfast',
      serving_size: '1 serving',
      calories: '',
      protein_g: '',
      carbs_g: '',
      fat_g: '',
    });
  };

  const openEdit = (meal) => {
    setEditingMeal(meal);
    setFormData({
      name: meal.name || meal.food_name || '',
      meal_type: meal.meal_type || 'breakfast',
      serving_size: meal.serving_size || '1 serving',
      calories: String(meal.calories ?? ''),
      protein_g: String(meal.protein_g ?? ''),
      carbs_g: String(meal.carbs_g ?? ''),
      fat_g: String(meal.fat_g ?? ''),
    });
  };

  const handleFormSubmit = (e) => {
    e?.preventDefault();
    if (!formData.name.trim() || !formData.calories) {
      toast.error('Please enter a meal name and calories.');
      return;
    }

    const payload = {
      name: formData.name.trim(),
      food_name: formData.name.trim(),
      meal_type: formData.meal_type || 'breakfast',
      serving_size: formData.serving_size.trim() || '1 serving',
      calories: Number(formData.calories) || 0,
      protein_g: Number(formData.protein_g) || 0,
      carbs_g: Number(formData.carbs_g) || 0,
      fat_g: Number(formData.fat_g) || 0,
    };

    if (editingMeal) {
      updateMutation.mutate({ id: editingMeal.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filteredMeals = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return savedMeals.filter((meal) => {
      const name = (meal.name || meal.food_name || '').toLowerCase();
      const type = (meal.meal_type || '').toLowerCase();
      const matchesSearch = !q || name.includes(q) || type.includes(q);
      const matchesFilter = filterType === 'all' || type === filterType;
      return matchesSearch && matchesFilter;
    });
  }, [savedMeals, searchQuery, filterType]);

  const handleQuickLog = (meal, chosenMealType) => {
    if (!onLogMeal) return;
    const targetMeal = chosenMealType || activeMealType || meal.meal_type || 'breakfast';
    onLogMeal({
      food_name: meal.name || meal.food_name || 'Saved Meal',
      meal_type: targetMeal,
      serving_size: meal.serving_size || '1 serving',
      calories: Number(meal.calories) || 0,
      protein_g: Number(meal.protein_g) || 0,
      carbs_g: Number(meal.carbs_g) || 0,
      fat_g: Number(meal.fat_g) || 0,
    });
    toast.success(`Logged "${meal.name}" to ${targetMeal}!`);
    if (onClose && isModal) {
      onClose();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-border/80 dark:border-white/[0.08]">
        <div>
          <h2 className="font-heading font-bold text-lg sm:text-xl text-foreground">
            Saved Meals & Snacks
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quick 1-tap logging for your regular meals, shakes, and snacks.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {!isCreating && !editingMeal && (
            <Button
              onClick={() => {
                resetForm();
                setIsCreating(true);
              }}
              size="sm"
              className="gap-1.5 h-9 w-full sm:w-auto font-semibold shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>New Saved Meal</span>
            </Button>
          )}

          {isModal && onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-9 w-9 shrink-0 text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {(isCreating || editingMeal) && (
        <Card className="p-4 sm:p-5 border-primary/40 bg-card shadow-md space-y-4 animate-in fade-in-50 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">{editingMeal ? '✏️' : '✨'}</span>
              <h3 className="font-heading font-bold text-sm sm:text-base text-foreground">
                {editingMeal ? `Edit "${editingMeal.name}"` : 'Create New Saved Meal'}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => {
                setIsCreating(false);
                setEditingMeal(null);
                resetForm();
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-3.5">
            <div>
              <Label className="text-xs font-semibold">Custom Meal Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Post-Workout Shake, Chipotle Bowl, Morning Eggs"
                className="mt-1 h-10"
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Serving Size</Label>
                <Input
                  value={formData.serving_size}
                  onChange={(e) => setFormData((d) => ({ ...d, serving_size: e.target.value }))}
                  placeholder="e.g. 1 bowl, 400g"
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Calories (kcal)</Label>
                <Input
                  type="number"
                  value={formData.calories}
                  onChange={(e) => setFormData((d) => ({ ...d, calories: e.target.value }))}
                  placeholder="kcal"
                  className="mt-1 h-9 text-xs"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div>
                <Label className="text-[11px] font-semibold text-blue-500">Protein (g)</Label>
                <Input
                  type="number"
                  value={formData.protein_g}
                  onChange={(e) => setFormData((d) => ({ ...d, protein_g: e.target.value }))}
                  placeholder="0"
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-emerald-500">Carbs (g)</Label>
                <Input
                  type="number"
                  value={formData.carbs_g}
                  onChange={(e) => setFormData((d) => ({ ...d, carbs_g: e.target.value }))}
                  placeholder="0"
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-amber-500">Fat (g)</Label>
                <Input
                  type="number"
                  value={formData.fat_g}
                  onChange={(e) => setFormData((d) => ({ ...d, fat_g: e.target.value }))}
                  placeholder="0"
                  className="mt-1 h-9 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold mb-1.5 block">Category</Label>
              <div className="grid grid-cols-4 gap-1 p-1 bg-muted/60 dark:bg-muted/40 rounded-xl border border-border/60">
                {[
                  { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
                  { value: 'lunch', label: 'Lunch', emoji: '☀️' },
                  { value: 'dinner', label: 'Dinner', emoji: '🌙' },
                  { value: 'snack', label: 'Snack', emoji: '🍎' },
                ].map((m) => {
                  const isSelected = formData.meal_type === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setFormData((d) => ({ ...d, meal_type: m.value }))}
                      className={`
                        flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-xs font-semibold transition-all touch-manipulation cursor-pointer
                        ${
                          isSelected
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground hover:bg-background/60 font-medium'
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

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-10 text-xs"
                onClick={() => {
                  setIsCreating(false);
                  setEditingMeal(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex-1 h-10 text-xs font-semibold gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{editingMeal ? 'Save Changes' : 'Save Meal'}</span>
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved meals by name, category, or notes..."
            className="pl-9 pr-9 h-10 text-sm bg-card"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { value: 'all', label: 'All Saved' },
            { value: 'breakfast', label: '🌅 Breakfast' },
            { value: 'lunch', label: '☀️ Lunch' },
            { value: 'dinner', label: '🌙 Dinner' },
            { value: 'snack', label: '🍎 Snacks' },
          ].map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setFilterType(cat.value)}
              className={`
                px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all touch-manipulation cursor-pointer border
                ${
                  filterType === cat.value
                    ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                    : 'bg-card text-muted-foreground border-border/80 hover:text-foreground hover:bg-muted/50'
                }
              `}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          Loading your saved meals...
        </div>
      ) : filteredMeals.length === 0 ? (
        <Card className="p-8 text-center space-y-3 border-dashed">
          <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground text-xl">
            🍽️
          </div>
          <div>
            <p className="font-heading font-semibold text-sm text-foreground">
              {searchQuery
                ? `No meals matching "${searchQuery}"`
                : filterType !== 'all'
                ? `No saved ${filterType} meals yet`
                : 'No saved meals yet'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Save your favorite regular meals, shakes, or snacks here so you can log them in one tap without scanning or typing macros again.
            </p>
          </div>
          {!isCreating && (
            <Button
              onClick={() => {
                resetForm();
                setIsCreating(true);
              }}
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Your First Saved Meal</span>
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredMeals.map((meal) => {
            const emoji = MEAL_EMOJIS[meal.meal_type] || '🍽️';
            return (
              <Card
                key={meal.id}
                className="p-3.5 sm:p-4 flex flex-col justify-between gap-3 hover:border-primary/40 transition-all border-border/80 bg-card group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm shrink-0">{emoji}</span>
                        <h4 className="font-heading font-bold text-sm text-foreground truncate">
                          {meal.name || meal.food_name}
                        </h4>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                        {meal.serving_size || '1 serving'} • {meal.meal_type || 'meal'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(meal)}
                        aria-label={`Edit ${meal.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      {confirmDeleteId === meal.id ? (
                        <div className="flex items-center gap-1 bg-destructive/10 border border-destructive/20 rounded-md px-1.5 py-0.5 animate-in fade-in duration-150">
                          <span className="text-[10px] text-destructive font-semibold">Delete?</span>
                          <button
                            type="button"
                            onClick={() => {
                              deleteMutation.mutate(meal.id);
                              setConfirmDeleteId(null);
                            }}
                            className="text-[10px] font-bold text-destructive hover:underline px-0.5 cursor-pointer"
                          >
                            Yes
                          </button>
                          <span className="text-[10px] text-muted-foreground/60">•</span>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-[10px] text-muted-foreground hover:text-foreground px-0.5 cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmDeleteId(meal.id)}
                          aria-label={`Delete ${meal.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary font-bold text-xs flex items-center gap-1">
                      <Flame className="w-3 h-3 text-primary" />
                      {Math.round(meal.calories || 0)} kcal
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-500 font-semibold text-xs flex items-center gap-1">
                      <Drumstick className="w-3 h-3" />
                      {meal.protein_g || 0}g P
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-semibold text-xs flex items-center gap-1">
                      <Wheat className="w-3 h-3" />
                      {meal.carbs_g || 0}g C
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-500 font-semibold text-xs flex items-center gap-1">
                      <Droplets className="w-3 h-3" />
                      {meal.fat_g || 0}g F
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                  <Button
                    onClick={() => handleQuickLog(meal, activeMealType)}
                    size="sm"
                    className="flex-1 h-8 text-xs font-semibold gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      Log to <span className="capitalize">{activeMealType}</span>
                    </span>
                  </Button>

                  {meal.meal_type && meal.meal_type !== activeMealType && (
                    <Button
                      onClick={() => handleQuickLog(meal, meal.meal_type)}
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs px-2.5 font-medium text-muted-foreground hover:text-foreground capitalize"
                    >
                      {MEAL_EMOJIS[meal.meal_type]} {meal.meal_type}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
