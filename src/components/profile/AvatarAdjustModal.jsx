import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { X, ZoomIn, ZoomOut, Move, RotateCcw, Check, Camera, Image as ImageIcon } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';
import { createCroppedAvatarDataUrl } from '@/lib/avatarUtils';
import { toast } from 'sonner';

export default function AvatarAdjustModal({
  isOpen,
  onClose,
  imageSrc,
  onSave,
  onSelectNewImage,
}) {
  const [currentSrc, setCurrentSrc] = useState(imageSrc);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0); // -50 to +50
  const [panY, setPanY] = useState(0); // -50 to +50
  const [saving, setSaving] = useState(false);
  const [imgNatural, setImgNatural] = useState({ width: 512, height: 512 });

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialPanX: 0, initialPanY: 0 });
  const previewRef = useRef(null);
  const internalFileInputRef = useRef(null);

  // Sync internal image src when prop updates
  useEffect(() => {
    if (imageSrc) {
      setCurrentSrc(imageSrc);
    }
  }, [imageSrc]);

  // Reset state when opening with a new image
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPanX(0);
      setPanY(0);
      setSaving(false);

      if (currentSrc) {
        const testImg = new Image();
        testImg.onload = () => {
          setImgNatural({
            width: testImg.naturalWidth || testImg.width || 512,
            height: testImg.naturalHeight || testImg.height || 512,
          });
        };
        testImg.src = currentSrc;
      }
    }
  }, [isOpen, currentSrc]);

  if (!isOpen || !currentSrc || typeof document === 'undefined') {
    return null;
  }

  // Pointer drag handling for direct touch/mouse pan on preview
  const handlePointerDown = (e) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialPanX: panX,
      initialPanY: panY,
    };
    if (e.target.setPointerCapture) {
      try {
        e.target.setPointerCapture(e.pointerId);
      } catch (_err) {
        // Pointer capture not supported or expired
      }
    }
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    // Convert pixel delta in a 200px box into -50 to +50 pan space
    const sensitivity = 0.55;
    const nextPanX = Math.max(-50, Math.min(50, dragStartRef.current.initialPanX + deltaX * sensitivity));
    const nextPanY = Math.max(-50, Math.min(50, dragStartRef.current.initialPanY + deltaY * sensitivity));

    setPanX(Math.round(nextPanX));
    setPanY(Math.round(nextPanY));
  };

  const handlePointerUp = (e) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      triggerHaptic('light');
    }
    if (e.target.releasePointerCapture) {
      try {
        e.target.releasePointerCapture(e.pointerId);
      } catch (_err) {
        // Pointer capture already released
      }
    }
  };

  const handlePreset = (type) => {
    triggerHaptic('selection');
    if (type === 'center') {
      setPanX(0);
      setPanY(0);
    } else if (type === 'top') {
      setPanX(0);
      setPanY(30); // shift top into frame
    } else if (type === 'reset') {
      setZoom(1);
      setPanX(0);
      setPanY(0);
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast.error('Image is too large. Please select an image under 15MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        setCurrentSrc(dataUrl);
        setZoom(1);
        setPanX(0);
        setPanY(0);
        if (onSelectNewImage) {
          onSelectNewImage(dataUrl);
        }
        triggerHaptic('success');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveCrop = async () => {
    if (saving) return;
    setSaving(true);
    triggerHaptic('heavy');

    try {
      // Create lightweight, high-performance compressed square avatar (~35-50KB)
      const croppedDataUrl = await createCroppedAvatarDataUrl(currentSrc, {
        zoom,
        panX,
        panY,
        outputSize: 400,
        quality: 0.85,
      });

      onSave(croppedDataUrl);
      onClose();
    } catch (err) {
      console.error('[AvatarAdjustModal] Crop failed:', err);
      // Fallback
      onSave(currentSrc);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Preview styling calculations
  const PREVIEW_BOX = 200;
  const baseScale = Math.max(PREVIEW_BOX / (imgNatural.width || 512), PREVIEW_BOX / (imgNatural.height || 512));
  const scale = baseScale * zoom;
  const drawW = (imgNatural.width || 512) * scale;
  const drawH = (imgNatural.height || 512) * scale;
  const centerX = (PREVIEW_BOX - drawW) / 2;
  const centerY = (PREVIEW_BOX - drawH) / 2;
  const maxPanX = Math.max(0, (drawW - PREVIEW_BOX) / 2);
  const maxPanY = Math.max(0, (drawH - PREVIEW_BOX) / 2);
  const previewX = centerX + (panX / 50) * maxPanX;
  const previewY = centerY + (panY / 50) * maxPanY;

  return createPortal(
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Adjust Profile Picture"
    >
      <input
        type="file"
        ref={internalFileInputRef}
        onChange={handleFileInputChange}
        accept="image/*"
        className="hidden"
        id="modal-replace-file-input"
      />

      <div className="relative w-full max-w-sm rounded-3xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Sticky Pinned Header */}
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center shadow-xs">
              <Move className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-sm sm:text-base text-foreground leading-tight">
                Adjust Picture
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Drag or zoom to frame picture
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Header Save Button */}
            <Button
              type="button"
              size="sm"
              onClick={handleSaveCrop}
              disabled={saving}
              className="h-8 px-3 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 shadow-sm shadow-primary/25 cursor-pointer"
              title="Save adjusted picture"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving…' : 'Save'}</span>
            </Button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-xl bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              disabled={saving}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
          {/* Live Preview Area */}
          <div className="flex flex-col items-center">
            <div className="relative">
              {/* Visual crop framing box (squircle matching profile avatar) */}
              <div
                ref={previewRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{ touchAction: 'none' }}
                className="w-[200px] h-[200px] rounded-[28px] overflow-hidden bg-black/85 relative shadow-xl border-2 border-primary/50 cursor-grab active:cursor-grabbing select-none group"
              >
                <img
                  src={currentSrc}
                  alt="Framing preview"
                  draggable={false}
                  style={{
                    position: 'absolute',
                    width: `${drawW}px`,
                    height: `${drawH}px`,
                    left: `${previewX}px`,
                    top: `${previewY}px`,
                    maxWidth: 'none',
                    maxHeight: 'none',
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                />

                {/* Framing target overlay guides */}
                <div className="absolute inset-0 pointer-events-none rounded-[26px] border border-white/20 shadow-[inset_0_0_24px_rgba(0,0,0,0.55)]" />
                <div className="absolute inset-2 pointer-events-none rounded-full border border-dashed border-white/30" />

                {/* Drag indicator pill on hover/idle */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-xs text-[10px] font-medium text-white/90 px-2.5 py-0.5 rounded-full pointer-events-none flex items-center gap-1 shadow-sm">
                  <Move className="w-2.5 h-2.5" />
                  <span>Drag to reposition</span>
                </div>
              </div>
            </div>

            {/* Quick framing presets & Replace image button */}
            <div className="flex items-center gap-1.5 mt-3 flex-wrap justify-center">
              <button
                type="button"
                onClick={() => handlePreset('center')}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-muted/70 hover:bg-muted text-foreground transition-all cursor-pointer"
              >
                Center
              </button>
              <button
                type="button"
                onClick={() => handlePreset('top')}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-muted/70 hover:bg-muted text-foreground transition-all cursor-pointer"
              >
                Focus Top
              </button>
              <button
                type="button"
                onClick={() => handlePreset('reset')}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-muted/40 hover:bg-muted text-muted-foreground transition-all flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Reset
              </button>
              <button
                type="button"
                onClick={() => internalFileInputRef.current?.click()}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-all flex items-center gap-1 cursor-pointer"
                title="Select a different image from device"
              >
                <Camera className="w-2.5 h-2.5" />
                Change Image
              </button>
            </div>
          </div>

          {/* Sliders Controls */}
          <div className="space-y-3 pt-2 border-t border-border">
            {/* Zoom Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
                  <ZoomIn className="w-3.5 h-3.5 text-primary" />
                  Zoom Level
                </span>
                <span className="font-mono text-xs text-foreground font-semibold">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ZoomOut className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => {
                    setZoom(parseFloat(e.target.value));
                  }}
                  className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <ZoomIn className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </div>
            </div>

            {/* Vertical Pan (Up / Down) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">
                  Vertical Framing (Up / Down)
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {panY > 0 ? `+${panY}` : panY}
                </span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                step="1"
                value={panY}
                onChange={(e) => setPanY(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            {/* Horizontal Pan (Left / Right) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">
                  Horizontal Framing (Left / Right)
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {panX > 0 ? `+${panX}` : panX}
                </span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                step="1"
                value={panX}
                onChange={(e) => setPanX(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>
        </div>

        {/* Sticky Pinned Footer Actions */}
        <div className="shrink-0 p-4 border-t border-border bg-card/95 backdrop-blur-sm flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-11 rounded-xl text-xs font-semibold cursor-pointer"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleSaveCrop}
            disabled={saving}
            className="flex-1 h-11 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-1.5 shadow-md shadow-primary/25 cursor-pointer"
          >
            {saving ? (
              <span>Saving Picture…</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Save Picture</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
