"use client";

// Live UTC clock for the header, the way every control room keeps one on the wall.

import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

export default function MissionClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  return (
    <span className="flex items-center gap-2 font-space text-[11px] tracking-[0.12em] text-haze" aria-label="Current UTC time">
      <span className="live-dot h-1.5 w-1.5 rounded-full bg-go-signal" aria-hidden />
      <span className="tabular-nums text-starlight/90">
        {now ? `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}` : "--:--:--"}
      </span>
      UTC
    </span>
  );
}
