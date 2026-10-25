// Turns a render "isolated on pure black" into a cutout: near-black pixels become transparent,
// with a soft ramp so the edges stay clean. Runs in the browser; results are memoized by URL.

/** At or below this luminance a pixel is fully transparent. */
const CLEAR = 28;
/** At or above this it's fully opaque; in between, a linear feather. */
const SOLID = 48;
/** Larger images are scaled down first; the launch never draws them bigger than this. */
const MAX_SIDE = 1024;

const cache = new Map<string, Promise<string>>();

/**
 * Loads `url`, makes its black background transparent and resolves to a PNG data URL.
 * Rejects if the image can't load or the canvas is tainted (a cross-origin image without CORS);
 * callers should fall back to whatever they drew before.
 */
export function cutoutBlack(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit) return hit;
  const job = new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
          const a = lum <= CLEAR ? 0 : lum >= SOLID ? 255 : Math.round(((lum - CLEAR) / (SOLID - CLEAR)) * 255);
          if (a < px[i + 3]) px[i + 3] = a;
        }
        ctx.putImageData(data, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    img.onerror = () => reject(new Error(`could not load ${url.slice(0, 80)}`));
    img.src = url;
  });
  cache.set(url, job);
  job.catch(() => cache.delete(url));
  return job;
}
