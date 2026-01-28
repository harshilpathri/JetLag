// src/lib/rules.ts

export type GameSize = "SMALL" | "MEDIUM" | "LARGE";

export type Category =
  | "MATCHING"
  | "MEASURING"
  | "RADAR"
  | "THERMO"
  | "PHOTO"
  | "TENTACLE";

export type QuestionDef = {
  category: Category;
  key: string;
  text: string;

  /**
   * Which room sizes this question is allowed in.
   * Seekers UI should filter using this.
   */
  sizes: GameSize[];
};

const S: GameSize[] = ["SMALL"];
const SM: GameSize[] = ["SMALL", "MEDIUM"];
const SML: GameSize[] = ["SMALL", "MEDIUM", "LARGE"];
const ML: GameSize[] = ["MEDIUM", "LARGE"];
const L: GameSize[] = ["LARGE"];

/**
 * Base rewards from the rulebook:
 * - Matching:     draw 3 keep 1
 * - Measuring:    draw 3 keep 1
 * - Radar:        draw 2 keep 1
 * - Thermometer:  draw 2 keep 1
 * - Photo:        draw 1 keep 1
 * - Tentacle:     draw 4 keep 2
 *
 * Curse of the Overflowing Chalice overrides rewards to:
 * - Matching:     draw 4 keep 1
 * - Measuring:    draw 4 keep 1
 * - Thermometer:  draw 3 keep 1
 * - Radar:        draw 3 keep 1
 * - Photo:        draw 2 keep 1
 * - Tentacle:     draw 5 keep 2
 */
export function getDrawKeep(
  category: Category,
  opts?: { overflowingChalice?: boolean }
) {
  const oc = !!opts?.overflowingChalice;

  if (oc) {
    switch (category) {
      case "MATCHING":
        return { draw: 4, keep: 1 };
      case "MEASURING":
        return { draw: 4, keep: 1 };
      case "THERMO":
        return { draw: 3, keep: 1 };
      case "RADAR":
        return { draw: 3, keep: 1 };
      case "PHOTO":
        return { draw: 2, keep: 1 };
      case "TENTACLE":
        return { draw: 5, keep: 2 };
    }
  }

  switch (category) {
    case "MATCHING":
    case "MEASURING":
      return { draw: 3, keep: 1 };
    case "RADAR":
    case "THERMO":
      return { draw: 2, keep: 1 };
    case "PHOTO":
      return { draw: 1, keep: 1 };
    case "TENTACLE":
      return { draw: 4, keep: 2 };
  }
}

/* =========================
   QUESTIONS
   ========================= */

function matching(label: string): QuestionDef {
  return {
    category: "MATCHING",
    key: `matching.${slug(label)}`,
    text: `Is your nearest ${label} the same as my ${label}?`,
    sizes: SML,
  };
}

