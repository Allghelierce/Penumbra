/** A real photograph of a flight, from Wikimedia Commons. */
export interface MissionPhoto {
  url: string;
  caption: string;
  credit: string;
  license: string;
  /** The Commons file page. */
  pageUrl: string;
}

/** Verified photos per mission id (Wikimedia Commons, public domain or CC); missions without an entry show none. */
export const MISSION_PHOTOS: Record<string, MissionPhoto[]> = {
  "falcon1-f1": [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/SpaceX_Rocks%21%21%21_%28117363190%29.jpg/1280px-SpaceX_Rocks%21%21%21_%28117363190%29.jpg",
      caption: "Flight 1 liftoff on the live webcast",
      credit: "Steve Jurvetson / SpaceX webcast",
      license: "CC BY 2.0",
      pageUrl: "https://commons.wikimedia.org/wiki/File:SpaceX_Rocks!!!_(117363190).jpg"
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/0/0f/Falcon_1_Prelaunch_%2867235805%29.jpg",
      caption: "Flight 1 rocket on Omelek, Nov 2005",
      credit: "SpaceX, via Steve Jurvetson",
      license: "CC BY 2.0",
      pageUrl: "https://commons.wikimedia.org/wiki/File:Falcon_1_Prelaunch_(67235805).jpg"
    }
  ],
  "falcon1-f4": [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Falcon_1_Flight_4_launch.jpg/1280px-Falcon_1_Flight_4_launch.jpg",
      caption: "Flight 4 climbs away from Omelek Island",
      credit: "SpaceX",
      license: "CC0",
      pageUrl: "https://commons.wikimedia.org/wiki/File:Falcon_1_Flight_4_launch.jpg"
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/c/c8/Falcon_1_Flight_4_liftoff.jpg",
      caption: "Liftoff on the flight that reached orbit",
      credit: "SpaceX",
      license: "CC BY-SA 3.0",
      pageUrl: "https://commons.wikimedia.org/wiki/File:Falcon_1_Flight_4_liftoff.jpg"
    }
  ],
  "crs7": [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Falcon_9_launches_with_CRS-7_from_SLC-40_%28KSC-2015-2340%29.jpg/1280px-Falcon_9_launches_with_CRS-7_from_SLC-40_%28KSC-2015-2340%29.jpg",
      caption: "CRS-7 lifts off from Cape Canaveral",
      credit: "NASA/Charles Babir",
      license: "Public domain",
      pageUrl: "https://commons.wikimedia.org/wiki/File:Falcon_9_launches_with_CRS-7_from_SLC-40_(KSC-2015-2340).jpg"
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/SpaceX_CRS-7_launch_failure.jpg/1280px-SpaceX_CRS-7_launch_failure.jpg",
      caption: "Breakup cloud 139 seconds after liftoff",
      credit: "NASA TV",
      license: "Public domain",
      pageUrl: "https://commons.wikimedia.org/wiki/File:SpaceX_CRS-7_launch_failure.jpg"
    }
  ],
  "og2": [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/ORBCOMM-2_%2823802553412%29.jpg/1280px-ORBCOMM-2_%2823802553412%29.jpg",
      caption: "First stage touches down at LZ-1",
      credit: "SpaceX",
      license: "CC0",
      pageUrl: "https://commons.wikimedia.org/wiki/File:ORBCOMM-2_(23802553412).jpg"
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/ORBCOMM-2_%2823615167890%29.jpg/1280px-ORBCOMM-2_%2823615167890%29.jpg",
      caption: "Night liftoff with 11 Orbcomm satellites",
      credit: "SpaceX",
      license: "CC0",
      pageUrl: "https://commons.wikimedia.org/wiki/File:ORBCOMM-2_(23615167890).jpg"
    }
  ],
  "ift1": [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/d/d9/StarshipLaunch_%28cropped%29.jpg",
      caption: "Starship climbs with some engines out",
      credit: "Osunpokeh",
      license: "CC BY-SA 4.0",
      pageUrl: "https://commons.wikimedia.org/wiki/File:StarshipLaunch_(cropped).jpg"
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/SpaceX_Starship_IFT-1_NASA_WB-57_Cam_0.webm/1280px-seek%3D288-SpaceX_Starship_IFT-1_NASA_WB-57_Cam_0.webm.jpg",
      caption: "Tumbling Starship moments before the explosion",
      credit: "NASA (WB-57 video frame)",
      license: "Public domain",
      pageUrl: "https://commons.wikimedia.org/wiki/File:SpaceX_Starship_IFT-1_NASA_WB-57_Cam_0.webm"
    }
  ],
  "ift5": [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Starship_Booster_Landing_on_Mechzilla_%2854064036815%29.jpg/1280px-Starship_Booster_Landing_on_Mechzilla_%2854064036815%29.jpg",
      caption: "Tower arms catch the returning booster",
      credit: "Steve Jurvetson",
      license: "CC BY 2.0",
      pageUrl: "https://commons.wikimedia.org/wiki/File:Starship_Booster_Landing_on_Mechzilla_(54064036815).jpg"
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/SpaceX_Starship_Booster_Back_at_its_Perch_IFT-5.jpg/1280px-SpaceX_Starship_Booster_Back_at_its_Perch_IFT-5.jpg",
      caption: "Booster resting in the tower's arms",
      credit: "Steve Jurvetson",
      license: "CC BY 2.0",
      pageUrl: "https://commons.wikimedia.org/wiki/File:SpaceX_Starship_Booster_Back_at_its_Perch_IFT-5.jpg"
    }
  ]
};
