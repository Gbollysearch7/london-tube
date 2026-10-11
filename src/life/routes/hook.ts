import { Journey } from "../../game/engine";
import type { Charge, Mission } from "../../game/types";
import { passesFor } from "../economy/passes";
import { isWorkday, type LedgerEntry, type LifeState, type Result } from "../engine";
import type { LifeEvent } from "../events";
import { LINK_BY_ID, addToCap, capSpend, memoryOf, railZones, rememberRoute } from "./routes";

const DAY = 24 * 60;
const MAX_LEDGER = 120;

type TripEvent = Extract<LifeEvent, { type: "trip" }>;

/** Fares for a ridden route: the live charges if the event carries them, else a deterministic replay. */
function tripCharges(s: LifeState, ev: TripEvent): Charge[] {
  const live = (ev as { charges?: Charge[] }).charges;
  if (live) return live;
  const links = ev.route.map((id) => LINK_BY_ID[id]).filter(Boolean);
  if (!links.length) return [];
  const mission: Mission = {
    id: "cap-replay",
    title: "",
    brief: "",
    from: ev.from,
    to: ev.to,
    start: ev.start,
    deadline: ev.start + DAY,
    budget: 1e9,
    weekday: isWorkday(s.day + Math.floor(ev.start / DAY)),
    weather: "clear",
    closedLines: [],
    tip: "",
    passes: passesFor(s),
  };
  const j = new Journey(mission, links, null);
  j.runToEnd();
  return j.meter.charges;
}

function credit(s: LifeState, label: string, amount: number): LifeState {
  const entry: LedgerEntry = { day: s.day, clock: s.clock, label, amount };
  return { ...s, money: Math.round((s.money + amount) * 100) / 100, ledger: [entry, ...s.ledger].slice(0, MAX_LEDGER) };
}

/** Remembers each trip's route and refunds anything over the daily cap. */
export function routesHook(s: LifeState, ev: LifeEvent): Result {
  if (ev.type !== "trip") return { state: s, events: [] };
  const mem = memoryOf(s);
  const links = ev.route.map((id) => LINK_BY_ID[id]).filter(Boolean);

  const spend = capSpend(tripCharges(s, ev));
  // Never refund more than was actually paid for this trip (the replay is only an estimate).
  const paid = Math.max(0, ev.cost);
  const rail = Math.min(spend.rail, paid);
  const bus = Math.min(spend.bus, Math.max(0, paid - rail));
  const { cap, refund } = addToCap(mem.cap, s.day, { rail, bus }, railZones(links));

  let next: LifeState = { ...s, routes: { ...rememberRoute(mem, ev.from, ev.to, ev.route, s.day), cap } };
  const events: string[] = [];
  if (refund > 0) {
    next = credit(next, "Daily cap refund", refund);
    events.push(`🎫 Daily cap reached: £${refund.toFixed(2)} refunded.`);
  }
  return { state: next, events };
}
