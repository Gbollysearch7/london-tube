import { estimate } from "../../game/engine";
import { LINE, LINKS, STATION, isRail } from "../../game/network";
import { solve } from "../../game/solver";
import type { Charge, Link, Mission } from "../../game/types";
import { JOB, SHIFT_CUTOFF, VENUES } from "../data";
import { dayDisruption, tripMission, type LifeState } from "../engine";
import type { DayCap, RememberedRoute, RouteMemory } from "./types";

// Pure rules for remembered routes, one-tap trips and the daily cap.

export const LINK_BY_ID: Record<string, Link> = Object.fromEntries(LINKS.map((l) => [l.id, l]));

const MAX_ROUTES = 24;
export const routeKey = (from: string, to: string) => `${from}>${to}`;

export function memoryOf(s: LifeState): RouteMemory {
  return s.routes ?? {};
}

/** Remember the route just ridden from→to. */
export function rememberRoute(mem: RouteMemory, from: string, to: string, links: string[], day: number): RouteMemory {
  if (from === to || !links.length) return mem;
  const trips = { ...(mem.trips ?? {}) };
  const key = routeKey(from, to);
  const prev = trips[key];
  trips[key] = { from, to, links: [...links], count: (prev?.count ?? 0) + 1, lastDay: day };
  const keys = Object.keys(trips);
  if (keys.length > MAX_ROUTES) {
    // Forget the least-used, oldest route.
    keys.sort((a, b) => trips[a].count - trips[b].count || trips[a].lastDay - trips[b].lastDay);
    delete trips[keys[0]];
  }
  return { ...mem, trips };
}

// --- daily cap -----------------------------------------------------------------------------

export const BUS_CAP = 5.25;

