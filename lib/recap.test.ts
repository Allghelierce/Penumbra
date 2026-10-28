import { describe, expect, it } from "vitest";

import { applyAction } from "./actions";
import type { Attempt, Design, Improvement } from "./design";
import { analyze } from "./physics";
import { flightOutcome, recap } from "./recap";
import { templateById } from "./templates";
import { maxPayloadKg } from "./trade";

function falconLike(overrides: Partial<Design> = {}): Design {
  return {
    name: "Napkin Falcon",
    stages: [
      { label: "Booster", engines: [{ engine: "merlin-1d", count: 9 }], propellant: "kerolox", tankVolumeM3: 400 },
      { label: "Stage 2", engines: [{ engine: "merlin-vacuum", count: 1 }], propellant: "kerolox", tankVolumeM3: 105 },
    ],
    payloadMassKg: 1_000,
    destination: "leo",
    features: [],
    heightM: 70,
    diameterM: 3.7,
    ...overrides,
  };
}

const hopper = falconLike({
  stages: [{ label: "Hopper", engines: [{ engine: "merlin-1d", count: 9 }], propellant: "kerolox", tankVolumeM3: 400 }],
});
const stuck = falconLike({
  stages: [
    { label: "Booster", engines: [{ engine: "merlin-1d", count: 1 }], propellant: "kerolox", tankVolumeM3: 400 },
    falconLike().stages[1],
  ],
});

function attempts(...designs: Design[]): Attempt[] {
  return designs.map((design, i) => ({ n: i + 1, design, analysis: analyze(design), maxAltitudeKm: 0 }));
}

/** Applies an improvement's fix, after an engine fix that came first when its text starts with "Then". */
function applied(design: Design, list: Improvement[], item: Improvement): Design {
  let base = design;
  if (item.text.startsWith("Then ")) {
    const engines = list.find((i) => i.fix?.type === "set-engines");
    base = applyAction(base, engines!.fix!);
  }
  return applyAction(base, item.fix!);
}

describe("headline", () => {
  it("says how far short of orbit a first suborbital flight was", () => {
    const r = recap(attempts(hopper));
    expect(analyze(hopper).verdict).toBe("suborbital");
    expect(r.headline).toMatch(/^Attempt 1: suborbital, \d+\.\d km\/s short of orbit$/);
    expect(r.delta).toBeNull();
  });

  it("compares with the last attempt", () => {
    const r = recap(attempts(hopper, falconLike()));
    expect(r.headline).toMatch(/^Attempt 2: orbit, \d+\.\d km\/s better than last time$/);
    expect(r.delta).toMatch(/^\+\d+\.\d km\/s since attempt 1 \(1 stage added, engines 9 → 10\)$/);
  });

  it("names a stuck rocket's thrust-to-weight", () => {
    expect(recap(attempts(stuck)).headline).toMatch(/^Attempt 1: stuck on the pad, thrust-to-weight 0\.\d\d$/);
  });

  it("lists tank, payload and target changes", () => {
    const before = falconLike({ destination: "gto" });
    const after = applyAction(applyAction(before, { type: "scale-tanks", stageIndex: 1, factor: 1.2 }), {
      type: "set-payload",
      payloadMassKg: 2_000,
    });
    const r = recap(attempts(before, { ...after, destination: "moon-orbit" }));
    expect(r.delta).toMatch(/\(tanks \+4%, payload 1\.0 t → 2\.0 t, target GTO → lunar orbit\)$/);
  });

  it("handles no flights", () => {
    expect(recap([])).toEqual({ headline: "No flights yet", delta: null, improvements: [] });
  });
});

