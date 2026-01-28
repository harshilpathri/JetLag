export type GameSize = "SMALL" | "MEDIUM" | "LARGE";
export type Category =
  | "MATCHING"
  | "MEASURING"
  | "RADAR"
  | "THERMO"
  | "PHOTO"
  | "TENTACLE";

export function getDrawKeep(category: Category) {
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

// Minimal example questions list (expand later)
export const QUESTIONS: { category: Category; key: string; text: string }[] = [
  { category: "RADAR", key: "radar.500m", text: "Are you within 500 m of me?" },
  { category: "RADAR", key: "radar.1km", text: "Are you within 1 km of me?" },
  {
    category: "MATCHING",
    key: "matching.commercial_airport",
    text: "Is your nearest Commercial Airport the same as my Commercial Airport?",
  },
];
