import type { Design, PropellantId } from "./design";
import { PROPELLANT_DENSITY_KG_M3 } from "./physics/data";

/** Same 95% usable fill the physics engine applies to tank volume. */
const USABLE_FILL = 0.95;

function tankVolume(usablePropellantKg: number, propellant: PropellantId): number {
  return usablePropellantKg / (PROPELLANT_DENSITY_KG_M3[propellant] * USABLE_FILL);
}

export const PRESETS: Design[] = [
  {
    // Falcon 9 Block 5, expendable LEO payload 22,800 kg.
    // https://en.wikipedia.org/wiki/Falcon_9
    // https://en.wikipedia.org/wiki/Falcon_9_Block_5
    name: "Falcon 9 Block 5",
    destination: "leo",
    payloadMassKg: 22_800,
    heightM: 70,
    diameterM: 3.7,
    features: ["fins", "landing-legs"],
    stages: [
      {
        // Propellant 410,900 kg (287,400 kg LOX + 123,500 kg RP-1). Dry mass 22,200 kg.
        label: "Booster",
        engines: [{ engine: "merlin-1d", count: 9 }],
        propellant: "kerolox",
        tankVolumeM3: tankVolume(410_900, "kerolox"),
        dryMassKg: 22_200,
      },
      {
        // Propellant 107,500 kg (75,200 kg LOX + 32,300 kg RP-1). Dry mass 4,000 kg.
        label: "Second stage",
        engines: [{ engine: "merlin-vacuum", count: 1 }],
        propellant: "kerolox",
        tankVolumeM3: tankVolume(107_500, "kerolox"),
        dryMassKg: 4_000,
      },
    ],
  },
  {
    // Saturn V translunar payload 43,500 kg. Height 363 ft (110.6 m) and diameter 33 ft (10.1 m);
    // the Wikipedia infobox rounds those conversions to 111 m and 10 m.
    // https://en.wikipedia.org/wiki/Saturn_V
    name: "Saturn V",
    destination: "moon-surface",
    payloadMassKg: 43_500,
    heightM: 110.6,
    diameterM: 10.1,
    features: ["fins"],
    stages: [
      {
        // Propellant 2,077,000 kg (gross 2,214,000 kg minus empty 137,000 kg). Dry mass 137,000 kg.
        label: "S-IC",
        engines: [{ engine: "f-1", count: 5 }],
        propellant: "kerolox",
        tankVolumeM3: tankVolume(2_077_000, "kerolox"),
        dryMassKg: 137_000,
      },
      {
        // Propellant 427,000 kg (gross 470,000 kg minus empty 43,000 kg). Dry mass 43,000 kg, including the interstage.
        label: "S-II",
        engines: [{ engine: "j-2", count: 5 }],
        propellant: "hydrolox",
        tankVolumeM3: tankVolume(427_000, "hydrolox"),
        dryMassKg: 43_000,
      },
      {
        // Propellant 105,300 kg (gross 120,500 kg minus empty 15,200 kg). Dry mass 15,200 kg, including the instrument unit.
        label: "S-IVB",
        engines: [{ engine: "j-2", count: 1 }],
        propellant: "hydrolox",
        tankVolumeM3: tankVolume(105_300, "hydrolox"),
        dryMassKg: 15_200,
      },
    ],
  },
  {
    // Starship Block 3, the stack SpaceX lists at 124 m with a 100+ t payload capacity.
    // Entered as 100 t. Super Heavy 3,650 t and Ship 1,600 t are the published propellant capacities.
    // https://www.spacex.com/vehicles/starship
    // https://en.wikipedia.org/wiki/SpaceX_Super_Heavy
    // https://en.wikipedia.org/wiki/SpaceX_Starship_(spacecraft)
    name: "Starship",
    destination: "mars-surface",
    payloadMassKg: 100_000,
    heightM: 124,
    diameterM: 9,
    features: ["fins", "heat-shield", "landing-legs"],
    stages: [
      {
        // Propellant 3,650,000 kg. Dry mass 275,000 kg is the published Block 1/2 empty mass;
        // Block 3 has not published a separate empty mass.
        label: "Super Heavy",
        engines: [{ engine: "raptor-3", count: 33 }],
        propellant: "methalox",
        tankVolumeM3: tankVolume(3_650_000, "methalox"),
        dryMassKg: 275_000,
      },
      {
        // Propellant 1,600,000 kg. Dry mass 100,000 kg is Elon Musk's 2021 figure for the ship;
        // Block 3 has not published a separate empty mass. Six engines: three vacuum, three sea-level.
        label: "Ship",
        engines: [
          { engine: "raptor-vacuum", count: 3 },
          { engine: "raptor-3", count: 3 },
        ],
        propellant: "methalox",
        tankVolumeM3: tankVolume(1_600_000, "methalox"),
        dryMassKg: 100_000,
      },
    ],
  },
  {
    // Electron, published LEO payload 300 kg. First-stage propellant and both dry masses
    // are the Spaceflight101 breakdown. Second-stage propellant is Rocket Lab's figure
    // of about 2,000 kg. Current liftoff mass is 13,000 kg.
    // https://rocketlabcorp.com/launch/electron/
    // https://rocketlabcorp.com/assets/Rocket-Lab-Electron-Payload-User-Guide-8.0.pdf
    // https://web.archive.org/web/20191201120000/https://spaceflight101.com/spacerockets/electron/
    name: "Electron",
    destination: "leo",
    payloadMassKg: 300,
    heightM: 18,
    diameterM: 1.2,
    features: [],
    stages: [
      {
        // Propellant 9,250 kg. Dry mass 950 kg.
        label: "First stage",
        engines: [{ engine: "rutherford", count: 9 }],
        propellant: "kerolox",
        tankVolumeM3: tankVolume(9_250, "kerolox"),
        dryMassKg: 950,
      },
      {
        // Propellant 2,000 kg (user's guide: approximately 2,000 kg). Dry mass 250 kg.
        label: "Second stage",
        engines: [{ engine: "rutherford", count: 1 }],
        propellant: "kerolox",
        tankVolumeM3: tankVolume(2_000, "kerolox"),
        dryMassKg: 250,
      },
    ],
  },
];
