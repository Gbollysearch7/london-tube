import { FareMeter, isPeak } from "./fares";
import { LINE, STATION, isRail } from "./network";
import { pickEvent, type EventInstance } from "./events";
import type { Link, Mission, Mode } from "./types";

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Typical wait at the stop before boarding, in minutes. */
const BASE_WAIT: Record<Mode, number> = {
  tube: 2,
  elizabeth: 3,
  overground: 4,
  dlr: 3,
  rail: 5,
  bus: 5,
  boat: 12,
  bike: 2,
  walk: 0,
};

/** Stress gained per minute on each mode (negative = calming). */
function stressRate(mode: Mode, peak: boolean, rain: boolean): number {
  switch (mode) {
    case "tube":
      return peak ? 0.8 : 0.3;
    case "elizabeth":
    case "overground":
    case "dlr":
    case "rail":
      return peak ? 0.5 : 0.2;
    case "bus":
      return peak ? 0.45 : 0.25;
    case "boat":
      return -0.4;
    case "walk":
      return rain ? 0.5 : -0.15;
    case "bike":
      return rain ? 0.7 : 0;
  }
}

export function expectedTravel(link: Link, peak: boolean, rain: boolean): number {
  let m = link.minutes;
  if (link.mode === "bus") m *= peak ? 1.3 : 1.1;
  if (link.mode === "walk" && rain) m *= 1.1;
  if (link.mode === "bike" && rain) m *= 1.3;
  return Math.max(1, Math.round(m));
}

/** Whether `link` carries straight on from `prev` without getting off. */
export function continues(prev: Link | undefined, link: Link): boolean {
  return !!prev && prev.line === link.line && link.mode !== "walk";
}

export interface LegSummary {
  link: Link;
  start: number;
  board: number;
  arrive: number;
}

export type Phase = "wait" | "move" | "done";

/**
 * Runs a planned route minute by minute. With no RNG it is deterministic and
 * event-free (used for planning estimates); with an RNG it adds real-world
 * variance and interruptions.
 */
export class Journey {
  clock: number;
  stress = 10;
  meter: FareMeter;
  legIdx = 0;
  phase: Phase = "wait";
  remaining = 0;
  phaseTotal = 0;
  pending: EventInstance | null = null;
  log: { time: number; text: string }[] = [];
  legs: LegSummary[] = [];

  private travel = 0;
  private scheduled: { event: EventInstance; at: number } | null = null;
  private eventsLeft: number;
  private peakAtStart: boolean;

  constructor(
    readonly mission: Mission,
    readonly route: Link[],
    private rng: Rng | null,
  ) {
    this.clock = mission.start;
    this.meter = new FareMeter(mission.weekday);
    this.eventsLeft = rng ? 4 : 0;
    this.peakAtStart = isPeak(mission.start, mission.weekday);
    this.startLeg(0);
  }

  get link(): Link | undefined {
    return this.route[this.legIdx];
  }

  get peak(): boolean {
    return isPeak(this.clock, this.mission.weekday);
  }

  get rain(): boolean {
    return this.mission.weather === "rain";
  }

  /** 0..1 progress through the current phase. */
  get progress(): number {
    return this.phaseTotal > 0 ? 1 - this.remaining / this.phaseTotal : 1;
  }

  get done(): boolean {
    return this.phase === "done";
  }

  /** Advance game time by up to `dt` minutes. Stops early if an event fires. */
  advance(dt: number) {
    let guard = 0;
    while (dt > 1e-9 && !this.done && !this.pending && guard++ < 1000) {
      const link = this.route[this.legIdx];
      let step = Math.min(dt, this.remaining);
      if (this.phase === "move" && this.scheduled) {
        const untilEvent = this.scheduled.at - (this.phaseTotal - this.remaining);
        if (untilEvent <= step) step = Math.max(0, untilEvent);
      }
      this.clock += step;
      this.remaining -= step;
      dt -= step;
      const rate =
        this.phase === "wait" ? (isRail(link.mode) && this.peak ? 0.3 : 0.1) : stressRate(link.mode, this.peak, this.rain);
      this.addStress(rate * step);

      if (this.phase === "move" && this.scheduled && this.phaseTotal - this.remaining >= this.scheduled.at - 1e-9) {
        this.pending = this.scheduled.event;
        this.scheduled = null;
        return;
      }
      if (this.remaining <= 1e-9) {
        if (this.phase === "wait") this.beginMove();
        else this.finishLeg();
      }
    }
  }

