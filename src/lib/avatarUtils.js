/**
 * Avatar utilities: robust logo detection, cleansing, and image compression
 */

export const isLogo = (url) => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim();
  if (!clean) return false;
  const lower = clean.toLowerCase();

  // Explicit logo filenames and paths
  if (
    lower.includes('washek-fitness-logo') ||
    lower.includes('washek_fitness_logo') ||
    lower.includes('/washek-fitness-logo.jpg') ||
    clean === '/washek-fitness-logo.jpg' ||
    clean.endsWith('/washek-fitness-logo.jpg')
  ) {
    return true;
  }

  // Text contains both washek and logo
  if (lower.includes('washek') && lower.includes('logo')) {
    return true;
  }

  // Base64 signatures of the bundled WASHEK fitness logo
  if (
    clean.includes('/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAMCAggICAg') ||
    clean.includes('2wCEAAMCAggICAgICAgHCAgHBwcHBwgI')
  ) {
    return true;
  }

  return false;
};

export const cleanseAvatarUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (isLogo(trimmed)) return null;
  return trimmed;
};

/**
 * Creates an optimized cropped square data URL (JPEG ~35-50KB)
 * Safe for localStorage, Firestore, and Supabase.
 */
export async function createCroppedAvatarDataUrl(imageSrc, { zoom = 1, panX = 0, panY = 0, outputSize = 400, quality = 0.85 } = {}) {
  if (!imageSrc) throw new Error('No image provided');

  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!imageSrc.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(imageSrc);
          return;
        }

        const imgW = img.naturalWidth || img.width || outputSize;
        const imgH = img.naturalHeight || img.height || outputSize;

        // Cover math
        const baseScale = Math.max(outputSize / imgW, outputSize / imgH);
        const currentScale = baseScale * Math.max(1, zoom);
        const drawW = imgW * currentScale;
        const drawH = imgH * currentScale;

        const centerX = (outputSize - drawW) / 2;
        const centerY = (outputSize - drawH) / 2;

        const maxPanX = Math.max(0, (drawW - outputSize) / 2);
        const maxPanY = Math.max(0, (drawH - outputSize) / 2);

        const clampedPanX = Math.max(-50, Math.min(50, panX));
        const clampedPanY = Math.max(-50, Math.min(50, panY));

        const finalX = centerX + (clampedPanX / 50) * maxPanX;
        const finalY = centerY + (clampedPanY / 50) * maxPanY;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, finalX, finalY, drawW, drawH);

        const resultDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(resultDataUrl);
      } catch (err) {
        console.warn('[avatarUtils] Canvas crop fallback:', err);
        resolve(imageSrc);
      }
    };

    img.onerror = (err) => {
      console.warn('[avatarUtils] Image load error:', err);
      reject(err);
    };

    img.src = imageSrc;
  });
}
