import { describe, expect, test } from "vitest";
import { estimate } from "../../game/engine";
import { newLife, dayDisruption, describeDisruption, tripMission, closedAt, isWorkday, type LifeState } from "../engine";
import { routesHook } from "./hook";
import { addToCap, cappedSpend, quickTrips, rebuildRoute } from "./routes";

const fresh = (patch: Partial<LifeState> = {}): LifeState => ({ ...newLife({ name: "T", avatar: "🙂", home: "brixton", job: "retail", seed: 42, now: 0 }), ...patch });
const COMMUTE = ["brixton>stockwell", "stockwell>vauxhall", "vauxhall>victoria", "victoria>greenpark", "greenpark>oxford"].map((h) => `victoria:${h}`);

const trip = (from: string, to: string, route: string[], cost: number, start = 8 * 60) =>
  ({ type: "trip", from, to, start, arrival: start + 20, cost, stress: 20, route }) as const;

/** First seed whose `day` matches. */
function findSeed(day: number, ok: (s: LifeState) => boolean): LifeState {
  for (let seed = 1; seed < 5000; seed++) {
    const s = fresh({ seed, day, clock: 7 * 60 + 45 });
    if (ok(s)) return s;
  }
  throw new Error("no seed found");
}

describe("realistic disruption", () => {
  test("frequencies over 400 days look like London", () => {
    const counts = { weekday: 0, weekend: 0, minor: 0, severe: 0, strike: 0, closure: 0, weekendDelays: 0 };
    for (let seed = 1; seed <= 5; seed++) {
      for (let day = 1; day <= 400; day++) {
        const s = fresh({ seed, day });
        const d = dayDisruption(s);
        if (isWorkday(day)) {
          counts.weekday++;
          if (d.kind === "minor" || d.kind === "severe" || d.kind === "strike") counts[d.kind]++;
          expect(d.kind).not.toBe("closure");
        } else {
          counts.weekend++;
          if (d.kind === "closure") counts.closure++;
          if (Object.keys(d.delayed).length) counts.weekendDelays++;
        }
      }
    }
    expect(counts.minor / counts.weekday).toBeGreaterThan(0.3);
    expect(counts.minor / counts.weekday).toBeLessThan(0.4);
    expect(counts.severe / counts.weekday).toBeGreaterThan(0.07);
    expect(counts.severe / counts.weekday).toBeLessThan(0.13);
    expect(counts.strike / counts.weekday).toBeGreaterThan(0.03);
    expect(counts.strike / counts.weekday).toBeLessThan(0.07);
    expect(counts.closure / counts.weekend).toBeGreaterThan(0.2);
    expect(counts.closure / counts.weekend).toBeLessThan(0.3);
    expect(counts.weekendDelays).toBe(0);
  });

  test("minor delays hit one or two lines at ×1.2–1.4 and reach the trip mission", () => {
    const s = findSeed(1, (x) => dayDisruption(x).kind === "minor");
    const d = dayDisruption(s);
    const lines = Object.keys(d.delayed);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const m of Object.values(d.delayed)) {
      expect(m).toBeGreaterThanOrEqual(1.2);
      expect(m).toBeLessThanOrEqual(1.4);
    }
    expect(tripMission(s, "oxford").delayedLines).toEqual(d.delayed);
    expect(describeDisruption(d)).toMatch(/^Minor delays on the /);
  });

  test("descriptions read naturally", () => {
    expect(describeDisruption({ kind: "minor", closed: [], delayed: { northern: 1.2 } })).toBe("Minor delays on the Northern line");
    expect(describeDisruption({ kind: "minor", closed: [], delayed: { northern: 1.2, central: 1.3 } })).toBe("Minor delays on the Northern and Central lines");
    expect(describeDisruption({ kind: "severe", closed: [], delayed: { dlr: 1.6 } })).toBe("Severe delays on the DLR");
    expect(describeDisruption({ kind: "strike", closed: ["victoria"], delayed: {} })).toBe("Strike: no Victoria line today");
    expect(describeDisruption({ kind: "none", closed: [], delayed: {} })).toBe("");
  });

  test("strikes and weekend closures shut the line all day, and night rules still apply", () => {
    const strike = findSeed(1, (x) => dayDisruption(x).kind === "strike");
    expect(closedAt(strike, 12 * 60)).toContain(dayDisruption(strike).closed[0]);
    const closure = findSeed(6, (x) => dayDisruption(x).kind === "closure");
    expect(closedAt(closure, 12 * 60)).toContain(dayDisruption(closure).closed[0]);
    expect(closedAt(fresh({ day: 2 }), 24 * 60 + 60)).toContain("victoria");
  });
});

