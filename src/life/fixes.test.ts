import { describe, expect, test } from "vitest";
import { newLife, sleep, tripMission, type LifeState } from "./engine";
import { runHooks } from "./hooks";
import { boosted } from "./economy/core";
import { economyOf } from "./economy/core";
import { addToCap, quickTrips } from "./routes/routes";
import { storyHook } from "./story/hook";
import { migrateLife } from "./store";

// Regression tests for bugs found in the cross-system review.

const fresh = (patch: Partial<LifeState> = {}): LifeState => ({ ...newLife({ name: "T", avatar: "🙂", home: "brixton", job: "retail", seed: 42, now: 0 }), ...patch });

describe("review fixes", () => {
  test("a late commute is due by the 11:00 cutoff, not two hours later", () => {
    expect(tripMission(fresh({ clock: 10 * 60 }), "oxford").deadline).toBe(11 * 60);
    expect(tripMission(fresh({ clock: 8 * 60 + 57 }), "oxford").deadline).toBe(9 * 60);
  });

  test("quick trips stop offering the commute after 11:00", () => {
    const labels = (s: LifeState) => quickTrips(s).map((t) => t.kind);
    expect(labels(fresh({ clock: 8 * 60 }))).toContain("commute");
    expect(labels(fresh({ clock: 14 * 60, location: "camden" }))).not.toContain("commute");
  });

  test("the daily cap never refunds rail fares when the zones are unknown", () => {
    const { refund } = addToCap(undefined, 1, { rail: 3.5, bus: 0 }, []);
    expect(refund).toBe(0);
  });

  test("the weekly fares goal counts what you paid after daily-cap refunds", () => {
    let s = runHooks(fresh(), { type: "open", now: 0 }).state;
    const trip = (from: string, to: string, ids: string[]) =>
      (s = runHooks(s, { type: "trip", from, to, start: s.clock, arrival: s.clock + 20, cost: 3.5, stress: 20, route: ids, charges: [{ label: "Rail fare, zones 1–2 (peak)", amount: 3.5, time: s.clock }] }).state);
    const there = ["victoria:brixton>stockwell", "victoria:stockwell>vauxhall", "victoria:vauxhall>victoria", "victoria:victoria>greenpark", "victoria:greenpark>oxford"];
    const back = ["victoria:oxford>greenpark", "victoria:greenpark>victoria", "victoria:victoria>vauxhall", "victoria:vauxhall>stockwell", "victoria:stockwell>brixton"];
    trip("brixton", "oxford", there);
    trip("oxford", "brixton", back);
    trip("brixton", "oxford", there);
    trip("oxford", "brixton", back);
    // £14 of fares, capped at £8.90 for zones 1–2.
    expect(economyOf(s).week.fares).toBeCloseTo(8.9, 2);
  });

  test("a 7-day line advert boosts all seven days of takings", () => {
    const s = fresh({ day: 8, economy: { ...economyOf(fresh()), advert: { line: "victoria", expires: 8 } } });
    // Overnight on day 8 pays day 7's takings: still inside the advert.
    expect(boosted(s, "oxford", 7)).toBe(true);
    expect(boosted(s, "oxford", 8)).toBe(false);
  });

  test("a plan counts when an activity covers its window, and when you go to bed during a home plan", () => {
    const base = storyHook(fresh(), { type: "open", now: 0 }).state;
    const withPlan = (station: string, from: number, until: number): LifeState => ({
      ...base,
      story: {
        ...base.story!,
        plans: [{ id: 99, who: "jess", event: "jess-evening1", station, day: 1, from, until, label: "Test plan", vars: {} }],
      },
    });
    // Arrived 18:00, cinema until 20:30, plan 18:45–19:30 at Leicester Square.
    const cinema = storyHook({ ...withPlan("leicester", 18 * 60 + 45, 19 * 60 + 30), location: "leicester", clock: 20 * 60 + 30 }, {
      type: "activity",
      activityId: "cinema",
      venueId: "west-end",
      cost: 16,
    });
    expect(cinema.events.some((e) => e.includes("You made it"))).toBe(true);

    // In bed at 20:00 during a 19:30–21:30 plan at home.
    const night = withPlan("brixton", 19 * 60 + 30, 21 * 60 + 30);
    const slept = sleep({ ...night, clock: 20 * 60 });
    const r = storyHook(slept.state, { type: "sleep", summary: slept.summary, bedtime: 20 * 60 });
    expect(r.events.some((e) => e.includes("You made it"))).toBe(true);
  });

  test("older saves missing newer fields load safely", () => {
    const old = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown>;
    delete old.hungOutToday;
    (old.meta as Record<string, unknown>).bestStreak = undefined;
    delete old.dayStart;
    const s = migrateLife(old as unknown as LifeState);
    expect(s.hungOutToday).toEqual([]);
    expect(s.meta.bestStreak).toBe(0);
    expect(s.dayStart.money).toBe(s.money);
  });
});
