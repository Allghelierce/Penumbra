// Turns a render "isolated on pure black" into a cutout. Only black connected to the image
// border is keyed out (a flood fill), so dark paint inside the vehicle stays solid, and the
// edge is feathered over a thin ring. Images that already have transparency pass through as-is.
// Runs in the browser; results are memoized by URL.

/** Background: at or below this luminance, flood-filled in from the border and cleared. */
const CLEAR = 18;
/** Pixels next to the background ramp from clear (CLEAR) to opaque (SOLID). */
const SOLID = 40;
/** Larger images are scaled down first; the launch never draws them bigger than this. */
const MAX_SIDE = 1024;

const cache = new Map<string, Promise<string>>();

/**
 * Loads `url`, makes its border-connected black background transparent and resolves to a PNG
 * data URL (or to `url` itself if the image is already transparent). Rejects if the image can't
 * load or the canvas is tainted (a cross-origin image without CORS); callers should fall back.
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
        const n = w * h;

        // Already cut out (e.g. the pinned demo PNGs): use it untouched.
        let see = 0;
        for (let i = 3; i < px.length; i += 28) if (px[i] < 250) see++;
        if (see > (n / 7) * 0.005) {
          resolve(url);
          return;
        }

        const luma = new Uint8Array(n);
        for (let p = 0, i = 0; p < n; p++, i += 4) luma[p] = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) | 0;

        // Flood the background in from the border through near-black pixels.
        const bg = new Uint8Array(n);
        const queue = new Int32Array(n);
        let head = 0;
        let tail = 0;
        const seed = (p: number) => {
          if (!bg[p] && luma[p] <= CLEAR) {
            bg[p] = 1;
            queue[tail++] = p;
          }
        };
        for (let x = 0; x < w; x++) {
          seed(x);
          seed((h - 1) * w + x);
        }
        for (let y = 0; y < h; y++) {
          seed(y * w);
          seed(y * w + w - 1);
        }
        while (head < tail) {
          const p = queue[head++];
          const x = p % w;
          if (x > 0) seed(p - 1);
          if (x < w - 1) seed(p + 1);
          if (p >= w) seed(p - w);
          if (p < n - w) seed(p + w);
        }

        // Clear the background; feather the dark ring (up to 2 px) that touches it.
        const near = (p: number, mark: Uint8Array) => {
          const x = p % w;
          return (x > 0 && mark[p - 1] === 1) || (x < w - 1 && mark[p + 1] === 1) || (p >= w && mark[p - w] === 1) || (p < n - w && mark[p + w] === 1);
        };
        const ring = new Uint8Array(n);
        for (let p = 0; p < n; p++) if (!bg[p] && luma[p] < SOLID && near(p, bg)) ring[p] = 1;
        const ring2 = new Uint8Array(n);
        for (let p = 0; p < n; p++) if (!bg[p] && !ring[p] && luma[p] < SOLID && near(p, ring)) ring2[p] = 1;
        for (let p = 0; p < n; p++) {
          const i = p * 4 + 3;
          if (bg[p]) {
            px[i] = 0;
          } else if (ring[p] || ring2[p]) {
            const a = Math.round(((luma[p] - CLEAR) / (SOLID - CLEAR)) * 255);
            if (a < px[i]) px[i] = Math.max(0, a);
          }
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
