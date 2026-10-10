import { STATION, isRail, LINE } from "./network";
import type { Charge, Link } from "./types";

// Game-scale pay-as-you-go fares, modelled on London's real rules:
// rail fares by zones and peak time, the bus Hopper, hire-bike blocks and a flat river fare.

export const BUS_FARE = 1.75;
export const HOPPER_MINUTES = 60;
export const BIKE_FARE = 1.65;
export const BIKE_BLOCK_MINUTES = 30;
export const BOAT_FARE = 5.2;

const RAIL_FARES: { zones: string; peak: number; off: number }[] = [
  { zones: "1-1", peak: 2.9, off: 2.8 },
  { zones: "1-2", peak: 3.5, off: 2.9 },
  { zones: "1-3", peak: 3.9, off: 3.1 },
  { zones: "2-2", peak: 2.1, off: 2.0 },
  { zones: "2-3", peak: 2.2, off: 2.0 },
  { zones: "3-3", peak: 2.1, off: 2.0 },
];

export function isPeak(minute: number, weekday: boolean): boolean {
  if (!weekday) return false;
  return (minute >= 390 && minute < 570) || (minute >= 960 && minute < 1140);
}

export function railFare(zones: Iterable<number>, peak: boolean): number {
  const list = [...zones];
  const key = `${Math.min(...list)}-${Math.max(...list)}`;
  const row = RAIL_FARES.find((r) => r.zones === key) ?? RAIL_FARES[2];
  return peak ? row.peak : row.off;
}

export function zoneLabel(zones: Iterable<number>): string {
  const list = [...zones];
  const lo = Math.min(...list);
  const hi = Math.max(...list);
  return lo === hi ? `zone ${lo}` : `zones ${lo}–${hi}`;
}

/**
 * Tracks taps across a journey. Consecutive rail legs count as one journey
 * (you change inside the barriers); leaving the barriers ends it.
 */
export class FareMeter {
  charges: Charge[] = [];
  private rail: { touchIn: number; zones: Set<number> } | null = null;
  private hopperStart: number | null = null;
  private bikeStart: number | null = null;

  constructor(private weekday: boolean) {}

  get total(): number {
    return Math.round(this.charges.reduce((s, c) => s + c.amount, 0) * 100) / 100;
  }

  /** Arriving at the stop / platform, before any wait. */
  touchIn(link: Link, time: number) {
    if (isRail(link.mode) && !this.rail) {
      this.rail = { touchIn: time, zones: new Set([STATION[link.from].zone]) };
    }
  }

  /** Stepping aboard after the wait. */
  board(link: Link, time: number) {
    if (link.mode === "bus") this.busTap(time, LINE[link.line].name);
    if (link.mode === "boat") this.add(`${LINE[link.line].name}`, BOAT_FARE, time);
    if (link.mode === "bike" && this.bikeStart === null) this.bikeStart = time;
  }

  /** Arriving at the end of a hop. `next` is the following hop, if any. */
  alight(link: Link, time: number, next: Link | undefined) {
    if (isRail(link.mode) && this.rail) {
      this.rail.zones.add(STATION[link.to].zone);
      if (!next || !isRail(next.mode)) this.endRail(time);
    }
    if (link.mode === "bike" && this.bikeStart !== null && next?.mode !== "bike") {
      const blocks = Math.max(1, Math.ceil((time - this.bikeStart) / BIKE_BLOCK_MINUTES));
      this.add(`Hire bike (${blocks} × 30 min)`, blocks * BIKE_FARE, time);
      this.bikeStart = null;
    }
  }

  /** Bus tap with the Hopper rule: unlimited buses within an hour of the first tap. */
  busTap(time: number, label: string): number {
    if (this.hopperStart !== null && time - this.hopperStart < HOPPER_MINUTES) {
      this.add(`${label} (Hopper — free)`, 0, time);
      return 0;
    }
    this.hopperStart = time;
    this.add(label, BUS_FARE, time);
    return BUS_FARE;
  }

  hopperActive(time: number): boolean {
    return this.hopperStart !== null && time - this.hopperStart < HOPPER_MINUTES;
  }

  add(label: string, amount: number, time: number) {
    this.charges.push({ label, amount: Math.round(amount * 100) / 100, time });
  }

  private endRail(time: number) {
    if (!this.rail) return;
    const peak = isPeak(this.rail.touchIn, this.weekday);
    const fare = railFare(this.rail.zones, peak);
    this.add(`Rail fare, ${zoneLabel(this.rail.zones)} ${peak ? "(peak)" : "(off-peak)"}`, fare, time);
    this.rail = null;
  }
}
