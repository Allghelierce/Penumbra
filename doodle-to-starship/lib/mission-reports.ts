// Engineering mishap-report details for the three featured missions.
// Well-established facts only; the debrief's "Full report" view reads these.

export interface MissionReport {
  /** What was on board. */
  payload: string;
  /** What the flight was trying to do. */
  objective: string;
  /** The failure as an ordered chain of cause → effect. */
  causeChain: string[];
  /** Design lessons an engineer can take to their own vehicle. */
  lessons: string[];
  /** Who ran the investigation. */
  investigation: string;
}

export const MISSION_REPORTS: Record<string, MissionReport> = {
  "falcon1-f1": {
    payload: "FalconSAT-2, a US Air Force Academy research satellite",
    objective: "First orbital attempt of Falcon 1",
    causeChain: [
      "Salty, humid island air corroded an aluminum fitting (B-nut) on the engine's fuel line",
      "The fitting cracked and leaked kerosene onto the hot engine section",
      "A fire broke out above the engine shortly after liftoff",
      "The fire damaged the system supplying the engine's pneumatic pressure",
      "The engine shut down and the vehicle fell back near the launch site",
    ],
    lessons: [
      "Launch-site environment drives material choice: salt air ruins aluminum fittings",
      "A single low-cost part can end the mission: inspect every fluid fitting",
      "Iterate fast: Falcon 1 reached orbit two and a half years later",
    ],
    investigation: "SpaceX with DARPA",
  },
  crs7: {
    payload: "Dragon cargo capsule for the ISS, including the IDA-1 docking adapter",
    objective: "Seventh commercial resupply mission to the International Space Station",
    causeChain: [
      "A steel strut held a helium pressure bottle inside the second-stage liquid oxygen tank",
      "The strut had a material flaw and broke at roughly a fifth of its rated load",
      "The bottle broke free and released high-pressure helium into the oxygen tank",
      "The tank overpressurized and the second stage burst 139 seconds after liftoff",
      "Dragon survived the breakup, but its software had no mode to open its parachutes, so it was lost at impact",
    ],
    lessons: [
      "Never trust a supplier's rating: test every critical part individually",
      "Parts inside tanks see loads that are hard to inspect: give them real margin",
      "Give the payload a way to save itself: later Dragons got contingency parachute software",
    ],
    investigation: "SpaceX, with NASA and the FAA",
  },
  ift1: {
    payload: "None: an uncrewed integrated flight test",
    objective: "Fly Starship and Super Heavy together for the first time",
    causeChain: [
      "The launch pad had no flame deflector, and liftoff blasted concrete and debris from beneath it",
      "Propellant leaks in the booster's engine section started fires",
      "Several Raptor engines failed, and the booster lost control of its engine steering",
      "The stack could not separate and began to tumble",
      "The flight termination system was triggered, and the vehicle broke up",
    ],
    lessons: [
      "Ground systems are flight systems: the pad needed a water-cooled steel deflector",
      "Fire protection and leak detection in the engine bay matter at 33 engines",
      "Test the termination system as hard as the vehicle: it took too long to destroy the stack",
    ],
    investigation: "SpaceX-led, overseen by the FAA, which required 63 corrective actions",
  },
};