function measuring(label: string): QuestionDef {
  return {
    category: "MEASURING",
    key: `measuring.${slug(label)}`,
    text: `Compared to me, are you closer to or further from ${label}?`,
    sizes: SML,
  };
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const QUESTIONS: QuestionDef[] = [
  /* ---------- MATCHING (all sizes) ---------- */
  // Transit
  matching("Commercial Airport"),
  matching("Transit Line"),
  matching("Station Name's Length"),
  matching("Street or Path"),

  // Administrative divisions
  matching("1st Administrative Division"),
  matching("2nd Administrative Division"),
  matching("3rd Administrative Division"),
  matching("4th Administrative Division"),

  // Natural
  matching("Mountain"),
  matching("Landmass"),
  matching("Park"),

  // Places of interest
  matching("Amusement Park"),
  matching("Zoo"),
  matching("Aquarium"),
  matching("Golf Course"),
  matching("Museum"),
  matching("Movie Theater"),

  // Public utilities
  matching("Hospital"),
  matching("Library"),
  matching("Foreign Consulate"),

  /* ---------- MEASURING (all sizes) ---------- */
  // Transit-related
  measuring("Commercial Airport"),
  measuring("High-Speed Train Line"),
  measuring("Rail Station"),

  // Borders
  measuring("International Border"),
  measuring("1st Administrative Division Border"),
  measuring("2nd Administrative Division Border"),

  // Natural
  measuring("Sea Level"),
  measuring("Body of Water"),
  measuring("Coastline"),
  measuring("Mountain"),
  measuring("Park"),

  // Places of interest / utilities (continuing same list style used in the book sections)
  measuring("Zoo"),
  measuring("Aquarium"),
  measuring("Golf Course"),
  measuring("Museum"),
  measuring("Movie Theater"),
  measuring("Hospital"),
  measuring("Library"),
  measuring("Foreign Consulate"),

  /* ---------- RADAR (all sizes) ---------- */
  {
    category: "RADAR",
    key: "radar.500m",
    text: "Are you within 500 m of me?",
    sizes: SML,
  },
  { category: "RADAR", key: "radar.1km", text: "Are you within 1 km of me?", sizes: SML },
  { category: "RADAR", key: "radar.2km", text: "Are you within 2 km of me?", sizes: SML },
  { category: "RADAR", key: "radar.5km", text: "Are you within 5 km of me?", sizes: SML },
  { category: "RADAR", key: "radar.10km", text: "Are you within 10 km of me?", sizes: SML },
  { category: "RADAR", key: "radar.15km", text: "Are you within 15 km of me?", sizes: SML },
  { category: "RADAR", key: "radar.40km", text: "Are you within 40 km of me?", sizes: SML },
  { category: "RADAR", key: "radar.80km", text: "Are you within 80 km of me?", sizes: SML },
  { category: "RADAR", key: "radar.160km", text: "Are you within 160 km of me?", sizes: SML },
  {
    category: "RADAR",
    key: "radar.choose",
    text: "Are you within (choose a distance) of me?",
    sizes: SML,
  },

  /* ---------- THERMOMETER ---------- */
  // Small
  {
    category: "THERMO",
    key: "thermo.1km",
    text: "After traveling 1 km, am I hotter or colder?",
    sizes: SML,
  },
  {
    category: "THERMO",
    key: "thermo.5km",
    text: "After traveling 5 km, am I hotter or colder?",
    sizes: SML,
  },
  // Medium + Large add:
  {
    category: "THERMO",
    key: "thermo.15km",
    text: "After traveling 15 km, am I hotter or colder?",
    sizes: ML,
  },
  // Large add:
  {
    category: "THERMO",
    key: "thermo.75km",
    text: "After traveling 75 km, am I hotter or colder?",
    sizes: L,
  },

  /* ---------- PHOTO ---------- */
  // Small questions
  {
    category: "PHOTO",
    key: "photo.any_building_visible_from_transit_station",
    text: "Send me a photo of: Any Building Visible from a Transit Station",
    sizes: SML,
  },
  { category: "PHOTO", key: "photo.you", text: "Send me a photo of: You", sizes: SML },
  { category: "PHOTO", key: "photo.sky", text: "Send me a photo of: The Sky", sizes: SML },

  // Medium + Large add:
  {
    category: "PHOTO",
    key: "photo.tallest_building_visible_from_transit_station",
    text: "Send me a photo of: Tallest Building Visible from a Transit Station",
    sizes: ML,
  },
  {
    category: "PHOTO",
    key: "photo.grocery_store_aisle",
    text: "Send me a photo of: A Grocery Store Aisle",
    sizes: ML,
  },
  {
    category: "PHOTO",
    key: "photo.place_of_worship",
    text: "Send me a photo of: A Place of Worship",
    sizes: ML,
  },
  {
    category: "PHOTO",
    key: "photo.train_platform",
    text: "Send me a photo of: A Train Platform",
    sizes: ML,
  },

  // Large add:
  {
    category: "PHOTO",
    key: "photo.1km_of_streets_traced",
    text: "Send me a photo of: 1 km of Streets Traced",
    sizes: L,
  },
  {
    category: "PHOTO",
    key: "photo.tallest_mountain_visible_from_transit_station",
    text: "Send me a photo of: Tallest Mountain Visible from a Transit Station",
    sizes: L,
  },
  {
    category: "PHOTO",
    key: "photo.biggest_body_of_water_in_your_zone",
    text: "Send me a photo of: The Biggest Body of Water in Your Zone",
    sizes: L,
  },
  {
    category: "PHOTO",
    key: "photo.five_buildings",
    text: "Send me a photo of: 5 Buildings",
    sizes: L,
  },

  /* ---------- TENTACLE (NO SMALL) ---------- */
  // Medium
  {
    category: "TENTACLE",
    key: "tentacle.museums_within_2km",
    text: "Within 2 km of me, which Museum are you nearest to? (You must also be within 2 km.)",
    sizes: ML,
  },
  {
    category: "TENTACLE",
    key: "tentacle.libraries_within_2km",
    text: "Within 2 km of me, which Library are you nearest to? (You must also be within 2 km.)",
    sizes: ML,
  },
  {
    category: "TENTACLE",
    key: "tentacle.movie_theaters_within_2km",
    text: "Within 2 km of me, which Movie Theater are you nearest to? (You must also be within 2 km.)",
    sizes: ML,
  },
  {
    category: "TENTACLE",
    key: "tentacle.hospitals_within_2km",
    text: "Within 2 km of me, which Hospital are you nearest to? (You must also be within 2 km.)",
    sizes: ML,
  },

  // Large add:
  {
    category: "TENTACLE",
    key: "tentacle.metro_lines_within_25km",
    text: "Within 25 km of me, which Metro Line are you nearest to? (You must also be within 25 km.)",
    sizes: L,
  },
  {
    category: "TENTACLE",
    key: "tentacle.zoos_within_25km",
    text: "Within 25 km of me, which Zoo are you nearest to? (You must also be within 25 km.)",
    sizes: L,
  },
  {
    category: "TENTACLE",
    key: "tentacle.aquariums_within_25km",
    text: "Within 25 km of me, which Aquarium are you nearest to? (You must also be within 25 km.)",
    sizes: L,
  },
];

/**
 * Convenience helpers (optional to use in UI)
 */
export function questionsForSize(size: GameSize) {
  return QUESTIONS.filter((q) => q.sizes.includes(size));
}

export function questionsForSizeAndCategory(size: GameSize, category: Category) {
  return QUESTIONS.filter((q) => q.category === category && q.sizes.includes(size));
}
