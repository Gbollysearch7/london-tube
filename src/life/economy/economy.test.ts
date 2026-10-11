import { describe, expect, test } from "vitest";
import { Journey, mulberry32 } from "../../game/engine";
import { STATIONS } from "../../game/network";
import { solve } from "../../game/solver";
import { JOB, SHIFT_START, VENUES } from "../data";
import {
  activitiesHere,
  applyTrip,
  canStartShift,
  dayOfWeek,
  doActivity,
  isWorkday,
  newLife,
  sleep,
  tripMission,
  workShift,
  type LifeState,
} from "../engine";
import type { LifeEvent } from "../events";
import { runHooks } from "../hooks";
import {
  buy,
  buyAdvert,
  dailyTakings,
  dismissReport,
  economyOf,
  openBusiness,
  sellBusiness,
  upgradeBusiness,
  weeklyGoals,
  weeklyTakings,
} from "./core";
import { GOAL, WEEKLY_GOALS, pickGoals } from "./goals";
import { economyHook, tripFacts } from "./hook";
import { FOOTFALL, TIERS, tierCost } from "./items";
import { passesFor } from "./passes";

const fresh = (patch: Partial<LifeState> = {}): LifeState => ({
  ...newLife({ name: "T", avatar: "🙂", home: "brixton", job: "retail", seed: 42, now: 0 }),
  ...patch,
});
const hook = (s: LifeState, ev: LifeEvent) => economyHook(s, ev).state;
const trip = (route: string[], patch: Partial<Extract<LifeEvent, { type: "trip" }>> = {}): LifeEvent => ({
  type: "trip",
  from: "brixton",
  to: "oxford",
  start: 8 * 60,
  arrival: 8 * 60 + 30,
  cost: 3,
  stress: 10,
  route,
  ...patch,
});
/** Sleep through to the next morning, running the hooks like the game does. */
const night = (s: LifeState) => {
  const r = sleep({ ...s, location: s.home });
  return runHooks(r.state, { type: "sleep", summary: r.summary });
};
/** A state whose week has exactly these goals. */
const withGoals = (s: LifeState, goals: string[]): LifeState => {
  const e = economyOf(s);
  return { ...s, economy: { ...e, week: { ...e.week, goals } } };
};

describe("weekly goals", () => {
  test("three distinct goals, deterministic for seed and week", () => {
    const a = pickGoals(42, 3);
    expect(new Set(a).size).toBe(3);
    expect(pickGoals(42, 3)).toEqual(a);
    expect(WEEKLY_GOALS.length).toBeGreaterThanOrEqual(15);
    const weeks = Array.from({ length: 12 }, (_, i) => pickGoals(42, i + 1).join());
    expect(new Set(weeks).size).toBeGreaterThan(6);
  });

  test("reading a trip's route", () => {
    const f = tripFacts(["bus-2:brixton>stockwell", "bus-88:stockwell>vauxhall", "victoria:vauxhall>victoria"], 8 * 60);
    expect(f.hopper).toBe(true);
    expect(f.railLines).toEqual(["victoria"]);
    expect(tripFacts(["victoria:brixton>stockwell"], 24 * 60 + 90).nightTube).toBe(true);
    expect(tripFacts(["walk:brixton>stockwell"], 600).walkOnly).toBe(true);
    expect(tripFacts(["river:waterloo>londonbridge"], 600).river).toBe(true);
  });

  test("progress pays out once when a goal completes, plus the all-three bonus", () => {
    let s = withGoals(fresh(), ["lines-3", "river", "cycle"]);
    s = hook(s, trip(["victoria:brixton>stockwell", "northern:stockwell>waterloo"]));
    expect(weeklyGoals(s).find((g) => g.goal.id === "lines-3")!.value).toBe(2);
    const before = s.money;
    const r = economyHook(s, trip(["jubilee:waterloo>westminster"]));
    s = r.state;
    expect(s.money).toBe(before + GOAL["lines-3"].reward);
    expect(r.events.some((e) => e.includes("Weekly goal"))).toBe(true);
    // Riding more lines doesn't pay twice.
    const again = hook(s, trip(["central:oxford>tcr"]));
    expect(again.money).toBe(s.money);
    s = hook(s, trip(["river:waterloo>londonbridge"]));
    const m = s.money;
    s = hook(s, trip(["bike:londonbridge>bank"]));
    expect(s.money).toBe(m + GOAL.cycle.reward + 60);
    expect(economyOf(s).week.bonus).toBe(true);
  });

  test("the fares goal is judged when the week ends", () => {
    let s = withGoals(fresh({ day: 7, clock: 22 * 60 }), ["fares", "river", "cycle"]);
    for (let i = 0; i < 6; i++) s = hook(s, trip(["victoria:brixton>stockwell"], { cost: 2 }));
    expect(economyOf(s).week.done).not.toContain("fares");
    const before = s.money;
    const r = night(s);
    expect(r.state.ledger.some((l) => l.label.includes("Under £20"))).toBe(true);
    expect(r.state.money).toBeGreaterThan(before - 200); // rent comes out, the reward comes in
  });

  test("goals reset when the week rolls over to Monday", () => {
    let s = fresh({ day: 7, clock: 22 * 60 });
    s = hook(s, trip(["victoria:brixton>stockwell"]));
    expect(economyOf(s).week.trips).toBe(1);
    s = night(s).state;
    expect(dayOfWeek(s.day)).toBe(0);
    const w = economyOf(s).week;
    expect(w.week).toBe(2);
    expect(w.trips).toBe(0);
    expect(w.goals).toEqual(pickGoals(s.seed, 2));
  });

  test("on time every workday needs five on-time shifts", () => {
    let s = withGoals(fresh(), ["on-time", "river", "cycle"]);
    for (let i = 0; i < 4; i++) s = hook(s, { type: "shift", style: "team", lateBy: 0, earned: 75, promoted: false });
    expect(economyOf(s).week.done).not.toContain("on-time");
    s = hook(s, { type: "shift", style: "team", lateBy: 3, earned: 75, promoted: false });
    expect(economyOf(s).week.done).not.toContain("on-time");
  });
});