describe("improvements after a failure", () => {
  it("gets a stuck rocket off the pad first, with an exact engine fix", () => {
    const { improvements } = recap(attempts(stuck));
    expect(improvements[0].text).toMatch(/^Add \d+ more Merlin 1D engines? to get off the pad$/);
    expect(analyze(applyAction(stuck, improvements[0].fix!)).liftoffTwr).toBeGreaterThanOrEqual(1);
  });

  it("turns a short rocket's red-pen fix into what it buys, and it works", () => {
    const short = falconLike({ destination: "gto", payloadMassKg: 8_000 });
    expect(analyze(short).marginMps).toBeLessThan(0);
    const { improvements } = recap(attempts(short));
    const fuel = improvements.find((i) => i.fix?.type === "scale-tanks" || i.fix?.type === "add-stage");
    expect(fuel?.text).toMatch(/(Stretch the .+ \d+% to reach GTO|Add a stage to reach GTO)/);
    const after = analyze(applied(short, improvements, fuel!));
    expect(after.marginMps).toBeGreaterThanOrEqual(0);
    expect(after.liftoffTwr).toBeGreaterThanOrEqual(1);
  });

  it("asks for the lighter payload first when that's what's over", () => {
    // Falcon 9 landing its booster with 23.1 t aboard: it carries 17.5 t that way.
    const f9 = templateById("falcon9");
    const landing = { ...applyAction(f9.design, { type: "set-recover", stageIndex: 0, recover: true }), payloadMassKg: 23_100 };
    expect(analyze(landing).marginMps).toBeLessThan(0);
    const [first] = recap(attempts(landing)).improvements;
    expect(first.text).toMatch(/^Carry \d+\.\d t instead of 23\.1 t to make orbit$/);
    if (first.fix?.type !== "set-payload") throw new Error("expected set-payload");
    expect(first.fix.payloadMassKg).toBeLessThanOrEqual(maxPayloadKg(landing));
    expect(analyze(applyAction(landing, first.fix)).marginMps).toBeGreaterThanOrEqual(0);
  });

  it("offers a closer target this design already reaches", () => {
    const { improvements } = recap(attempts(falconLike({ destination: "europa" })));
    const aim = improvements.find((i) => i.fix?.type === "set-destination");
    expect(aim?.text).toMatch(/^Aim for .+ instead: this design already makes it$/);
    const after = analyze(applyAction(falconLike({ destination: "europa" }), aim!.fix!));
    expect(after.marginMps).toBeGreaterThanOrEqual(0);
  });

  it("asks for legs and a heat shield on a Mars landing, without a fix", () => {
    const mars = falconLike({ destination: "mars-surface" });
    const texts = recap(attempts(mars)).improvements.map((i) => i.text);
    expect(texts.some((t) => /landing legs/.test(t) || /heat shield/.test(t))).toBe(true);
  });
});

describe("improvements after a success", () => {
  const leo = falconLike();
  const { improvements } = recap(attempts(leo));

  it("works out how much more payload it could carry, and no more", () => {
    const payload = improvements.find((i) => i.fix?.type === "set-payload");
    expect(payload?.text).toMatch(/^You could carry [\d.,]+ t more to low Earth orbit$/);
    const fix = payload!.fix!;
    if (fix.type !== "set-payload") throw new Error("expected set-payload");
    expect(analyze(applyAction(leo, fix)).marginMps).toBeGreaterThanOrEqual(0);
    expect(analyze({ ...leo, payloadMassKg: fix.payloadMassKg + 2_000 }).marginMps).toBeLessThan(0);
  });

  it("points at a farther target, with an edit that really reaches it", () => {
    const farther = improvements.find((i) => /reach|aim for/i.test(i.text) && i.fix?.type !== "set-payload");
    expect(farther).toBeDefined();
    const fix = farther!.fix!;
    if (fix.type === "set-destination") {
      expect(analyze(applyAction(leo, fix)).marginMps).toBeGreaterThanOrEqual(0);
    } else {
      // "Stretch ... and you'd reach GTO": verified at the next target.
      expect(analyze({ ...applyAction(leo, fix), destination: "gto" }).marginMps).toBeGreaterThanOrEqual(0);
    }
  });

  it("suggests shrinking an over-built rocket's tanks only as far as still works", () => {
    const overbuilt = falconLike({ payloadMassKg: 100 });
    expect(analyze(overbuilt).marginMps).toBeGreaterThan(2_000);
    const shrink = recap(attempts(overbuilt)).improvements.find((i) => i.text.startsWith("Shrink"));
    expect(shrink?.text).toMatch(/^Shrink the .*tanks \d+%; it still makes it$/);
    const after = analyze(applyAction(overbuilt, shrink!.fix!));
    expect(after.marginMps).toBeGreaterThanOrEqual(0);
    expect(after.liftoffTwr).toBeGreaterThanOrEqual(1);
  });
});

