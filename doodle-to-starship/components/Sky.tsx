// Ambient sky behind the napkin: twinkling stars and a satellite that crosses now and then.
// Positions come from a fixed seed so server and client render the same field.

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = seeded(1957);
const STARS = Array.from({ length: 70 }, () => ({
  left: rand() * 100,
  top: rand() * 100,
  size: rand() < 0.85 ? 1 : 2,
  delay: rand() * 6,
  duration: 2.5 + rand() * 4,
  dim: 0.15 + rand() * 0.35,
}));

export default function Sky() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      {STARS.map((s, i) => (
        <span
          key={i}
          className="twinkle absolute rounded-full bg-starlight"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            opacity: s.dim,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
      <span className="satellite" />
      <span className="satellite satellite-late" />
    </div>
  );
}