describe("seasons", () => {
  test("the sleep that starts week 13 grades the season, rewards a title and starts the next", () => {
    let s = fresh({ day: 84, clock: 22 * 60, level: 4 });
    const e = economyOf(s);
    s = { ...s, money: 3400, economy: { ...e, season: { ...e.season, startMoney: 350, onTime: 50, venues: VENUES.slice(0, 8).map((v) => v.id), dailies: 0 } } };
    const r = night(s);
    const e2 = economyOf(r.state);
    expect(r.state.day).toBe(85);
    expect(e2.report?.season).toBe(1);
    expect(e2.report?.grade).toBe("B");
    expect(e2.titles).toHaveLength(1);
    expect(e2.season.n).toBe(2);
    expect(r.events.some((t) => t.includes("report card"))).toBe(true);
    expect(r.state.ledger.some((l) => l.label.includes("Season 1 report") && l.amount === 250)).toBe(true);
    const d = dismissReport(r.state);
    expect(economyOf(d.state).report).toBeUndefined();
    expect(economyOf(d.state).titles).toHaveLength(1);
  });

  test("an empty season is an F and pays nothing", () => {
    const r = night(hook(fresh({ day: 84, clock: 22 * 60, money: 0 }), { type: "open", now: 0 }));
    expect(economyOf(r.state).report?.grade).toBe("F");
  });

  test("season 2 goals are harder", async () => {
    const { seasonGoals } = await import("./goals");
    const s = fresh();
    const e = economyOf(s);
    const one = seasonGoals(s, e);
    const two = seasonGoals(s, { ...e, season: { ...e.season, n: 2 } });
    one.forEach((g, i) => expect(two[i].target).toBeGreaterThanOrEqual(g.target));
    expect(two[0].target).toBeGreaterThan(one[0].target);
  });
});

