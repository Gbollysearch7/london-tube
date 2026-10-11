import { STATION, isRail, LINE } from "./network";
import type { Charge, Link, Passes } from "./types";

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

/** Railcard price: a third off, rounded to the nearest 5p. */
export function railcardFare(fare: number): number {
  return Math.round(((fare * 2) / 3) * 20) / 20;
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

  private passes: Passes;

  constructor(
    private weekday: boolean,
    passes?: Passes,
  ) {
    this.passes = passes ?? {};
  }

  get total(): number {
    return Math.round(this.charges.reduce((s, c) => s + c.amount, 0) * 100) / 100;
  }

  /** Arriving at the stop / platform, before any wait. */
  touchIn(link: Link, time: number) {
    if (isRail(link.mode) && !this.rail) {
      this.rail = { touchIn: time, zones: new Set([STATION[link.from].zone]) };
    }
  }

  /** Stepping aboard after the wait. `continuing` means staying on the same vehicle. */
  board(link: Link, time: number, continuing = false) {
    if (continuing && (link.mode === "bus" || link.mode === "boat")) return;
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
      if (this.passes.ownBike) this.add("Cycling (own bike)", 0, time);
      else {
        const blocks = Math.max(1, Math.ceil((time - this.bikeStart) / BIKE_BLOCK_MINUTES - 1e-6));
        this.add(`Hire bike (${blocks} × 30 min)`, blocks * BIKE_FARE, time);
      }
      this.bikeStart = null;
    }
  }

  /** Bus tap with the Hopper rule: unlimited buses within an hour of the first tap. */
  busTap(time: number, label: string): number {
    // A pass covers every bus; the Hopper still starts so the UI timer behaves the same.
    const pass = this.passes.travelcardZones ? "travelcard" : this.passes.busPass ? "bus pass" : null;
    if (pass) {
      if (this.hopperStart === null || time - this.hopperStart >= HOPPER_MINUTES) this.hopperStart = time;
      this.add(`${label} (${pass})`, 0, time);
      return 0;
    }
    if (this.hopperStart !== null && time - this.hopperStart < HOPPER_MINUTES) {
      this.add(`${label} (Hopper — free)`, 0, time);
      return 0;
    }
    this.hopperStart = time;
    this.add(label, BUS_FARE, time);
    return BUS_FARE;
  }

  hopperActive(time: number): boolean {
    return this.hopperRemaining(time) > 0;
  }

  /** Minutes left on the current bus Hopper, or 0. */
  hopperRemaining(time: number): number {
    return this.hopperStart === null ? 0 : Math.max(0, HOPPER_MINUTES - (time - this.hopperStart));
  }

  add(label: string, amount: number, time: number) {
    this.charges.push({ label, amount: Math.round(amount * 100) / 100, time });
  }

  private endRail(time: number) {
    if (!this.rail) return;
    const peak = isPeak(this.rail.touchIn, this.weekday);
    const zones = [...this.rail.zones];
    const base = `Rail fare, ${zoneLabel(zones)} ${peak ? "(peak)" : "(off-peak)"}`;
    this.rail = null;
    const card = this.passes.travelcardZones ?? 0;
    let fare: number;
    let note = "";
    if (card > 0 && zones.every((z) => z <= card)) {
      this.add(`${base} (travelcard)`, 0, time);
      return;
    }
    if (card > 0) {
      // Outside the travelcard: pay an extension fare for the zones it doesn't cover.
      const outside = zones.filter((z) => z > card);
      fare = railFare(outside.length < zones.length ? [card + 1, ...outside] : outside, peak);
      note = ` (travelcard + ${zoneLabel(outside)} extension)`;
    } else fare = railFare(zones, peak);
    if (this.passes.railcard && !peak) {
      fare = railcardFare(fare);
      note += " (railcard)";
    }
    this.add(base + note, fare, time);
  }
}
