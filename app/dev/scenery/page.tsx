"use client";

import { useEffect, useRef, useState } from "react";
import {
  clamp01,
  drawAurora,
  drawBoundaries,
  drawDeck,
  drawEarth,
  drawGround,
  drawHorizonGlow,
  drawOzone,
  drawSky,
  drawStars,
  earthTopY,
  makeCityLights,
  makeDecks,
  makeStars,
  readPalette,
  seeded,
  type LaunchSite,
} from "@/components/launch/scenery";

const SITES: LaunchSite[] = ["cape", "mahia", "starbase"];
const STOPS = [0, 0.8, 4, 10, 22, 33, 40, 57, 70, 82, 90, 110, 160, 220, 330, 550];

/**
 * Dev bench for the launch background in components/launch/scenery.ts: the sky, layers,
 * landmarks, Earth and launch site at any altitude, without flying a launch.
 * ?alt=<km>&site=cape|mahia|starbase picks the view.
 */
export default function SceneryDevPage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [alt, setAlt] = useState(0);
  const [site, setSite] = useState<LaunchSite>("cape");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const a = Number(params.get("alt"));
    const s = params.get("site") as LaunchSite | null;
    const h = window.setTimeout(() => {
      if (Number.isFinite(a)) setAlt(a);
      if (s && SITES.includes(s)) setSite(s);
    }, 0);
    return () => window.clearTimeout(h);
  }, []);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const pal = readPalette();
    const stars = makeStars(seeded(5));
    const decks = makeDecks(seeded(41));
    const lights = makeCityLights(seeded(73));
    const font = getComputedStyle(document.documentElement).getPropertyValue("--font-barlow-condensed").trim() || "sans-serif";
    const horizon = Array.from({ length: 48 }, (_, i) => Math.sin(i * 2.7) * 1.5);
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = now / 1000;
      const W = (el.width = el.clientWidth);
      const H = (el.height = el.clientHeight);
      const center = H * 0.47;
      // The ground slides away below the screen as the camera climbs.
      const groundY = H * 0.82 + alt * H * 2;
      ctx.clearRect(0, 0, W, H);
      drawSky(ctx, W, H, pal, alt, 1);
      drawStars(ctx, stars, W, H, 0, alt * 26, 0.08 + 0.92 * clamp01((alt - 8) / 45), t);
      drawOzone(ctx, W, H, alt, center);
      drawAurora(ctx, W, H, clamp01((alt - 85) / 25), t, earthTopY(H, alt, 0) - 6, alt);
      drawBoundaries(ctx, W, H, alt, center, font, pal.chalk, 1);
      drawEarth(ctx, W, H, alt, 0, 0, lights, t);
      for (const d of decks) drawDeck(ctx, W, H, d, alt, 0, center, t, 1);
      drawHorizonGlow(ctx, W, H, Math.min(groundY, H * 1.02), 1 - clamp01(alt / 12), 1 - clamp01(alt / 15));
      drawGround(ctx, W, H, groundY, 1, horizon, pal.chalk, site);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [alt, site]);

  return (
    <main className="fixed inset-0 bg-night">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-white/80">
        {SITES.map((s) => (
          <button key={s} onClick={() => setSite(s)} className={`rounded px-2 py-1 ${s === site ? "bg-white text-black" : "bg-white/10"}`}>
            {s}
          </button>
        ))}
        <input type="range" min={0} max={600} step={0.1} value={alt} onChange={(e) => setAlt(Number(e.target.value))} className="w-64" />
        <span>{alt.toFixed(1)} km</span>
        {STOPS.map((k) => (
          <button key={k} onClick={() => setAlt(k)} className="rounded bg-white/10 px-1.5 py-1">
            {k}
          </button>
        ))}
      </div>
    </main>
  );
}
