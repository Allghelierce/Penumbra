// Published figures for the engines, propellants and destinations the physics engine knows.

import type { DestinationId, DestinationSpec, EngineId, EngineSpec, PropellantId } from "../design";

export const G0 = 9.80665;

/** Vacuum-only engines can't run at sea level, so their sea-level thrust and Isp are 0. */
export const ENGINES: Record<EngineId, EngineSpec> = {
  "raptor-3": {
    id: "raptor-3",
    name: "Raptor 3",
    vehicle: "Starship Super Heavy booster",
    propellant: "methalox",
    thrustSeaLevelN: 2_746_000,
    thrustVacuumN: 2_980_000,
    ispSeaLevelS: 327,
    ispVacuumS: 350,
    massKg: 1_525,
    source: "https://en.wikipedia.org/wiki/SpaceX_Raptor",
  },
  "raptor-vacuum": {
    id: "raptor-vacuum",
    name: "Raptor Vacuum",
    vehicle: "Starship upper stage",
    propellant: "methalox",
    thrustSeaLevelN: 0,
    thrustVacuumN: 2_530_000,
    ispSeaLevelS: 0,
    ispVacuumS: 380,
    massKg: 1_600,
    source: "https://en.wikipedia.org/wiki/SpaceX_Raptor",
  },
  "merlin-1d": {
    id: "merlin-1d",
    name: "Merlin 1D",
    vehicle: "Falcon 9 first stage",
    propellant: "kerolox",
    thrustSeaLevelN: 845_000,
    thrustVacuumN: 914_000,
    ispSeaLevelS: 282,
    ispVacuumS: 311,
    massKg: 470,
    source: "https://en.wikipedia.org/wiki/SpaceX_Merlin",
  },
  "merlin-vacuum": {
    id: "merlin-vacuum",
    name: "Merlin Vacuum",
    vehicle: "Falcon 9 second stage",
    propellant: "kerolox",
    thrustSeaLevelN: 0,
    thrustVacuumN: 981_000,
    ispSeaLevelS: 0,
    ispVacuumS: 348,
    massKg: 490,
    source: "https://en.wikipedia.org/wiki/SpaceX_Merlin",
  },
  "rs-25": {
    id: "rs-25",
    name: "RS-25",
    vehicle: "Space Shuttle and SLS core stage",
    propellant: "hydrolox",
    thrustSeaLevelN: 1_860_000,
    thrustVacuumN: 2_279_000,
    ispSeaLevelS: 366,
    ispVacuumS: 452,
    massKg: 3_527,
    source: "https://en.wikipedia.org/wiki/RS-25",
  },
  rl10c: {
    id: "rl10c",
    name: "RL10C",
    vehicle: "Centaur upper stage",
    propellant: "hydrolox",
    thrustSeaLevelN: 0,
    thrustVacuumN: 101_800,
    ispSeaLevelS: 0,
    ispVacuumS: 449.7,
    massKg: 190,
    source: "https://en.wikipedia.org/wiki/RL10",
  },
  "f-1": {
    id: "f-1",
    name: "F-1",
    vehicle: "Saturn V first stage",
    propellant: "kerolox",
    thrustSeaLevelN: 6_770_000,
    thrustVacuumN: 7_770_000,
    ispSeaLevelS: 263,
    ispVacuumS: 304,
    massKg: 8_391,
    source: "https://en.wikipedia.org/wiki/Rocketdyne_F-1",
  },
  "j-2": {
    id: "j-2",
    name: "J-2",
    vehicle: "Saturn V second and third stages",
    propellant: "hydrolox",
    thrustSeaLevelN: 486_200,
    thrustVacuumN: 1_033_100,
    ispSeaLevelS: 200,
    ispVacuumS: 421,
    massKg: 1_788,
    source: "https://en.wikipedia.org/wiki/Rocketdyne_J-2",
  },
  "be-4": {
    id: "be-4",
    name: "BE-4",
    vehicle: "New Glenn and Vulcan first stages",
    propellant: "methalox",
    thrustSeaLevelN: 2_446_000,
    thrustVacuumN: 2_690_000,
    ispSeaLevelS: 310,
    ispVacuumS: 340,
    massKg: 2_000,
    source: "https://en.wikipedia.org/wiki/BE-4",
  },
  "rd-180": {
    id: "rd-180",
    name: "RD-180",
    vehicle: "Atlas V first stage",
    propellant: "kerolox",
    thrustSeaLevelN: 3_830_000,
    thrustVacuumN: 4_152_000,
    ispSeaLevelS: 311,
    ispVacuumS: 338,
    massKg: 5_480,
    source: "https://en.wikipedia.org/wiki/RD-180",
  },
  rutherford: {
    id: "rutherford",
    name: "Rutherford",
    vehicle: "Electron first stage",
    propellant: "kerolox",
    thrustSeaLevelN: 24_910,
    thrustVacuumN: 25_800,
    ispSeaLevelS: 303,
    ispVacuumS: 311,
    massKg: 35,
    source: "https://en.wikipedia.org/wiki/Rutherford_(rocket_engine)",
  },
  "generic-solid": {
    id: "generic-solid",
    name: "Solid rocket motor",
    vehicle: "GEM 63 strap-on booster",
    propellant: "solid",
    thrustSeaLevelN: 1_480_000,
    thrustVacuumN: 1_663_000,
    ispSeaLevelS: 245,
    ispVacuumS: 279,
    massKg: 1_000,
    source: "https://en.wikipedia.org/wiki/GEM_63",
  },
};

