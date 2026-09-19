/**
 * Client-side image downscaling.
 *
 * Modern phone and mirrorless cameras routinely produce 24-48MP JPEGs.
 * Uploaded as-is, a single photo can balloon into a many-megabyte base64
 * string that gets embedded directly in the AI grading request — slow to
 * encode, slow to upload, and large enough to occasionally exceed a
 * provider's request size limit outright. AI vision models don't benefit
 * from resolution far beyond ~2000px on the long edge anyway, so we
 * downscale before the image ever leaves the browser.
 */

const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.88;

/**
 * Given an image data URL, returns a data URL scaled down so its longest
 * edge is at most maxDimension pixels (default 2048), re-encoded as JPEG.
 * If the image is already within bounds, it's returned unchanged so we
 * never needlessly re-compress a smaller/already-optimized photo.
 */
export function downscaleImageDataUrl(
  dataUrl: string,
  maxDimension: number = MAX_DIMENSION,
  quality: number = JPEG_QUALITY
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;

      if (width <= maxDimension && height <= maxDimension) {
        resolve(dataUrl);
        return;
      }

      const scale = maxDimension / Math.max(width, height);
      const targetWidth = Math.round(width * scale);
      const targetHeight = Math.round(height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Canvas unsupported for some reason — fall back to the original rather than failing the upload.
        resolve(dataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Could not read this image file. It may be corrupted or in an unsupported format.'));
    img.src = dataUrl;
  });
}
