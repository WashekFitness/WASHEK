import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Calendar,
  Tag,
  Plus,
  Weight,
  Sparkles,
  Check,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { displayWeight, weightUnit } from '@/lib/AppSettingsContext';

// Popular fitness tags for progress photos
const PRESET_TAGS = [
  'Front',
  'Side',
  'Back',
  'Back Double Bicep',
  'Legs',
  'Abs',
  'Fasted',
  'Post-Workout',
  'Cutting',
  'Bulking',
  'Maintenance',
  'Day 1',
  'Milestone',
];

// Quick label suggestions
const PRESET_LABELS = [
  'Day 1 Baseline',
  'Week 4 Check-in',
  'Week 8 Check-in',
  'Week 12 Check-in',
  'Morning Fasted Check-in',
  'Post-Workout Pump',
  'End of Cut Check-in',
  'Bulking Progress',
];

export default function PhotoTagModal({
  isOpen,
  onClose,
  photo = null,
  previewUrl = null,
  onSave,
  onDelete = null,
  isSaving = false,
  unit = 'imperial',
}) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [label, setLabel] = useState('');
  const [tags, setTags] = useState([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [weight, setWeight] = useState('');

  // Pull-down drag state for mobile and mouse gestures
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const dragStartYRef = useRef(0);
  const dragYRef = useRef(0);
  const isDraggingRef = useRef(false);

  // Sync state when modal opens or photo changes
  useEffect(() => {
    if (isOpen) {
      setDragY(0);
      dragYRef.current = 0;
      setIsDragging(false);
      setIsClosing(false);
      if (photo) {
        // Editing existing photo
        const photoDate =
          photo.date ||
          (photo.created_at ? String(photo.created_at).slice(0, 10) : today);
        setDate(photoDate);
        setLabel(photo.label || photo.custom_label || '');

        let initialTags = [];
        if (Array.isArray(photo.tags)) {
          initialTags = [...photo.tags];
        } else if (typeof photo.tag === 'string' && photo.tag.trim()) {
          initialTags = [photo.tag.trim()];
        }
        setTags(initialTags);

        const rawWeight = photo.weight_lbs ?? photo.weight;
        if (rawWeight !== undefined && rawWeight !== null && rawWeight !== '') {
          const num = Number(rawWeight);
          if (Number.isFinite(num) && num > 0) {
            const displayVal =
              unit === 'metric'
                ? (num * 0.453592).toFixed(1)
                : num.toFixed(1);
            setWeight(displayVal);
          } else {
            setWeight('');
          }
        } else {
          setWeight('');
        }
      } else {
        // New upload
        setDate(today);
        setLabel('');
        setTags(['Front']); // sensible default
        setWeight('');
      }
      setCustomTagInput('');
    }
  }, [isOpen, photo, unit, today]);

  if (!isOpen) return null;

  const handleDragStart = (clientY) => {
    dragStartYRef.current = clientY;
    dragYRef.current = 0;
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handleDragMove = (clientY, e) => {
    if (!isDraggingRef.current) return;
    const delta = clientY - dragStartYRef.current;
    const val = delta > 0 ? delta : 0;
    dragYRef.current = val;
    setDragY(val);
    if (e?.cancelable) e.preventDefault();
  };

  const handleDragEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    if (dragYRef.current > 35) {
      // Pull down dismiss threshold reached
      triggerPullDownClose();
    } else {
      // Snap back
      dragYRef.current = 0;
      setDragY(0);
    }
  };

  const triggerPullDownClose = () => {
    setIsClosing(true);
    setDragY(window.innerHeight || 600);
    setTimeout(() => {
      onClose();
    }, 180);
  };

  const handleTogglePresetTag = (preset) => {
    setTags((prev) => {
      const exists = prev.some((t) => t.toLowerCase() === preset.toLowerCase());
      if (exists) {
        return prev.filter((t) => t.toLowerCase() !== preset.toLowerCase());
      }
      return [...prev, preset];
    });
  };

  const handleAddCustomTag = (e) => {
    e?.preventDefault();
    const clean = customTagInput.trim().replace(/^#+/, '');
    if (!clean) return;

    if (!tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setTags((prev) => [...prev, clean]);
    }
    setCustomTagInput('');
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();

    const cleanWeight = String(weight ?? '').replace(',', '.').trim();
    const weightNum = parseFloat(cleanWeight);
    let weightLbs = null;
    if (Number.isFinite(weightNum) && weightNum > 0) {
      const converted = unit === 'metric' ? weightNum / 0.453592 : weightNum;
      weightLbs = Math.round(converted * 10) / 10;
    }

    await onSave({
      date: date || today,
      label: label.trim(),
      custom_label: label.trim(),
      tags: tags.filter(Boolean),
      weight_lbs: weightLbs,
    });
  };

  const displayImgUrl = previewUrl || photo?.resolved_photo_url || photo?.photo_url;

  return (
    <div
      className="fixed inset-0 z-[1050] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 pb-1 sm:pb-0 animate-in fade-in-50"
      onClick={onClose}
      style={{
        opacity: dragY > 0 ? Math.max(0.15, 1 - dragY / 350) : 1,
        transition: isDragging ? 'none' : 'opacity 0.2s ease-out',
      }}
    >
      <div
        className="w-full sm:max-w-lg bg-card border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col text-card-foreground h-[86dvh] max-h-[86dvh] sm:h-auto sm:max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
          opacity: isClosing ? 0 : 1,
        }}
      >
        {/* Mobile & Desktop Pull-Down Handle Indicator (Draggable & Clickable) */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Pull down or tap to close"
          className="w-full pt-3 pb-2 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none shrink-0 group hover:bg-muted/40 transition-colors"
          onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientY, e)}
          onTouchEnd={handleDragEnd}
          onTouchCancel={handleDragEnd}
          onMouseDown={(e) => {
            handleDragStart(e.clientY);
            const onMouseMove = (ev) => handleDragMove(ev.clientY, ev);
            const onMouseUp = () => {
              handleDragEnd();
              window.removeEventListener('mousemove', onMouseMove);
              window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
          }}
          onClick={() => {
            triggerPullDownClose();
          }}
        >
          <div className="w-16 h-1.5 bg-muted-foreground/50 group-hover:bg-muted-foreground/80 group-active:bg-primary rounded-full transition-all duration-150" />
          <span className="text-[11px] text-muted-foreground/70 group-hover:text-muted-foreground mt-1 select-none font-medium">
            pull down or tap to close
          </span>
        </div>

        {/* Pinned Header with Title, PROMINENT DIRECT SAVE BUTTON & Close Button */}
        <div
          className="shrink-0 flex items-center justify-between px-4 py-2.5 sm:px-5 sm:py-3 border-b border-border bg-card select-none z-10"
          onTouchStart={(e) => {
            if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
              handleDragStart(e.touches[0].clientY);
            }
          }}
          onTouchMove={(e) => {
            if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
              handleDragMove(e.touches[0].clientY, e);
            }
          }}
          onTouchEnd={handleDragEnd}
        >
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <Tag className="w-4 h-4 text-primary shrink-0" />
            <h2 className="font-heading font-bold text-sm sm:text-base truncate">
              {photo ? 'Edit Photo Details' : 'Tag & Save Photo'}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Direct Header Save Button - Highly visible and prominent */}
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={isSaving}
              className="h-9 px-4 text-xs sm:text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/25 flex items-center gap-1.5 rounded-xl shrink-0 cursor-pointer transition-all active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Saving…' : 'Save'}</span>
            </Button>

            <button
              type="button"
              aria-label="Close"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
              onClick={onClose}
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4 min-h-0">
          {/* Photo Thumbnail Preview */}
          {displayImgUrl && (
            <div className="flex items-center gap-3 bg-muted/40 p-2.5 rounded-xl border border-border/50">
              <img
                src={displayImgUrl}
                alt="Preview"
                className="w-14 h-14 object-cover rounded-lg border border-border shadow-sm shrink-0 bg-black"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate">
                  {label || 'Progress check-in'}
                </p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3 h-3 text-primary" />
                  <span>{date || today}</span>
                </p>
                {tags.length > 0 && (
                  <p className="text-[10px] text-primary mt-0.5 truncate font-medium">
                    {tags.map((t) => `#${t}`).join(' ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Date Tag / Date Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span>Date Tag</span>
            </label>
            <div className="flex gap-2 items-center">
              <Input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 text-xs flex-1 bg-background"
              />
              <button
                type="button"
                onClick={() => setDate(today)}
                className={cn(
                  'px-2.5 py-1.5 text-[11px] rounded-lg border font-medium transition-colors shrink-0',
                  date === today
                    ? 'bg-primary/10 border-primary text-primary font-semibold'
                    : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                )}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDate(yesterday)}
                className={cn(
                  'px-2.5 py-1.5 text-[11px] rounded-lg border font-medium transition-colors shrink-0',
                  date === yesterday
                    ? 'bg-primary/10 border-primary text-primary font-semibold'
                    : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                )}
              >
                Yesterday
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Select the exact date this progress photo was taken.
            </p>
          </div>

          {/* Custom Label */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-primary" />
              <span>Custom Label / Title (Optional)</span>
            </label>
            <Input
              type="text"
              placeholder="e.g. Day 1 Baseline, Week 8 Check-in..."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-9 text-xs bg-background"
              maxLength={80}
            />

            {/* Quick label chips */}
            <div className="flex flex-wrap gap-1 pt-1">
              {PRESET_LABELS.slice(0, 4).map((pLabel) => (
                <button
                  key={pLabel}
                  type="button"
                  onClick={() => setLabel(pLabel)}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border/50 transition-colors"
                >
                  {pLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Tags / Categories</span>
              </label>
              <span className="text-[10px] text-muted-foreground">
                {tags.length} selected
              </span>
            </div>

            {/* Selected Tags list */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-muted/40 border border-border/50 min-h-[36px] items-center">
                {tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="text-xs py-0.5 px-2 bg-primary/15 text-primary border border-primary/20 flex items-center gap-1"
                  >
                    <span>#{t}</span>
                    <button
                      type="button"
                      aria-label={`Remove tag ${t}`}
                      onClick={() => handleRemoveTag(t)}
                      className="hover:text-destructive p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Popular preset tags */}
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Popular tags:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TAGS.map((preset) => {
                const isSelected = tags.some(
                  (t) => t.toLowerCase() === preset.toLowerCase()
                );
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleTogglePresetTag(preset)}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-full border transition-all flex items-center gap-1',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm font-semibold'
                        : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground border-border'
                    )}
                  >
                    {isSelected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 opacity-60" />}
                    <span>{preset}</span>
                  </button>
                );
              })}
            </div>

            {/* Add Custom Tag Input */}
            <div className="flex gap-2 pt-1">
              <Input
                type="text"
                placeholder="Type custom tag (e.g. Vacation, 75 Hard, Glutes)..."
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomTag();
                  }
                }}
                className="h-8 text-xs flex-1 bg-background"
                maxLength={30}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs px-3"
                onClick={handleAddCustomTag}
                disabled={!customTagInput.trim()}
              >
                + Add
              </Button>
            </div>
          </div>

          {/* Optional Weight */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Weight className="w-3.5 h-3.5 text-primary" />
              <span>Weight ({weightUnit(unit)}) — Optional</span>
            </label>
            <Input
              type="number"
              inputMode="decimal"
              placeholder={`e.g. 175.5`}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-9 text-xs bg-background"
            />
          </div>
        </div>

        {/* Pinned Sticky Bottom Action Bar - Never cut off on mobile phones */}
        <div className="shrink-0 px-4 py-3 sm:px-5 sm:py-3.5 bg-card border-t border-border flex items-center justify-between gap-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-3.5 z-20">
          {photo && onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDelete(photo)}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs px-2.5 h-10 gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden xs:inline">Delete</span>
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2 flex-1 justify-end max-w-xs">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSaving}
              className="h-10 text-xs px-3.5 rounded-xl border-border cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="h-10 flex-1 px-4 text-xs sm:text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 flex items-center justify-center gap-1.5 rounded-xl cursor-pointer transition-all active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Saving…' : photo ? 'Save Changes' : 'Save Photo'}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
