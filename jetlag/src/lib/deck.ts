// src/lib/deck.ts
// Full Hider Deck (100 cards), including ALL named curses

export type GameSize = "SMALL" | "MEDIUM" | "LARGE";

/* =========================
   CARD BASE TYPES
   ========================= */

export type CardBaseType =
  // Time cards
  | "TIME_RED"
  | "TIME_ORANGE"
  | "TIME_YELLOW"
  | "TIME_GREEN"
  | "TIME_BLUE"

  // Powerups
  | "RANDOMIZE"
  | "VETO"
  | "DUPLICATE"
  | "MOVE"
  | "DISCARD_1_DRAW_2"
  | "DISCARD_2_DRAW_3"
  | "DRAW_1_EXPAND_HAND"

  // Curses (explicit list)
  | "CURSE_ZOOLOGIST"
  | "CURSE_UNGUIDED_TOURIST"
  | "CURSE_ENDLESS_TUMBLE"
  | "CURSE_HIDDEN_HANGMAN"
  | "CURSE_OVERFLOWING_CHALICE"
  | "CURSE_MEDIOCRE_TRAVEL_AGENT"
  | "CURSE_LUXURY_CAR"
  | "CURSE_U_TURN"
  | "CURSE_BRIDGE_TROLL"
  | "CURSE_WATER_WEIGHT"
  | "CURSE_JAMMED_DOOR"
  | "CURSE_CAIRN"
  | "CURSE_URBAN_EXPLORER"
  | "CURSE_IMPRESSIONABLE_CONSUMER"
  | "CURSE_EGG_PARTNER"
  | "CURSE_DISTANT_CUISINE"
  | "CURSE_RIGHT_TURN"
  | "CURSE_LABYRINTH"
  | "CURSE_BIRD_GUIDE"
  | "CURSE_SPOTTY_MEMORY"
  | "CURSE_LEMON_PHYLACTERY"
  | "CURSE_DRAINED_BRAIN"
  | "CURSE_RANSOM_NOTE"
  | "CURSE_GAMBLERS_FEET";

/* =========================
   TIME BONUS VALUES
   ========================= */

export const TIME_BONUS_MINUTES: Record<
  "RED" | "ORANGE" | "YELLOW" | "GREEN" | "BLUE",
  Record<GameSize, number>
> = {
  RED: { SMALL: 2, MEDIUM: 3, LARGE: 5 },
  ORANGE: { SMALL: 4, MEDIUM: 6, LARGE: 10 },
  YELLOW: { SMALL: 6, MEDIUM: 9, LARGE: 15 },
  GREEN: { SMALL: 8, MEDIUM: 12, LARGE: 20 },
  BLUE: { SMALL: 12, MEDIUM: 18, LARGE: 30 },
};

/* =========================
   DECK COUNTS (TOTAL = 100)
   ========================= */

const COUNTS = {
  // Time cards (55)
  TIME_RED: 25,
  TIME_ORANGE: 15,
  TIME_YELLOW: 10,
  TIME_GREEN: 3,
  TIME_BLUE: 2,

  // Powerups (21)
  RANDOMIZE: 4,
  VETO: 4,
  DUPLICATE: 2,
  MOVE: 1,
  DISCARD_1_DRAW_2: 4,
  DISCARD_2_DRAW_3: 4,
  DRAW_1_EXPAND_HAND: 2,

  // Curses (24)
  CURSES: [
    "CURSE_ZOOLOGIST",
    "CURSE_UNGUIDED_TOURIST",
    "CURSE_ENDLESS_TUMBLE",
    "CURSE_HIDDEN_HANGMAN",
    "CURSE_OVERFLOWING_CHALICE",
    "CURSE_MEDIOCRE_TRAVEL_AGENT",
    "CURSE_LUXURY_CAR",
    "CURSE_U_TURN",
    "CURSE_BRIDGE_TROLL",
    "CURSE_WATER_WEIGHT",
    "CURSE_JAMMED_DOOR",
    "CURSE_CAIRN",
    "CURSE_URBAN_EXPLORER",
    "CURSE_IMPRESSIONABLE_CONSUMER",
    "CURSE_EGG_PARTNER",
    "CURSE_DISTANT_CUISINE",
    "CURSE_RIGHT_TURN",
    "CURSE_LABYRINTH",
    "CURSE_BIRD_GUIDE",
    "CURSE_SPOTTY_MEMORY",
    "CURSE_LEMON_PHYLACTERY",
    "CURSE_DRAINED_BRAIN",
    "CURSE_RANSOM_NOTE",
    "CURSE_GAMBLERS_FEET",
  ] as const,
};

/* =========================
   UNIQUE CARD INSTANCES
   ========================= */

function pad4(n: number) {
  return String(n).padStart(4, "0");
}

function makeInstances(base: string, count: number, start: number) {
  const out: string[] = [];
  let serial = start;
  for (let i = 0; i < count; i++) {
    out.push(`${base}::${pad4(serial++)}`);
  }
  return { cards: out, next: serial };
}

export function baseType(cardId: string) {
  const i = cardId.indexOf("::");
  return i === -1 ? cardId : cardId.slice(0, i);
}

/* =========================
   BUILD DECK
   ========================= */

export function buildHiderDeck(): string[] {
  let serial = 1;
  const deck: string[] = [];

  // Time cards
  for (const [base, count] of [
    ["TIME_RED", COUNTS.TIME_RED],
    ["TIME_ORANGE", COUNTS.TIME_ORANGE],
    ["TIME_YELLOW", COUNTS.TIME_YELLOW],
    ["TIME_GREEN", COUNTS.TIME_GREEN],
    ["TIME_BLUE", COUNTS.TIME_BLUE],
  ] as const) {
    const r = makeInstances(base, count, serial);
    deck.push(...r.cards);
    serial = r.next;
  }

  // Powerups
  for (const [base, count] of [
    ["RANDOMIZE", COUNTS.RANDOMIZE],
    ["VETO", COUNTS.VETO],
    ["DUPLICATE", COUNTS.DUPLICATE],
    ["MOVE", COUNTS.MOVE],
    ["DISCARD_1_DRAW_2", COUNTS.DISCARD_1_DRAW_2],
    ["DISCARD_2_DRAW_3", COUNTS.DISCARD_2_DRAW_3],
    ["DRAW_1_EXPAND_HAND", COUNTS.DRAW_1_EXPAND_HAND],
  ] as const) {
    const r = makeInstances(base, count, serial);
    deck.push(...r.cards);
    serial = r.next;
  }

  // Curses (exactly one of each)
  for (const curse of COUNTS.CURSES) {
    const r = makeInstances(curse, 1, serial);
    deck.push(...r.cards);
    serial = r.next;
  }

  if (deck.length !== 100) {
    throw new Error(`Hider deck must be 100 cards, got ${deck.length}`);
  }

  return deck;
}

/* =========================
   READY-TO-USE CONSTANT
   ========================= */

export const HIDER_DECK = buildHiderDeck();