describe("shop", () => {
  test("buying deducts money, sets passes and expires after 7 days", () => {
    let s = fresh({ money: 100 });
    expect(passesFor(s)).toBeUndefined();
    s = buy(s, "travelcard-2").state;
    expect(s.money).toBe(56);
    expect(passesFor(s)).toEqual({ travelcardZones: 2 });
    expect(tripMission(s, "oxford").passes).toEqual({ travelcardZones: 2 });
    expect(economyOf(s).week.fares).toBe(44); // counts as travel spending
    expect(passesFor({ ...s, day: s.day + 6 })).toEqual({ travelcardZones: 2 });
    expect(passesFor({ ...s, day: s.day + 7 })).toBeUndefined();
  });

  test("renewing stacks days; zones 1–3 beats 1–2", () => {
    let s = fresh({ money: 500 });
    s = buy(s, "bus-pass").state;
    s = buy({ ...s, day: 4 }, "bus-pass").state;
    expect(economyOf(s).owned.find((o) => o.id === "bus-pass")!.expires).toBe(15);
    s = buy(buy(s, "travelcard-2").state, "travelcard-3").state;
    expect(passesFor(s)).toMatchObject({ travelcardZones: 3, busPass: true });
  });

  test("expiry is announced overnight", () => {
    let s = buy(fresh({ money: 100 }), "bus-pass").state;
    for (let i = 0; i < 6; i++) s = night(s).state;
    const r = night(s);
    expect(r.events.some((t) => t.includes("expired"))).toBe(true);
    expect(passesFor(r.state)).toBeUndefined();
  });

  test("can't overspend or buy a permanent item twice", () => {
    const poor = fresh({ money: 100 });
    const r = buy(poor, "bike");
    expect(r.state).toBe(poor);
    let s = buy(fresh({ money: 600 }), "bike").state;
    expect(passesFor(s)).toEqual({ ownBike: true });
    const again = buy(s, "bike");
    expect(again.state).toBe(s);
    s = buy(s, "poster", {}).state;
    expect(economyOf(s).owned.some((o) => o.id === "poster")).toBe(false);
    s = buy(s, "poster", { station: "brixton" }).state;
    expect(economyOf(s).owned.some((o) => o.id === "poster" && o.station === "brixton")).toBe(true);
  });

  test("home upgrades, headphones and the outfit work through events", () => {
    let s = buy(buy(fresh({ money: 1000 }), "bed").state, "outfit").state;
    s = buy(s, "headphones").state;
    const plain = night(fresh({ needs: { energy: 30, hunger: 50, social: 50, fun: 50 } })).state;
    const comfy = night({ ...s, needs: { energy: 30, hunger: 50, social: 50, fun: 50 } }).state;
    expect(comfy.needs.energy).toBe(Math.min(100, plain.needs.energy + 8));
    const perf = hook(s, { type: "shift", style: "team", lateBy: 0, earned: 75, promoted: false }).performance;
    expect(perf).toBe(s.performance + 2);
    const st = { ...s, needs: { ...s.needs, fun: 40 } };
    expect(hook(st, trip(["victoria:brixton>stockwell"], { stress: 70 })).needs.fun).toBeCloseTo(46);
  });
});

describe("station businesses", () => {
  test("footfall is known for every station", () => {
    for (const st of STATIONS) expect(FOOTFALL[st.id]).toBeGreaterThan(0);
  });

  test("a cart costs money, earns on sleep and pays back in a few weeks", () => {
    let s = fresh({ money: 2000 });
    const cost = tierCost("oxford", 0);
    s = openBusiness(s, "oxford").state;
    expect(s.money).toBe(2000 - cost);
    // It trades from the day it opens.
    const r = night(s);
    expect(r.state.ledger.some((l) => l.label.includes("Takings"))).toBe(true);
    expect(r.state.money).toBeGreaterThan(s.money);
    for (const st of ["oxford", "brixton", "stratford", "peckham"]) {
      const b = { station: st, tier: 0, invested: 0, openedDay: 1, earned: 0 };
      const weeks = tierCost(st, 0) / weeklyTakings(s, b);
      expect(weeks).toBeGreaterThan(2);
      expect(weeks).toBeLessThan(4);
      for (let t = 1; t < TIERS.length; t++) {
        const cum = [0, 1, 2, 3].slice(0, t + 1).reduce((a, i) => a + tierCost(st, i), 0);
        const pb = cum / weeklyTakings(s, { ...b, tier: t });
        expect(pb).toBeGreaterThan(2);
        expect(pb).toBeLessThan(4.5);
      }
    }
  });

  test("upgrades, adverts, selling and the three-business limit", () => {
    let s = fresh({ money: 20000 });
    s = openBusiness(s, "brixton").state;
    s = upgradeBusiness(s, "brixton").state;
    const b = economyOf(s).businesses[0];
    expect(b.tier).toBe(1);
    const base = dailyTakings(s, b, 1);
    s = buyAdvert(s, "victoria").state;
    expect(dailyTakings(s, b, 1)).toBeGreaterThan(base);
    expect(dailyTakings(buyAdvert(s, "dlr").state, b, 1)).toBe(base);
    s = openBusiness(openBusiness(s, "oxford").state, "bank").state;
    const limited = openBusiness(s, "waterloo");
    expect(limited.state).toBe(s);
    const money = s.money;
    s = sellBusiness(s, "brixton").state;
    expect(s.money).toBe(money + Math.round(b.invested / 2));
    expect(economyOf(s).businesses).toHaveLength(2);
  });

  test("can't open a cart you can't afford", () => {
    const s = fresh({ money: 10 });
    expect(openBusiness(s, "stratford").state).toBe(s);
  });
});

describe("saves", () => {
  test("old saves without economy state work", () => {
    const old = fresh({ day: 40 });
    delete (old as Partial<LifeState>).economy;
    expect(passesFor(old)).toBeUndefined();
    const s = hook(old, trip(["victoria:brixton>stockwell"]));
    expect(economyOf(s).week.week).toBe(6);
    expect(economyOf(s).season.n).toBe(1);
    expect(economyOf(s).week.trips).toBe(1);
  });

  test("economy state survives a JSON round trip", () => {
    let s = buy(fresh({ money: 3000 }), "travelcard-3").state;
    s = openBusiness(s, "kingscross").state;
    s = buyAdvert(s, "northern").state;
    s = hook(s, trip(["northern:camden>kingscross"]));
    const back = JSON.parse(JSON.stringify(s)) as LifeState;
    expect(back).toEqual(s);
    expect(passesFor(back)).toEqual(passesFor(s));
  });
});