describe("daily cap", () => {
  test("rail in zones 1–2 caps at £8.90, bus-only at £5.25", () => {
    let cap = addToCap(undefined, 1, { rail: 3.5, bus: 0 }, [1, 2]);
    expect(cap.refund).toBe(0);
    cap = addToCap(cap.cap, 1, { rail: 3.5, bus: 0 }, [1, 2]);
    cap = addToCap(cap.cap, 1, { rail: 3.5, bus: 0 }, [1, 2]);
    expect(cap.refund).toBe(1.6);
    cap = addToCap(cap.cap, 1, { rail: 2.9, bus: 0 }, [1]);
    expect(cap.refund).toBe(2.9);
    expect(cappedSpend(cap.cap)).toBe(8.9);

    let bus = addToCap(undefined, 1, { rail: 0, bus: 1.75 }, []);
    for (let i = 0; i < 3; i++) bus = addToCap(bus.cap, 1, { rail: 0, bus: 1.75 }, []);
    expect(bus.cap.refunded).toBe(1.75);
  });

  test("going out to zone 3 lifts the cap; zones 2–3 only is cheaper", () => {
    let c = addToCap(undefined, 1, { rail: 3.9, bus: 0 }, [1, 3]);
    c = addToCap(c.cap, 1, { rail: 3.9, bus: 0 }, [1, 3]);
    c = addToCap(c.cap, 1, { rail: 3.9, bus: 0 }, [1, 3]);
    expect(c.cap.refunded).toBe(1.2);
    let d = addToCap(undefined, 1, { rail: 2.2, bus: 1.75 }, [2, 3]);
    d = addToCap(d.cap, 1, { rail: 2.2, bus: 1.75 }, [2, 3]);
    expect(d.cap.refunded).toBe(0.4);
  });

  test("the hook refunds the excess as a ledger line, and resets the next day", () => {
    let s = fresh({ money: 100 });
    const out = trip("brixton", "oxford", COMMUTE, 3.5);
    const back = trip("oxford", "brixton", [...COMMUTE].reverse().map((id) => id.replace(/:(\w+)>(\w+)/, ":$2>$1")), 3.5);
    const events: string[] = [];
    for (const ev of [out, back, out]) {
      const r = routesHook(s, ev);
      s = r.state;
      events.push(...r.events);
    }
    expect(s.ledger[0]).toMatchObject({ label: "Daily cap refund", amount: 1.6 });
    expect(s.money).toBe(101.6);
    expect(events.some((e) => e.includes("Daily cap"))).toBe(true);
    const tomorrow = routesHook({ ...s, day: 2 }, out).state;
    expect(tomorrow.routes!.cap).toMatchObject({ day: 2, rail: 3.5, refunded: 0 });
  });

  test("an old save without route memory is fine", () => {
    const s = { ...fresh(), routes: undefined };
    expect(routesHook(s, { type: "text" }).state).toBe(s);
    expect(routesHook(s, trip("brixton", "oxford", COMMUTE, 3.5)).state.routes?.trips).toBeDefined();
  });
});

