// A detailed technical drawing of a two-stage rocket for the empty studio. Its callouts
// explain what Penumbra reads from a sketch, so it doubles as the how-it-works guide.

const W = 440;
const H = 640;

interface Callout {
  title: string;
  body: string;
  /** Where the leader line touches the rocket. */
  anchor: [number, number];
  /** Vertical position of the label, in drawing units. */
  y: number;
}

const CALLOUTS: Callout[] = [
  { title: "Payload", body: "What it carries. Say “payload 20 tons” to change it.", anchor: [131, 92], y: 52 },
  { title: "Upper-stage tanks", body: "Tank size sets how much propellant each stage holds.", anchor: [150, 182], y: 148 },
  { title: "Stage break", body: "A line across the body splits the rocket into stages.", anchor: [150, 288], y: 248 },
  { title: "Booster tanks", body: "Bigger tanks mean more delta-v, and more weight to lift.", anchor: [150, 402], y: 350 },
  { title: "Legs, fins, heat shield", body: "Noted when spotted. A heat shield matters for a Mars landing.", anchor: [161, 548], y: 452 },
  { title: "Engines", body: "Count the bells. Thrust and Isp come from real engine data.", anchor: [143, 602], y: 556 },
];

const LABEL_X = 204;

/** One engine bell centred on cx. */
const bell = (cx: number) => `M${cx - 4} 575 Q${cx - 5} 593 ${cx - 8} 611 H${cx + 8} Q${cx + 5} 593 ${cx + 4} 575`;

export default function SpecimenDrawing() {
  const line = { pathLength: 1 } as const;
  return (
    <figure className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="draft-in absolute inset-0 h-full w-full" fill="none" aria-hidden>
        {/* Centre line */}
        <g className="dashed" stroke="var(--rule)" strokeWidth="1" strokeDasharray="10 3 2 3">
          <path d="M120 10 V630" />
        </g>

        <g stroke="var(--starlight)" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
          {/* Fairing */}
          <path {...line} d="M120 20 C138 40 150 80 150 120 H90 C90 80 102 40 120 20 Z" />
          {/* Upper stage */}
          <path {...line} d="M90 120 V270 H150 V120" />
          {/* Interstage */}
          <path {...line} d="M90 270 V305 H150 V270" />
          {/* Booster */}
          <path {...line} d="M90 305 V560 M150 305 V560" />
          {/* Engine section */}
          <path {...line} d="M90 560 L94 575 H146 L150 560 Z" />
          {[104, 120, 136].map((cx) => (
            <path key={cx} {...line} d={bell(cx)} />
          ))}
          {/* Grid fins */}
          <rect {...line} x="72" y="312" width="16" height="16" />
          <rect {...line} x="152" y="312" width="16" height="16" />
          {/* Landing legs, folded */}
          <path {...line} d="M90 498 L77 570 H90" />
          <path {...line} d="M150 498 L163 570 H150" />
        </g>

        <g stroke="var(--starlight)" strokeWidth="0.8" opacity="0.7">
          {/* Grid fin lattice */}
          <path {...line} d="M72 312 L88 328 M88 312 L72 328 M80 312 V328 M72 320 H88" />
          <path {...line} d="M152 312 L168 328 M168 312 L152 328 M160 312 V328 M152 320 H168" />
          {/* Interstage hatching */}
          <path {...line} d="M92 286 L106 272 M92 300 L120 272 M134 300 L148 286 M146 304 L148 302" />
          {/* Fairing split */}
          <path {...line} d="M120 22 V120" />
        </g>

        {/* Hidden lines: payload, tank domes, vacuum engine, downcomer */}
        <g className="dashed" stroke="var(--haze)" strokeWidth="1" strokeDasharray="4 3">
          <rect x="104" y="74" width="32" height="34" rx="2" />
          <path d="M104 86 H136 M112 108 V116 M128 108 V116" />
          <path d="M92 140 Q120 124 148 140 M92 205 Q120 189 148 205 M92 258 Q120 274 148 258" />
          <path d="M111 272 Q107 289 103 303 M129 272 Q133 289 137 303" />
          <path d="M92 322 Q120 306 148 322 M92 442 Q120 426 148 442 M92 548 Q120 564 148 548" />
          <path d="M140 446 V546" />
        </g>

        {/* Stage brackets */}
        <g stroke="var(--haze)" strokeWidth="1">
          <path {...line} d="M64 122 H56 V303 H64" />
          <path {...line} d="M64 307 H56 V611 H64" />
        </g>
        <g fill="var(--haze)" fontSize="12" fontFamily="var(--font-barlow)" letterSpacing="0.02em">
          <text x="44" y="212" textAnchor="middle" transform="rotate(-90 44 212)">
            Stage 2
          </text>
          <text x="44" y="459" textAnchor="middle" transform="rotate(-90 44 459)">
            Stage 1
          </text>
        </g>

        {/* Leader lines */}
        <g className="callout" stroke="var(--haze)" strokeWidth="0.9">
          {CALLOUTS.map((c) => (
            <g key={c.title}>
              <polyline pathLength={1} points={`${c.anchor[0]},${c.anchor[1]} ${LABEL_X - 14},${c.y} ${LABEL_X - 4},${c.y}`} />
              <circle cx={c.anchor[0]} cy={c.anchor[1]} r="2.2" fill="var(--starlight)" stroke="none" />
            </g>
          ))}
        </g>
      </svg>

      {CALLOUTS.map((c) => (
        <figcaption
          key={c.title}
          className="callout absolute pr-2"
          style={{ left: `${(LABEL_X / W) * 100}%`, top: `${(c.y / H) * 100}%`, transform: "translateY(-0.6rem)" }}
        >
          <p className="font-display text-[17px] font-semibold leading-5 text-starlight">{c.title}</p>
          <p className="mt-0.5 text-[13px] leading-[1.35] text-haze">{c.body}</p>
        </figcaption>
      ))}
    </figure>
  );
}
