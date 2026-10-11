import type { Passes } from "../../game/types";
import type { LifeState } from "../engine";
import type { Owned } from "./types";

// Which travel passes the player holds today. Kept free of engine imports at runtime,
// because the engine imports this file.

/** An owned item that still works today (permanent items always do). */
export const isActive = (o: Owned, day: number) => o.expires === undefined || day < o.expires;

export function activeOwned(s: LifeState, id: string): Owned | undefined {
  return s.economy?.owned.find((o) => o.id === id && isActive(o, s.day));
}

export function passesFor(s: LifeState): Passes | undefined {
  if (!s.economy) return undefined;
  const p: Passes = {};
  if (activeOwned(s, "travelcard-3")) p.travelcardZones = 3;
  else if (activeOwned(s, "travelcard-2")) p.travelcardZones = 2;
  if (activeOwned(s, "bus-pass")) p.busPass = true;
  if (activeOwned(s, "railcard")) p.railcard = true;
  if (activeOwned(s, "bike")) p.ownBike = true;
  return Object.keys(p).length ? p : undefined;
}
