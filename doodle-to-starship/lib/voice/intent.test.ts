import { describe, expect, it } from "vitest";
import type { Design } from "../design";
import { normalizeNumbers, parseCommand } from "./intent";

const design: Design = {
  name: "Napkin One",
  stages: [
    { label: "Booster", engines: [{ engine: "raptor-3", count: 9 }], propellant: "methalox", tankVolumeM3: 900 },
    { label: "Ship", engines: [{ engine: "raptor-vacuum", count: 3 }], propellant: "methalox", tankVolumeM3: 400 },
  ],
  payloadMassKg: 20000,
  destination: "leo",
  features: ["fins"],
  heightM: 60,
  diameterM: 9,
};

const parse = (text: string) => parseCommand(text, design);

describe("normalizeNumbers", () => {
  it("turns number words into digits", () => {
    expect(normalizeNumbers("thirty three raptors")).toBe("33 raptors");
    expect(normalizeNumbers("one hundred and fifty tons")).toBe("150 tons");
    expect(normalizeNumbers("thirty-three engines")).toBe("33 engines");
  });
});

describe("parseCommand", () => {
  it("sets destinations", () => {
    expect(parse("Send it to Mars")).toEqual([{ type: "set-destination", destination: "mars-transfer" }]);
    expect(parse("land it on Mars")).toEqual([{ type: "set-destination", destination: "mars-surface" }]);
    expect(parse("go to the moon")).toEqual([{ type: "set-destination", destination: "moon-orbit" }]);
    expect(parse("let's go to Europa")).toEqual([{ type: "set-destination", destination: "europa" }]);
    expect(parse("just get it to orbit")).toEqual([{ type: "set-destination", destination: "leo" }]);
    expect(parse("aim for LEO")).toEqual([{ type: "set-destination", destination: "leo" }]);
  });

  it("scales tanks", () => {
    expect(parse("stretch the tanks 30 percent")).toEqual([{ type: "scale-tanks", stageIndex: 0, factor: 1.3 }]);
    expect(parse("make the tanks 50% bigger")).toEqual([{ type: "scale-tanks", stageIndex: 0, factor: 1.5 }]);
    expect(parse("bigger tanks")).toEqual([{ type: "scale-tanks", stageIndex: 0, factor: 1.3 }]);
    expect(parse("double the fuel on the ship")).toEqual([{ type: "scale-tanks", stageIndex: 1, factor: 2 }]);
    expect(parse("shrink the tanks by twenty percent")).toEqual([{ type: "scale-tanks", stageIndex: 0, factor: 0.8 }]);
  });

  it("adds and removes stages", () => {
    expect(parse("add a booster")).toEqual([{ type: "add-stage" }]);
    expect(parse("stick another stage on it")).toEqual([{ type: "add-stage" }]);
    expect(parse("remove the top stage")).toEqual([{ type: "remove-stage", stageIndex: 1 }]);
  });

  it("sets engines", () => {
    expect(parse("give it 33 raptors")).toEqual([{ type: "set-engines", stageIndex: 0, engine: "raptor-3", count: 33 }]);
    expect(parse("nine merlins")).toEqual([{ type: "set-engines", stageIndex: 0, engine: "merlin-1d", count: 9 }]);
    expect(parse("add 3 more raptors")).toEqual([{ type: "set-engines", stageIndex: 0, engine: "raptor-3", count: 12 }]);
    expect(parse("6 vacuum raptors on the ship")).toEqual([{ type: "set-engines", stageIndex: 1, engine: "raptor-vacuum", count: 6 }]);
    expect(parse("more engines")).toEqual([{ type: "set-engines", stageIndex: 0, engine: "raptor-3", count: 14 }]);
  });

  it("sets payload", () => {
    expect(parse("payload 100 tons")).toEqual([{ type: "set-payload", payloadMassKg: 100000 }]);
    expect(parse("make the payload five hundred kilograms")).toEqual([{ type: "set-payload", payloadMassKg: 500 }]);
  });

  it("launches and reviews", () => {
    expect(parse("launch it")).toEqual([{ type: "launch" }]);
    expect(parse("send it!")).toEqual([{ type: "launch" }]);
    expect(parse("what do you think?")).toEqual([{ type: "review" }]);
    expect(parse("check it")).toEqual([{ type: "review" }]);
  });

  it("handles compound commands and puts launch last", () => {
    expect(parse("launch it after you add a stage")).toEqual([{ type: "add-stage" }, { type: "launch" }]);
    expect(parse("add a booster and send it to Mars")).toEqual([
      { type: "add-stage" },
      { type: "set-destination", destination: "mars-transfer" },
    ]);
    expect(parse("stretch the tanks 30 percent, then launch")).toEqual([
      { type: "scale-tanks", stageIndex: 0, factor: 1.3 },
      { type: "launch" },
    ]);
  });

  it("ignores chatter", () => {
    expect(parse("hello there")).toEqual([]);
    expect(parse("")).toEqual([]);
  });
});