// A sensible player like sim.ts, but with the hooks running, so goals see what happens.
function playSensible(days: number, seed: number, opts: { home: string; job: string; shop?: boolean }) {
  const rng = mulberry32(seed);
  let s = newLife({ name: "Bot", avatar: "🤖", home: opts.home, job: opts.job, seed, now: 0 });
  let weeklyDone = 0;
  let weeks = 0;
  const ev = (st: LifeState, e: LifeEvent) => runHooks(st, e).state;
  const travel = (st: LifeState, to: string) => {
    if (st.location === to) return st;
    const mission = tripMission(st, to);
    const sol = solve(mission, 8);
    const pick = sol.fastest ?? sol.cheapestOnTime;
    if (!pick) return st;
    const j = new Journey(mission, pick.route, rng);
    let guard = 0;
    while (!j.done && guard++ < 20000) {
      if (j.pending) j.resolve(Math.floor(rng() * j.pending.choices.length));
      else j.advance(0.5);
    }
    const next = applyTrip(st, { to, arrival: j.clock, cost: j.meter.total, stress: j.stress, charges: j.meter.charges, legs: j.legs.map((l) => ({ mode: l.link.mode, start: l.board })) }).state;
    return ev(next, { type: "trip", from: mission.from, to, start: mission.start, arrival: j.clock, cost: j.meter.total, stress: j.stress, route: pick.route.map((l) => l.id) });
  };
  const doIt = (st: LifeState, pickVenue: boolean, id?: string) => {
    const opts2 = activitiesHere(st).filter((o) => !o.blocked && (pickVenue ? o.venue : o.activity.id === id));
    if (!opts2.length) return st;
    opts2.sort((a, b) => a.activity.cost - b.activity.cost);
    const o = opts2[0];
    const r = doActivity(st, o.activity, o.venue);
    return ev(r.state, { type: "activity", activityId: o.activity.id, venueId: o.venue?.id, cost: o.activity.cost });
  };
  for (let d = 0; d < days; d++) {
    const dow = dayOfWeek(s.day);
    s = doIt(s, false, "breakfast");
    if (isWorkday(s.day)) {
      s = travel(s, JOB[s.job].station);
      if (canStartShift(s)) {
        const lateBy = Math.max(0, s.clock - SHIFT_START);
        s = ev(workShift(s, d % 3 === 0 ? "focus" : "team").state, { type: "shift", style: "team", lateBy, earned: 0, promoted: false });
      }
    }
    if ([1, 3, 4, 5].includes(dow) && s.money > 60) {
      const venues = VENUES.filter((v) => v.station !== s.location);
      const venue = venues[Math.floor(rng() * venues.length)];
      s = { ...s, clock: Math.max(s.clock, isWorkday(s.day) ? 18 * 60 : 12 * 60) };
      s = travel(s, venue.station);
      s = doIt(s, true);
    }
    s = travel(s, s.home);
    if (s.location === s.home) {
      if (s.needs.hunger < 60) s = doIt(s, false, "cook");
      if (s.needs.social < 45) s = doIt(s, false, "call");
      if (s.needs.fun < 45) s = doIt(s, false, "tv");
    }
    if (opts.shop && s.money > 900 && economyOf(s).businesses.length === 0) s = openBusiness(s, JOB[s.job].station).state;
    if (dayOfWeek(s.day) === 6) {
      weeklyDone += economyOf(s).week.done.length;
      weeks++;
    }
    s = night(s).state;
  }
  return { s, weeklyDone, weeks };
}

describe("balance (simulated sensible player, one season)", () => {
  const run = playSensible(84, 7, { home: "brixton", job: "retail" });
  test("earns about a B in season 1", () => {
    const report = economyOf(run.s).report;
    expect(report).toBeDefined();
    expect(["A", "B", "C"]).toContain(report!.grade);
    expect(report!.points).toBeGreaterThanOrEqual(60);
    expect(report!.points).toBeLessThan(90);
  });
  test("weekly goals are neither trivial nor impossible", () => {
    const avg = run.weeklyDone / run.weeks;
    expect(avg).toBeGreaterThan(0.3);
    expect(avg).toBeLessThan(2.6);
  });
  test("a cart pays its way over a season", () => {
    const shopper = playSensible(84, 7, { home: "brixton", job: "retail", shop: true });
    const b = economyOf(shopper.s).businesses[0];
    expect(b).toBeDefined();
    expect(b.earned).toBeGreaterThan(b.invested);
  });
});
