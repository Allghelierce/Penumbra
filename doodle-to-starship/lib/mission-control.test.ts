import { describe, expect, it } from "vitest";

import { DEMO_SKETCHES } from "./demo-sketches";
import type { FlightEventKind } from "./design";
import { calloutFor, offerFor, parseReply, pollRoom } from "./mission-control";
import { analyze, simulateFlight } from "./physics";
import { buildReview } from "./redpen";
import { readFromGeometry } from "./sketch/geometry";

function demo(id: string) {
  const d = DEMO_SKETCHES.find((s) => s.id === id)!;
  const reading = readFromGeometry(d.strokes, d.destination);
  const analysis = analyze(reading.design);
  return { reading, design: reading.design, analysis, review: buildReview(reading, analysis) };
}

describe("pollRoom", () => {
  it("calls the orbiter GO for launch, with a number in every controller's line", () => {
    const { design, analysis, review, reading } = demo("two-stage-orbiter");
    const poll = pollRoom(design, analysis, review, reading.parts);
    expect(poll.go).toBe(true);
    expect(poll.calls.map((c) => c.role)).toEqual(["Propulsion", "Structures", "Trajectory", "Flight"]);
    expect(poll.summary).toBe("Flight, we are GO for launch.");
    for (const call of poll.calls.slice(0, -1)) expect(call.line).toMatch(/\d/);
  });

  it("holds the hopper on Trajectory, with the red pen's fix attached", () => {
    const { design, analysis, review, reading } = demo("napkin-hopper");
    const poll = pollRoom(design, analysis, review, reading.parts);
    const trajectory = poll.calls.find((c) => c.role === "Trajectory")!;
    expect(poll.go).toBe(false);
    expect(trajectory.go).toBe(false);
    expect(trajectory.line).toMatch(/^Trajectory, NO-GO\. We're \d+\.\d kilometers per second short of orbit\.$/);
    expect(trajectory.fix).toBeDefined();
    expect(poll.summary).toMatch(/^Hold, hold, hold\. One NO-GO: Trajectory\.$/);
  });

  it("polls Landing for the mars ship and sees its drawn legs and heat shield", () => {
    const { design, analysis, review, reading } = demo("mars-ship");
    const poll = pollRoom(design, analysis, review, reading.parts);
    const landing = poll.calls.find((c) => c.role === "Landing")!;
    expect(landing.go).toBe(true);
    expect(poll.calls.find((c) => c.role === "Trajectory")!.go).toBe(false);
  });

  it("calls Propulsion NO-GO for a rocket that can't lift itself", () => {
    const { design, review, reading } = demo("two-stage-orbiter");
    const heavy = { ...design, stages: design.stages.map((s, i) => (i === 0 ? { ...s, engines: [{ ...s.engines[0], count: 1 }] } : s)) };
    const poll = pollRoom(heavy, analyze(heavy), review, reading.parts);
    expect(poll.calls[0]).toMatchObject({ role: "Propulsion", go: false });
    expect(poll.calls[0].line).toMatch(/won't leave the pad/);
  });
});

describe("calloutFor", () => {
  it("has a short line for every event kind, with altitude where it matters", () => {
    const { design, analysis } = demo("two-stage-orbiter");
    const trace = simulateFlight(design, analysis);
    const kinds: FlightEventKind[] = ["liftoff", "max-q", "stage-sep", "engine-cutoff", "orbit", "fuel-exhausted", "apogee", "impact", "arrival", "pad-failure"];
    for (const kind of kinds) {
      const line = calloutFor({ tS: trace.events[0]?.tS ?? 0, kind, label: "" }, design, trace);
      expect(line.split(" ").length, kind).toBeLessThanOrEqual(4);
    }
    const orbit = trace.events.find((e) => e.kind === "orbit");
    if (orbit) expect(calloutFor(orbit, design, trace)).toMatch(/^Orbit\. \d+ kilometers\.$/);
  });
});

describe("calloutFor with replay dialog", () => {
  it("passes a historic event's quoted dialog through unchanged", () => {
    const { design } = demo("two-stage-orbiter");
    const label = 'CAPCOM: "Roger, go at throttle up."';
    expect(calloutFor({ tS: 70, kind: "max-q", label }, design)).toBe(label);
    expect(calloutFor({ tS: 70, kind: "max-q", label: "Max Q" }, design)).toBe("Max-Q.");
  });
});

describe("offerFor and parseReply", () => {
  it("offers the top improvement and asks to fly again", () => {
    const fix = { type: "scale-tanks", stageIndex: 0, factor: 1.12 } as const;
    expect(offerFor({ headline: "Attempt 1: suborbital", delta: null, improvements: [{ text: "Stretch the tanks 12% to make orbit.", fix }] })).toEqual({
      line: "Stretch the tanks 12% to make orbit. Fly again?",
      fix,
    });
    expect(offerFor({ headline: "Attempt 2: orbit!", delta: null, improvements: [] }).line).toBe("Attempt 2: orbit. Fly again?");
  });

  it("understands GO, scrub, fix, yes and no, and treats 'no go' as a scrub", () => {
    expect(parseReply("Go!")).toBe("go");
    expect(parseReply("we are go for launch")).toBe("go");
    expect(parseReply("no go")).toBe("scrub");
    expect(parseReply("No-go, hold")).toBe("scrub");
    expect(parseReply("scrub it")).toBe("scrub");
    expect(parseReply("apply the fix")).toBe("fix");
    expect(parseReply("yeah do it")).toBe("yes");
    expect(parseReply("nope")).toBe("no");
    expect(parseReply("what's the weather")).toBeNull();
  });
});
