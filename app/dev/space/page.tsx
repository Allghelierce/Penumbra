"use client";

import { useEffect, useState } from "react";
import SpaceBackdrop from "@/components/SpaceBackdrop";

// Full-screen preview of the backdrop. ?layout=studio shows it behind the stage with a panel beside it.
export default function SpaceDevPage() {
  const [studio, setStudio] = useState(false);
  useEffect(() => {
    const h = window.setTimeout(() => setStudio(new URLSearchParams(window.location.search).get("layout") === "studio"), 0);
    return () => window.clearTimeout(h);
  }, []);

  if (studio) {
    return (
      <main className="flex h-screen w-screen overflow-hidden bg-black font-ui text-white">
        <section className="relative isolate h-full flex-[2]">
          <SpaceBackdrop />
        </section>
        <aside className="h-full flex-1 border-l border-white/15 bg-black p-6 text-[11px] uppercase tracking-[0.25em] text-white/50">Panel</aside>
      </main>
    );
  }
  return (
    <main className="relative isolate h-screen w-screen overflow-hidden font-ui">
      <SpaceBackdrop />
      <p className="absolute bottom-4 left-4 text-[11px] uppercase tracking-[0.25em] text-white/35">SpaceBackdrop · /dev/space</p>
    </main>
  );
}