/** Game-scale rail cap for the zones travelled today (it covers buses too). */
export function railCap(zlo: number, zhi: number): number {
  if (zlo === 1) return zhi <= 2 ? 8.9 : 10.5;
  return 7.5;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** What today's travel should cost after capping. */
export function cappedSpend(c: DayCap): number {
  const bus = Math.min(c.bus, BUS_CAP);
  return c.zlo > 0 ? round(Math.min(c.rail + bus, railCap(c.zlo, c.zhi))) : round(bus);
}

const BUS_LABEL = /^(Bus \d|Diversion bus|Replacement bus)/;

/** Rail and bus pay-as-you-go spend in a list of charges (snacks, cabs and boats don't count). */
export function capSpend(charges: Charge[]): { rail: number; bus: number } {
  let rail = 0;
  let bus = 0;
  for (const c of charges) {
    if (c.label.startsWith("Rail fare")) rail += c.amount;
    else if (BUS_LABEL.test(c.label)) bus += c.amount;
  }
  return { rail: round(rail), bus: round(bus) };
}

/** Add a trip to today's tally; returns the new tally and any refund now due. */
export function addToCap(prev: DayCap | undefined, day: number, spend: { rail: number; bus: number }, zones: number[]): { cap: DayCap; refund: number } {
  const base: DayCap = prev && prev.day === day ? prev : { day, rail: 0, bus: 0, zlo: 0, zhi: 0, refunded: 0 };
  // Without zones we can't know the rail cap, so leave unknown rail spend out of the tally (never over-refund).
  const railKnown = zones.length > 0 || base.zlo > 0;
  const cap: DayCap = {
    ...base,
    rail: round(base.rail + (railKnown ? spend.rail : 0)),
    bus: round(base.bus + spend.bus),
    zlo: zones.length ? Math.min(base.zlo || Infinity, ...zones) : base.zlo,
    zhi: zones.length ? Math.max(base.zhi, ...zones) : base.zhi,
  };
  const refund = round(Math.max(0, cap.rail + cap.bus - cappedSpend(cap) - cap.refunded));
  return { cap: { ...cap, refunded: round(cap.refunded + refund), lastRefund: refund }, refund };
}

/** Rail zones touched by a route. */
export function railZones(links: Link[]): number[] {
  const z = new Set<number>();
  for (const l of links) if (isRail(l.mode)) z.add(STATION[l.from].zone).add(STATION[l.to].zone);
  return [...z];
}

// --- one-tap trips ---------------------------------------------------------------------------

export type QuickKind = "commute" | "home" | "usual";

export interface QuickTrip {
  to: string;
  kind: QuickKind;
  label: string;
  emoji: string;
  mission: Mission;
  /** Remembered ("usual") or solver-picked ("suggested") route; empty when you must plan. */
  links: Link[];
  source: "usual" | "suggested" | "none";
  arrival?: number;
  cost?: number;
  /** Set when the route can't be ridden as-is: open the planner instead. */
  warning?: string;
  /** Running but slow, e.g. "Delays on the Northern line". */
  note?: string;
  /** A clearly better route today than your usual one (cheaper, or much faster). */
  better?: { links: Link[]; arrival: number; cost: number; why: string };
}

/** Turn remembered link ids back into a route, or null if the network no longer has it. */
export function rebuildRoute(ids: string[], from: string, to: string): Link[] | null {
  const links = ids.map((id) => LINK_BY_ID[id]);
  if (!links.length || links.some((l) => !l)) return null;
  if (links[0].from !== from || links[links.length - 1].to !== to) return null;
  for (let i = 1; i < links.length; i++) if (links[i].from !== links[i - 1].to) return null;
  return links;
}

function lineName(id: string) {
  return LINE[id]?.name ?? id;
}

function hitReason(s: LifeState, line: string): string {
  const d = dayDisruption(s);
  if (d.closed.includes(line)) return d.kind === "strike" ? `the ${lineName(line)} strike` : `engineering works on the ${lineName(line)}`;
  return `the ${lineName(line)} not running now`;
}

const SOLVE_CACHE = new Map<string, Link[] | null>();

/** Solver suggestion for a mission, memoised (the hub re-renders often). */
export function suggestRoute(m: Mission): Link[] | null {
  // Start and deadline rounded to 10 minutes so the cache survives small clock changes (peak
  // boundaries fall on the hour or half hour, so the route choice doesn't change within a bucket).
  const key = [m.from, m.to, Math.floor(m.start / 10), Math.floor(m.deadline / 10), m.weekday, m.weather, m.closedLines.join(","), JSON.stringify(m.delayedLines ?? {}), JSON.stringify(m.passes ?? {})].join("|");
  if (SOLVE_CACHE.has(key)) return SOLVE_CACHE.get(key)!;
  const r = solve(m);
  // What a Londoner would actually take: the cheapest on-time route only if it isn't much slower.
  // (Otherwise a 07:00 start "suggests" walking for two hours because it's free.)
  const f = r.fastest;
  let pick = f ?? r.cheapestOnTime;
  if (f) {
    // Cheapest route that arrives within 12 minutes of the fastest (and still by the deadline).
    const near = solve({ ...m, deadline: Math.min(Math.max(m.deadline, f.est.arrival), f.est.arrival + 12) }).cheapestOnTime;
    if (near && near.est.cost < f.est.cost) pick = near;
  }
  const route = pick?.route ?? null;
  if (SOLVE_CACHE.size > 40) SOLVE_CACHE.delete(SOLVE_CACHE.keys().next().value!);
  SOLVE_CACHE.set(key, route);
  return route;
}

/** Check a route against today's network and price it. */
export function evaluate(s: LifeState, base: Omit<QuickTrip, "links" | "source">, remembered: RememberedRoute | undefined): QuickTrip {
  const m = base.mission;
  const usual = remembered ? rebuildRoute(remembered.links, m.from, m.to) : null;
  if (usual) {
    const hit = usual.find((l) => m.closedLines.includes(l.line));
    if (hit) return { ...base, links: usual, source: "usual", warning: `Your usual route is hit by ${hitReason(s, hit.line)}` };
  }
  const links = usual ?? suggestRoute(m);
  if (!links) return { ...base, links: [], source: "none", warning: "No route right now" };
  const est = estimate(m, links);
  const source = usual ? "usual" : "suggested";
  if (est.cost > m.budget) return { ...base, links, source, arrival: est.arrival, cost: est.cost, warning: "You can't afford this route" };
  const slow = [...new Set(links.filter((l) => (m.delayedLines?.[l.line] ?? 1) > 1).map((l) => l.line))];
  return {
    ...base,
    links,
    source,
    arrival: est.arrival,
    cost: est.cost,
    note: slow.length ? `Delays on the ${slow.map(lineName).join(" and ")}` : undefined,
    better: usual ? betterThan(m, usual, est.arrival, est.cost) : undefined,
  };
}

/** Today's suggestion, if it clearly beats your usual route (e.g. you bought a travelcard, or a line is slow). */
function betterThan(m: Mission, usual: Link[], arrival: number, cost: number): QuickTrip["better"] {
  const alt = suggestRoute(m);
  if (!alt || alt.map((l) => l.id).join() === usual.map((l) => l.id).join()) return undefined;
  const e = estimate(m, alt);
  if (e.cost > m.budget) return undefined;
  if (e.cost <= cost - 0.5 && e.arrival <= arrival + 5) return { links: alt, arrival: e.arrival, cost: e.cost, why: `£${(cost - e.cost).toFixed(2)} cheaper` };
  if (e.arrival <= arrival - 8 && e.cost <= cost + 0.5) return { links: alt, arrival: e.arrival, cost: e.cost, why: `${arrival - e.arrival} min faster` };
  return undefined;
}

/** Up to four one-tap trips from where you are now. */
export function quickTrips(s: LifeState, max = 4): QuickTrip[] {
  const trips = memoryOf(s).trips ?? {};
  const work = JOB[s.job]?.station;
  const targets: { to: string; kind: QuickKind; label: string; emoji: string }[] = [];
  const add = (t: (typeof targets)[number]) => {
    if (t.to && t.to !== s.location && STATION[t.to] && !targets.some((x) => x.to === t.to)) targets.push(t);
  };
  // After 11:00 the day is a write-off, so don't offer the commute (the hub's other cards agree).
  if (work && s.work === "pending" && s.clock < SHIFT_CUTOFF) add({ to: work, kind: "commute", label: "Commute to work", emoji: "💼" });
  if (s.location !== s.home) add({ to: s.home, kind: "home", label: "Home", emoji: "🏠" });
  const mine = Object.values(trips)
    .filter((r) => r.from === s.location)
    .sort((a, b) => b.count - a.count || b.lastDay - a.lastDay);
  for (const r of mine) {
    const venue = VENUES.find((v) => v.station === r.to);
    add({ to: r.to, kind: "usual", label: venue ? venue.name : STATION[r.to].name, emoji: venue?.emoji ?? "📍" });
  }
  return targets.slice(0, max).map((t) => evaluate(s, { ...t, mission: tripMission(s, t.to) }, trips[routeKey(s.location, t.to)]));
}
