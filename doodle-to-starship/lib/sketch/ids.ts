import type { DestinationId, EngineId, PartKind, PropellantId } from "../design";

// Runtime lists of the id unions in lib/design.ts, for JSON schemas and input validation.
// The Exhaustive checks below fail to compile if design.ts gains an id these lists miss.

export const ENGINE_IDS = [
  "raptor-3",
  "raptor-vacuum",
  "merlin-1d",
  "merlin-vacuum",
  "rs-25",
  "rl10c",
  "f-1",
  "j-2",
  "be-4",
  "rd-180",
  "rutherford",
  "rutherford-vacuum",
  "generic-solid",
] as const satisfies readonly EngineId[];

export const PROPELLANT_IDS = [
  "methalox",
  "kerolox",
  "hydrolox",
  "solid",
  "hypergolic",
] as const satisfies readonly PropellantId[];

export const DESTINATION_IDS = [
  "leo",
  "gto",
  "moon-orbit",
  "moon-surface",
  "mars-transfer",
  "mars-surface",
  "europa",
] as const satisfies readonly DestinationId[];

export const PART_KINDS = [
  "tank",
  "engine",
  "fin",
  "nose",
  "payload",
  "heat-shield",
  "landing-legs",
  "solar-panel",
  "window",
  "other",
] as const satisfies readonly PartKind[];

type Exhaustive<All, Listed extends All> = [Exclude<All, Listed>] extends [never] ? true : never;
const exhaustive: [
  Exhaustive<EngineId, (typeof ENGINE_IDS)[number]>,
  Exhaustive<PropellantId, (typeof PROPELLANT_IDS)[number]>,
  Exhaustive<DestinationId, (typeof DESTINATION_IDS)[number]>,
  Exhaustive<PartKind, (typeof PART_KINDS)[number]>,
] = [true, true, true, true];
void exhaustive;

function oneOf<T extends string>(list: readonly T[]) {
  return (value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);
}

export const isEngineId = oneOf<EngineId>(ENGINE_IDS);
export const isPropellantId = oneOf<PropellantId>(PROPELLANT_IDS);
export const isDestinationId = oneOf<DestinationId>(DESTINATION_IDS);
export const isPartKind = oneOf<PartKind>(PART_KINDS);
