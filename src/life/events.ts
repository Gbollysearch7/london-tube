import type { Charge } from "../game/types";
import type { DaySummary, ShiftStyle } from "./engine";

/**
 * Things that happen in London Life. After every player action the store runs these through
 * the hooks (routes → economy → story), so each system can react without touching the others.
 */
export type LifeEvent =
  /** Game opened (after the streak/rested bonus). */
  | { type: "open"; now: number }
  /** Finished a trip. `route` is the list of link ids ridden. */
  | { type: "trip"; from: string; to: string; start: number; arrival: number; cost: number; stress: number; route: string[]; charges?: Charge[] }
  | { type: "shift"; style: ShiftStyle; lateBy: number; earned: number; promoted: boolean }
  | { type: "activity"; activityId: string; venueId?: string; cost: number }
  | { type: "hangout"; playerId: string }
  /** Sent a text to a real player. */
  | { type: "text" }
  /** Slept: the state is already the next morning. */
  | { type: "sleep"; summary: DaySummary; bedtime?: number }
  /** Finished the daily challenge (first scored run). */
  | { type: "daily"; stars: number };