describe("what a flight did", () => {
  const saturn = templateById("saturn-v").design;
  const f9 = templateById("falcon9").design;
  const light = (d: Design, destination: Design["destination"]): Design => ({ ...d, destination, payloadMassKg: 500 });
  // Saturn V needs a stage more for Europa.
  const europa = applyAction(light(saturn, "europa"), { type: "add-stage" });

  it.each([
    ["mars-transfer", light(f9, "mars-transfer"), "on course for Mars"],
    ["mars-surface", light(saturn, "mars-surface"), "on course for Mars"],
    ["europa", europa, "on course for Europa"],
  ] as const)("%s: the flight is on its way, never 'reached'", (_, design, says) => {
    expect(analyze(design).verdict).toBe("destination");
    const first = recap(attempts(design));
    const again = recap(attempts(light(f9, "leo"), design));
    for (const r of [first, again]) {
      expect(r.headline).toContain(says);
      const lines = [r.headline, r.delta ?? "", ...r.improvements.map((i) => i.text)];
      for (const line of lines) expect(line).not.toMatch(/\breached\b/i);
    }
  });

  it("says a Moon flight reached the Moon's distance, and a LEO or GTO flight as before", () => {
    expect(recap(attempts(light(saturn, "moon-orbit"))).headline).toMatch(/^Attempt 1: reached the Moon's distance with \d+\.\d km\/s to spare$/);
    expect(recap(attempts(light(f9, "leo"))).headline).toMatch(/^Attempt 1: orbit with /);
    expect(recap(attempts(light(f9, "gto"))).headline).toMatch(/^Attempt 1: reached GTO with /);
  });
});

describe("every recap", () => {
  const cases: [string, Design][] = [
    ["stuck", stuck],
    ["suborbital", hopper],
    ["short", falconLike({ destination: "mars-surface" })],
    ["works", falconLike()],
    ["over-built", falconLike({ payloadMassKg: 100 })],
  ];

  it.each(cases)("%s: 1 to 3 improvements, every fix checked against the physics", (_, design) => {
    const { improvements } = recap(attempts(design));
    expect(improvements.length).toBeGreaterThanOrEqual(1);
    expect(improvements.length).toBeLessThanOrEqual(3);
    for (const item of improvements) {
      expect(item.text.length).toBeGreaterThan(0);
      if (!item.fix) continue;
      const after = analyze(applied(design, improvements, item));
      expect(after.liftoffTwr).toBeGreaterThanOrEqual(1);
    }
  });

  it("is deterministic", () => {
    const history = attempts(hopper, falconLike(), falconLike({ destination: "gto" }));
    expect(recap(history)).toEqual(recap(history));
  });
});

describe("a real rocket's template", () => {
  it("never suggests drawing hardware the user can't add, though a sketch still does", () => {
    const f9 = templateById("falcon9").design;
    const toMars: Design = { ...f9, destination: "mars-surface", payloadMassKg: 500 };
    const sketch = recap(attempts(toMars)).improvements.map((i) => i.text);
    expect(sketch.some((t) => /^Draw /.test(t))).toBe(true);
    const template = recap(attempts(toMars), { drawable: false }).improvements.map((i) => i.text);
    for (const t of template) expect(t).not.toMatch(/\bdraw\b/i);
  });
});

describe("flightOutcome", () => {
  it("says what each flight did, and 'on course' only for a trip that's on its way", () => {
    const f9 = templateById("falcon9").design;
    const at = (d: Design) => flightOutcome(d, analyze(d));
    expect(at({ ...f9, destination: "leo" })).toBe("orbit");
    expect(at({ ...f9, destination: "gto", payloadMassKg: 500 })).toBe("reached GTO");
    expect(at({ ...f9, destination: "moon-orbit", payloadMassKg: 500 })).toBe("reached the Moon's distance");
    expect(at({ ...f9, destination: "mars-transfer", payloadMassKg: 500 })).toBe("on course for Mars");
    // Short of Europa: it only made orbit, and says so.
    expect(at({ ...f9, destination: "europa", payloadMassKg: 500 })).toBe("orbit");
    expect(at({ ...f9, destination: "europa", payloadMassKg: 500 })).not.toMatch(/course/);
  });
});