describe("route memory and quick trips", () => {
  test("each trip's route is remembered with a count", () => {
    let s = fresh();
    s = routesHook(s, trip("brixton", "oxford", COMMUTE, 3.5)).state;
    s = routesHook({ ...s, day: 2 }, trip("brixton", "oxford", COMMUTE, 3.5)).state;
    expect(s.routes!.trips!["brixton>oxford"]).toMatchObject({ count: 2, lastDay: 2, links: COMMUTE });
  });

  test("the usual commute is one tap on a normal day", () => {
    const base = findSeed(1, (x) => dayDisruption(x).kind === "none");
    const s = routesHook(base, trip("brixton", "oxford", COMMUTE, 3.5)).state;
    const [first] = quickTrips(s);
    expect(first.kind).toBe("commute");
    expect(first.source).toBe("usual");
    expect(first.warning).toBeUndefined();
    expect(first.links.map((l) => l.id)).toEqual(COMMUTE);
    const est = estimate(tripMission(s, "oxford"), first.links);
    expect(first.arrival).toBe(est.arrival);
    expect(first.cost).toBe(est.cost);
  });

  test("a strike on your usual line sends you to the planner", () => {
    const base = findSeed(1, (x) => dayDisruption(x).closed[0] === "victoria");
    const s = routesHook(base, trip("brixton", "oxford", COMMUTE, 3.5)).state;
    const [first] = quickTrips(s);
    expect(first.warning).toMatch(/Your usual route is hit by the Victoria line strike/);
  });

  test("delays keep the route rideable but slower, with a note", () => {
    const base = findSeed(1, (x) => (dayDisruption(x).delayed.victoria ?? 1) > 1);
    const s = routesHook(base, trip("brixton", "oxford", COMMUTE, 3.5)).state;
    const [first] = quickTrips(s);
    expect(first.warning).toBeUndefined();
    expect(first.note).toContain("Victoria line");
    const undelayed = estimate({ ...tripMission(s, "oxford"), delayedLines: {} }, first.links);
    expect(first.arrival!).toBeGreaterThan(undelayed.arrival);
  });

  test("with no memory you get a solver suggestion; away from home you get a trip home", () => {
    const s = findSeed(1, (x) => dayDisruption(x).kind === "none");
    const [commute] = quickTrips(s);
    expect(commute.source).toBe("suggested");
    expect(commute.links.length).toBeGreaterThan(0);
    const away = quickTrips({ ...s, location: "oxford", work: "done", clock: 18 * 60 });
    expect(away.map((t) => t.kind)).toEqual(["home"]);
  });

  test("remembered destinations show up, most used first, at most four", () => {
    let s = findSeed(6, (x) => dayDisruption(x).kind === "none");
    s = { ...s, work: "off" };
    const hop = (to: string, ids: string[], n: number) => {
      for (let i = 0; i < n; i++) s = routesHook(s, trip("brixton", to, ids, 2)).state;
    };
    hop("stockwell", ["victoria:brixton>stockwell"], 3);
    hop("vauxhall", ["victoria:brixton>stockwell", "victoria:stockwell>vauxhall"], 1);
    hop("claphamcommon", ["bus-35:brixton>claphamcommon"], 2);
    hop("peckham", ["walk:brixton>peckham"], 1);
    hop("victoria", COMMUTE.slice(0, 3), 1);
    const list = quickTrips(s);
    expect(list).toHaveLength(4);
    expect(list.slice(0, 2).map((t) => t.to)).toEqual(["stockwell", "claphamcommon"]);
  });

  test("a route that no longer exists is not trusted", () => {
    expect(rebuildRoute(["nope:a>b"], "brixton", "oxford")).toBeNull();
    expect(rebuildRoute(COMMUTE.slice(1), "brixton", "oxford")).toBeNull();
    expect(rebuildRoute(COMMUTE, "brixton", "oxford")).toHaveLength(5);
  });
});
