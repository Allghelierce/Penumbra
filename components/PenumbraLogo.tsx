// The Penumbra logo: an ascent trace lifts off the P, bends over through max-Q and MECO, and settles into orbit.

const MICHROMA = "var(--font-michroma), sans-serif";
const PLEX_MONO = "var(--font-plex-mono), monospace";

/** The icon: a horizon, the ascent arc and the spacecraft in orbit. The horizon takes the text colour. */
export function AscentMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d="M10 86 L90 86" stroke="currentColor" strokeWidth={9} strokeLinecap="round" />
      <path d="M22 86 C24 50 48 26 80 22" fill="none" stroke="var(--flame)" strokeWidth={10} strokeLinecap="round" />
      <circle cx={84} cy={20} r={11} fill="var(--flame)" />
    </svg>
  );
}

/** Icon and name on one line, for headers and nav bars. */
export function PenumbraLockup({ className = "", size = 15 }: { className?: string; size?: number }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <AscentMark className="h-6 w-6 shrink-0" />
      <span style={{ fontFamily: MICHROMA, fontSize: size, letterSpacing: "0.3em" }} className="uppercase leading-none">
        Penumbra
      </span>
    </span>
  );
}

/**
 * The full wordmark with the ascent trace over the letters. Use it at 260px wide or more so the event labels stay readable.
 * `ground` fills the hollow event ticks, so set it to the background colour behind the logo.
 */
export function PenumbraWordmark({
  className,
  events = true,
  ground = "var(--umbra)",
}: {
  className?: string;
  events?: boolean;
  ground?: string;
}) {
  const label = { fontFamily: PLEX_MONO, fontSize: 11, fontWeight: 500, letterSpacing: 1.5 };
  return (
    <svg viewBox="0 0 540 190" className={className} role="img" aria-label="Penumbra">
      <path d="M34 140 C58 60 220 30 500 30" fill="none" stroke="var(--flame)" strokeWidth={2.5} strokeLinecap="round" />
      {events && (
        <g fill={ground} stroke="var(--flame)" strokeWidth={1.5}>
          <circle cx={66} cy={98} r={3.5} />
          <circle cx={171} cy={55} r={3.5} />
          <circle cx={346} cy={34} r={3.5} />
        </g>
      )}
      <circle cx={500} cy={30} r={11} fill="none" stroke="var(--flame)" strokeWidth={1.5} opacity={0.4} />
      <circle cx={500} cy={30} r={5} fill="var(--flame)" />
      {events && (
        <g fill="var(--haze)" style={label}>
          <text x={80} y={112}>MAX-Q</text>
          <text x={171} y={42} textAnchor="middle">
            MECO
          </text>
          <text x={346} y={20} textAnchor="middle">
            ORBIT
          </text>
        </g>
      )}
      <text x={30} y={170} fill="currentColor" fontSize={40} letterSpacing={10} style={{ fontFamily: MICHROMA }}>
        PENUMBRA
      </text>
    </svg>
  );
}
