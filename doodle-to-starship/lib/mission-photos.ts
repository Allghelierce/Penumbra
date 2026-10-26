/** A real photograph of a flight, from Wikimedia Commons. */
export interface MissionPhoto {
  url: string;
  caption: string;
  credit: string;
  license: string;
  /** The Commons file page. */
  pageUrl: string;
}

/** Verified photos per mission id; missions without an entry show none. */
export const MISSION_PHOTOS: Record<string, MissionPhoto[]> = {};
