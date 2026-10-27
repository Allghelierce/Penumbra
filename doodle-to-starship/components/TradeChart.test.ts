import { describe, expect, it } from "vitest";
import { curveModel, layoutLabels, payloadText } from "./TradeChart";

describe("curve model", () => {
  const xs = [0.6, 0.8, 1, 1.2, 1.4, 1.45, 1.5, 1.6];
  const ys = [6000, 15000, 22800, 24000, 20000, 18000, 0, 0];
  const { at, cmds } = curveModel(xs, ys);

  it("passes through every point", () => {
    xs.forEach((x, i) => expect(at(x)).toBeCloseTo(ys[i], 6));
  });

  it("never dips below zero or overshoots the peak", () => {
    for (let x = 0.6; x <= 1.6; x += 0.001) {
      const y = at(x);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(24000 + 1e-6);
    }
  });

  it("draws the drop to zero as a straight line, not part of the spline", () => {
    expect(at(1.475)).toBeCloseTo(9000, 6);
    expect(cmds[6]).toEqual(["L", 1.5, 0]);
    expect(cmds[5][0]).toBe("C");
    for (let x = 1.4; x <= 1.45; x += 0.001) expect(at(x)).toBeGreaterThanOrEqual(18000 - 1e-6);
  });

  it("rises straight off zero too, and copes with edges and a single point", () => {
    const rise = curveModel([1, 2, 3, 4], [0, 0, 300, 320]);
    expect(rise.at(2.5)).toBeCloseTo(150, 6);
    expect(rise.at(0)).toBe(0);
    expect(rise.at(9)).toBe(320);
    expect(curveModel([1], [500]).at(3)).toBe(500);
  });
});

describe("label layout", () => {
  const overlaps = (a: { left: number; right: number }, b: { left: number; right: number }) => a.right > b.left && b.right > a.left;

  it("keeps far-apart labels in one lane", () => {
    const { lanes } = layoutLabels([{ px: 40, w: 100 }, { px: 300, w: 100 }], 600);
    expect(lanes).toBe(1);
  });

  it("never overlaps labels in a lane or runs a leader through a lower label", () => {
    const items = [{ px: 200, w: 120 }, { px: 230, w: 120 }, { px: 250, w: 140 }];
    const { placed } = layoutLabels(items, 428);
    placed.forEach((a, i) =>
      placed.forEach((b, j) => {
        if (i === j) return;
        if (a.lane === b.lane) expect(overlaps(a, b)).toBe(false);
        if (a.lane > b.lane && Math.abs(items[i].px - items[j].px) >= 2) {
          expect(items[i].px < b.left || items[i].px > b.right).toBe(true);
        }
      }),
    );
    placed.forEach((p) => {
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.right).toBeLessThanOrEqual(428);
    });
  });

  it("flips a label near the right edge to the left of its marker", () => {
    const { placed } = layoutLabels([{ px: 420, w: 100 }], 428);
    expect(placed[0].flip).toBe(true);
  });
});

describe("payloadText", () => {
  it("uses tonnes for big rockets and kilograms for small ones", () => {
    expect(payloadText(22_800, true)).toBe("23 t");
    expect(payloadText(8_460, true)).toBe("8.5 t");
    expect(payloadText(140_000, true)).toBe("140 t");
    expect(payloadText(1_250, false)).toBe("1,250 kg");
    expect(payloadText(-5, true)).toBe("0 t");
  });
});