/** Bulk density of oxidizer plus fuel at the usual mixture ratio, in kg/m³. */
export const PROPELLANT_DENSITY_KG_M3: Record<PropellantId, number> = {
  // LOX 1141 + RP-1 810 at O/F 2.56
  kerolox: 1_030,
  // LOX 1141 + liquid methane 422 at O/F 3.6
  methalox: 830,
  // LOX 1141 + liquid hydrogen 71 at O/F 6
  hydrolox: 360,
  // Ammonium perchlorate composite propellant
  solid: 1_750,
  // N2O4 1440 + UDMH 790 at O/F 2.6
  hypergolic: 1_180,
};

/** Tanks, plumbing and structure as a fraction of propellant mass, when the design doesn't give a dry mass. */
export const STRUCTURAL_FACTOR: Record<PropellantId, number> = {
  methalox: 0.06,
  kerolox: 0.05,
  hydrolox: 0.1,
  solid: 0.12,
  hypergolic: 0.08,
};

/** Usable share of the drawn tank volume (ullage, residuals). */
export const TANK_FILL = 0.95;

const DELTA_V_MAP = "https://en.wikipedia.org/wiki/Delta-v_budget";

/**
 * Delta-v from Earth's surface. LEO includes about 1.5 km/s of gravity and drag losses on
 * top of 7.8 km/s orbital speed; the rest add the standard delta-v map legs from LEO.
 */
export const DESTINATIONS: Record<DestinationId, DestinationSpec> = {
  leo: { id: "leo", name: "Low Earth orbit", deltaVFromSurfaceMps: 9_400, source: DELTA_V_MAP },
  // + LEO to GTO 2.44 km/s
  gto: { id: "gto", name: "Geostationary transfer orbit", deltaVFromSurfaceMps: 11_840, source: DELTA_V_MAP },
  // + trans-lunar injection 3.26, + lunar orbit insertion 0.68
  "moon-orbit": { id: "moon-orbit", name: "Lunar orbit", deltaVFromSurfaceMps: 13_340, source: DELTA_V_MAP },
  // + lunar descent 1.73
  "moon-surface": { id: "moon-surface", name: "Moon surface", deltaVFromSurfaceMps: 15_070, source: DELTA_V_MAP },
  // + trans-Mars injection 3.61
  "mars-transfer": { id: "mars-transfer", name: "Mars transfer", deltaVFromSurfaceMps: 13_010, source: DELTA_V_MAP },
  // + Mars capture 0.67, then aerobraking and a ~1.4 km/s landing burn
  "mars-surface": { id: "mars-surface", name: "Mars surface", deltaVFromSurfaceMps: 15_080, source: DELTA_V_MAP },
  // + Jupiter transfer 6.3, + capture and Europa orbit with moon flybys ~2.5
  europa: { id: "europa", name: "Europa", deltaVFromSurfaceMps: 18_200, source: DELTA_V_MAP },
};

/** Orbital speed in low Earth orbit; LEO's delta-v minus this is the gravity and drag loss. */
export const ORBITAL_SPEED_MPS = 7_800;
