import { LINE, LINKS, STATIONS } from "../../game/network";

// What you can buy. Wealth changes what you own in the city, never whether you can ride it,
// so everything here ties back to stations, lines, fares or commuters.

export type ShopCategory = "travel" | "comfort" | "home" | "business" | "status";

export interface ShopItem {
  id: string;
  cat: ShopCategory;
  name: string;
  emoji: string;
  price: number;
  /** Lasts this many game days; renewing adds more. Omitted = yours for good. */
  days?: number;
  blurb: string;
  /** Needs a station or a line choosing at checkout. */
  needs?: "station" | "line";
}

export const SHOP: ShopItem[] = [
  { id: "travelcard-2", cat: "travel", name: "Weekly Travelcard, zones 1–2", emoji: "🎫", price: 44, days: 7, blurb: "Tube, rail and buses in zones 1–2 at no extra cost for 7 days." },
  { id: "travelcard-3", cat: "travel", name: "Weekly Travelcard, zones 1–3", emoji: "🎫", price: 52, days: 7, blurb: "Tube, rail and buses in zones 1–3 at no extra cost for 7 days." },
  { id: "bus-pass", cat: "travel", name: "Weekly bus & tram pass", emoji: "🚌", price: 25, days: 7, blurb: "Every bus free for 7 days." },
  { id: "railcard", cat: "travel", name: "Railcard", emoji: "🚆", price: 30, days: 182, blurb: "A third off off-peak rail fares for 26 weeks." },
  { id: "bike", cat: "travel", name: "Your own bike", emoji: "🚲", price: 250, blurb: "Cycle for free: no more hire-bike charges." },
  { id: "headphones", cat: "comfort", name: "Noise-cancelling headphones", emoji: "🎧", price: 120, blurb: "Win back half the fun a stressful trip costs you." },
  { id: "outfit", cat: "comfort", name: "Smart work outfit", emoji: "👔", price: 90, blurb: "+2 performance every shift. Dress for the job you want." },
  { id: "bed", cat: "home", name: "Proper mattress", emoji: "🛏️", price: 180, blurb: "+8 energy every morning." },
  { id: "kitchen", cat: "home", name: "Kitchen kit", emoji: "🍳", price: 150, blurb: "Batch cooking: +10 hunger every morning." },
  { id: "telly", cat: "home", name: "Big telly", emoji: "📺", price: 220, blurb: "+6 fun every morning." },
  { id: "plants", cat: "home", name: "House plants", emoji: "🪴", price: 40, blurb: "+3 fun and +3 social every morning." },
  { id: "advert", cat: "business", name: "Line advert", emoji: "📣", price: 75, days: 7, needs: "line", blurb: "Posters on one line for 7 days: +35% takings at your businesses on it." },
  { id: "gold-oyster", cat: "status", name: "Gold Oyster card", emoji: "🪙", price: 400, blurb: "Same fares. Much shinier tap." },
  { id: "poster", cat: "status", name: "Poster with your name", emoji: "🖼️", price: 150, needs: "station", blurb: "Your face on a platform poster. Commuters will wonder who you are." },
  { id: "carriage", cat: "status", name: "Sponsored carriage", emoji: "🚇", price: 1200, needs: "line", blurb: "One carriage on a line carries your name. Permanently." },
];

export const ITEM: Record<string, ShopItem> = Object.fromEntries(SHOP.map((i) => [i.id, i]));

export const CATEGORIES: { id: ShopCategory; label: string }[] = [
  { id: "travel", label: "🎫 Travel" },
  { id: "comfort", label: "🎧 Comfort" },
  { id: "home", label: "🏠 Home" },
  { id: "business", label: "☕ Business" },
  { id: "status", label: "✨ Status" },
];

// --- station businesses ---------------------------------------------------------------

/**
 * Approximate annual entries and exits (millions), roughly in line with recent TfL and ORR
 * figures. Approximate: good enough to make busy stations feel busy.
 */
export const FOOTFALL: Record<string, number> = {
  paddington: 60, baker: 25, nhg: 18, shepherds: 16, oxford: 70, greenpark: 40, victoria: 75,
  westminster: 20, waterloo: 85, leicester: 35, tcr: 60, euston: 45, kingscross: 80, camden: 18,
  highbury: 35, farringdon: 45, bank: 70, liverpool: 95, shoreditch: 8, whitechapel: 25,
  londonbridge: 70, canadawater: 25, canarywharf: 55, stratford: 100, hackney: 10, vauxhall: 30,
  stockwell: 10, brixton: 25, claphamcommon: 8, claphamjn: 25, peckham: 10,
};

export interface Tier {
  name: string;
  emoji: string;
  /** Cost to reach this tier from the one below, at an average station. */
  cost: number;
  /** Takings per day at an average station. */
  daily: number;
}

// Each step pays back in roughly 3–4 game weeks.
export const TIERS: Tier[] = [
  { name: "Coffee cart", emoji: "☕", cost: 300, daily: 15 },
  { name: "Kiosk", emoji: "🥐", cost: 700, daily: 40 },
  { name: "Café", emoji: "🧁", cost: 1800, daily: 105 },
  { name: "Small chain", emoji: "🏪", cost: 4500, daily: 270 },
];

export const MAX_BUSINESSES = 3;
export const ADVERT_BOOST = 1.35;

/** Busier stations cost more to trade at and take more: 0.53 (quiet) to 2.07 (Stratford). */
export const pitchFactor = (station: string) => 0.4 + (FOOTFALL[station] ?? 20) / 60;

export const tierCost = (station: string, tier: number) => Math.round(TIERS[tier].cost * pitchFactor(station));

/** Lines (not walking or cycling) that call at a station. */
export function linesAt(station: string): string[] {
  const out = new Set<string>();
  for (const l of LINKS) if ((l.from === station || l.to === station) && l.mode !== "walk" && l.mode !== "bike") out.add(l.line);
  return [...out];
}

/** Lines you can advertise on or sponsor a carriage on: anything with stations, not your feet. */
export const AD_LINES = Object.keys(LINE).filter((id) => id !== "walk" && id !== "bike");

export const STATION_IDS = STATIONS.map((s) => s.id);