  runToEnd() {
    let guard = 0;
    while (!this.done && guard++ < 10000) {
      if (this.pending) throw new Error("runToEnd cannot resolve events");
      this.advance(1e6);
    }
  }

  resolve(choiceIdx: number) {
    const ev = this.pending;
    if (!ev) return;
    const choice = ev.choices[choiceIdx];
    const text = choice.apply(this);
    this.log.push({ time: this.clock, text: `${ev.title}: ${text}` });
    this.pending = null;
    // A delay may have pushed remaining past zero handling; settle it.
    if (this.remaining <= 1e-9 && !this.done) this.finishLeg();
  }

  // --- effects used by events ---
  delay(minutes: number) {
    this.remaining += minutes;
    this.phaseTotal += minutes;
  }

  addStress(n: number) {
    this.stress = Math.max(0, Math.min(100, this.stress + n));
  }

  roll(): number {
    return this.rng ? this.rng() : 0.5;
  }

  rollInt(min: number, max: number): number {
    return min + Math.floor(this.roll() * (max - min + 1));
  }

  // --- internals ---
  private startLeg(i: number) {
    this.legIdx = i;
    const link = this.route[i];
    if (!link) {
      this.phase = "done";
      this.remaining = 0;
      return;
    }
    const prev = this.route[i - 1];
    const cont = continues(prev, link);
    let wait = cont ? 0 : BASE_WAIT[link.mode];
    if (!cont && prev && isRail(prev.mode) && isRail(link.mode)) wait += 2; // interchange corridors
    if (this.rng && wait > 0) wait = Math.max(1, Math.round(wait * (0.4 + this.rng() * 1.3)));
    if (!cont && prev && link.mode !== "walk" && prev.mode !== "walk") this.addStress(2);

    let travel = expectedTravel(link, this.peak, this.rain);
    if (this.rng) {
      const spread = link.mode === "bus" ? (this.peak ? [0.85, 1.45] : [0.85, 1.25]) : isRail(link.mode) ? [0.95, 1.15] : [1, 1];
      travel = Math.max(1, Math.round(travel * (spread[0] + this.rng() * (spread[1] - spread[0]))));
    }
    this.travel = travel;
    this.meter.touchIn(link, this.clock);
    this.legs.push({ link, start: this.clock, board: this.clock + wait, arrive: this.clock + wait + travel });

    this.scheduled = null;
    if (this.rng && this.eventsLeft > 0 && travel >= 3) {
      const chance = 0.35 + (this.peakAtStart ? 0.1 : 0);
      if (this.rng() < chance) {
        const ev = pickEvent(this, link, this.rng);
        if (ev) {
          this.scheduled = { event: ev, at: travel * (0.25 + this.rng() * 0.5) };
          this.eventsLeft--;
        }
      }
    }

    this.phase = "wait";
    this.remaining = wait;
    this.phaseTotal = wait;
    if (wait <= 0) this.beginMove();
  }

  private beginMove() {
    const link = this.route[this.legIdx];
    this.meter.board(link, this.clock);
    this.phase = "move";
    this.remaining = this.travel;
    this.phaseTotal = this.travel;
  }

  private finishLeg() {
    const link = this.route[this.legIdx];
    const next = this.route[this.legIdx + 1];
    this.meter.alight(link, this.clock, next);
    const leg = this.legs[this.legs.length - 1];
    if (leg) leg.arrive = this.clock;
    this.startLeg(this.legIdx + 1);
  }
}

export interface Estimate {
  arrival: number;
  cost: number;
  stress: number;
  legs: LegSummary[];
}

export function estimate(mission: Mission, route: Link[]): Estimate {
  const j = new Journey(mission, route, null);
  j.runToEnd();
  return { arrival: j.clock, cost: j.meter.total, stress: Math.round(j.stress), legs: j.legs };
}

export function routeEndsAt(mission: Mission, route: Link[]): string {
  return route.length ? route[route.length - 1].to : mission.from;
}

export function describeLink(link: Link): string {
  const line = LINE[link.line];
  const to = STATION[link.to].name;
  if (link.mode === "walk") return `Walk to ${to}`;
  if (link.mode === "bike") return `Cycle to ${to}`;
  return `${line.name} → ${to}`;
}
