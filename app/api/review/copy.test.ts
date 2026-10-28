import { describe, expect, it } from "vitest";

import type { Review } from "@/lib/design";
import { applyRewrite, sameNumbers } from "./copy";

const review: Review = {
  marks: [
    { kind: "circle", center: [0.5, 0.9], radius: 0.1, note: "Needs 3 more engines" },
    { kind: "arrow", from: [0.2, 0.5], to: [0.4, 0.5], note: "Stretch tanks +34%" },
  ],
  summary: "Falls 1,200 m/s short of orbit.",
};

describe("applyRewrite", () => {
  it("takes witty lines that keep the numbers", () => {
    const { review: out, changed } = applyRewrite(review, {
      summary: "Bold napkin, but it's 1200 m/s shy of orbit.",
      notes: ["3 more engines, minimum", "Tanks +34%, then we talk"],
    });
    expect(changed).toBe(true);
    expect(out.marks.map((m) => m.note)).toEqual(["3 more engines, minimum", "Tanks +34%, then we talk"]);
    expect(out.marks[0]).toMatchObject({ kind: "circle", center: [0.5, 0.9] });
    expect(out.summary).toBe("Bold napkin, but it's 1200 m/s shy of orbit.");
  });

  it("keeps the original where Grok changed a number, ran long or miscounted", () => {
    const changedNumber = applyRewrite(review, { summary: "About 1 km/s short.", notes: ["4 more engines", "Seven words is far too many words"] });
    expect(changedNumber.changed).toBe(false);
    expect(changedNumber.review).toEqual(review);
    expect(applyRewrite(review, { summary: "x", notes: ["one"] }).changed).toBe(false);
    expect(applyRewrite(review, null).review).toBe(review);
  });

  it("compares numbers regardless of thousands separators", () => {
    expect(sameNumbers("1,200 m/s", "1200 m/s")).toBe(true);
    expect(sameNumbers("+34%", "34% more")).toBe(true);
    expect(sameNumbers("3 engines", "three engines")).toBe(false);
  });
});
