import { describe, expect, test } from "vitest";
import { solve } from "../game/solver";
import { HOME_ACTIVITIES, VENUES } from "./data";
import {
  activitiesHere,
  canStartShift,
  closedAt,
  dayName,
  doActivity,
  hangOut,
  mood,
  moveHome,
  mustSleep,
  newLife,
  perfToPromote,
  sleep,
  tripMission,
  welcomeBack,
  workShift,
  type LifeState,
} from "./engine";
import { simulate } from "./sim";

const fresh = (patch: Partial<LifeState> = {}): LifeState => ({ ...newLife({ name: "T", avatar: "🙂", home: "brixton", job: "retail", seed: 42, now: 0 }), ...patch });
const act = (id: string) => HOME_ACTIVITIES.find((a) => a.id === id)!;

describe("London Life rules", () => {
  test("a new life starts Monday morning at home with money in the bank", () => {
    const s = fresh();
    expect(dayName(s.day)).toBe("Monday");
    expect(s.location).toBe("brixton");
    expect(s.money).toBeGreaterThan(0);
    expect(s.work).toBe("pending");
  });

  test("activities cost money and time and change needs", () => {
    const s = fresh();
    const { state } = doActivity(s, act("breakfast"));
    expect(state.money).toBe(s.money - 2);
    expect(state.clock).toBe(s.clock + 20);
    expect(state.needs.hunger).toBeGreaterThan(s.needs.hunger);
  });

  test("closed or unaffordable activities are refused", () => {
    const s = fresh({ clock: 20 * 60 });
    expect(doActivity(s, act("breakfast")).state).toBe(s);
    const broke = fresh({ money: 1 });
    expect(doActivity(broke, act("breakfast")).state).toBe(broke);
  });

  test("on-time shifts pay in full; late shifts pay less and cost performance", () => {
    const onTime = workShift(fresh({ location: "oxford", clock: 8 * 60 + 50 }), "team").state;
    const late = workShift(fresh({ location: "oxford", clock: 10 * 60 }), "team").state;
    const wages = (s: LifeState) => s.ledger.find((l) => l.label.startsWith("Wages"))!.amount;
    expect(wages(onTime)).toBe(75);
    expect(wages(late)).toBeLessThan(75);
    expect(late.performance).toBeLessThan(onTime.performance);
    expect(onTime.clock).toBe(17 * 60);
  });

  test("you can't start a shift after 11:00 or away from work", () => {
    expect(canStartShift(fresh({ location: "oxford", clock: 11 * 60 }))).toBe(false);
    expect(canStartShift(fresh({ location: "brixton", clock: 8 * 60 }))).toBe(false);
  });

  test("enough performance earns a promotion and a pay rise", () => {
    const s = fresh({ location: "oxford", clock: 8 * 60, performance: perfToPromote(1) - 1 });
    const { state, events } = workShift(s, "focus");
    expect(state.level).toBe(2);
    expect(events.some((e) => e.includes("Promoted"))).toBe(true);
  });

  test("skipping work on a weekday is a missed day", () => {
    const { state } = sleep(fresh({ clock: 22 * 60 }));
    expect(state.day).toBe(2);
    expect(state.performance).toBeLessThan(0);
  });

  test("rent comes out on Sunday night", () => {
    const sunday = fresh({ day: 7, work: "off", clock: 22 * 60 });
    const { state, summary } = sleep(sunday);
    expect(summary.rent).toBe(190);
    expect(state.money).toBe(sunday.money - 190);
    expect(state.work).toBe("pending"); // Monday again
  });

  test("Mum bails you out instead of a game over", () => {
    const { state, summary } = sleep(fresh({ day: 6, work: "off", money: -300, clock: 22 * 60 }));
    expect(state.money).toBeGreaterThan(-300);
    expect(summary.notes.some((n) => n.includes("Mum"))).toBe(true);
  });

  test("late nights mean less energy tomorrow", () => {
    const early = sleep(fresh({ day: 6, work: "off", clock: 22 * 60, needs: { energy: 20, hunger: 60, social: 60, fun: 60 } })).state;
    const late = sleep(fresh({ day: 6, work: "off", clock: 26 * 60 + 30, needs: { energy: 20, hunger: 60, social: 60, fun: 60 } })).state;
    expect(late.needs.energy).toBeLessThan(early.needs.energy);
  });

  test("the Night Tube only runs on Friday and Saturday nights", () => {
    const tuesdayNight = closedAt(fresh({ day: 2 }), 24 * 60 + 60);
    const fridayNight = closedAt(fresh({ day: 5 }), 24 * 60 + 60);
    expect(tuesdayNight).toContain("victoria");
    expect(fridayNight).not.toContain("victoria");
    expect(fridayNight).toContain("elizabeth");
  });

  test("you can always get home: every venue trip at night has a route back", () => {
    for (const v of VENUES) {
      const s = fresh({ day: 2, location: v.station, clock: 24 * 60 + 60 });
      if (v.station === s.home) continue;
      const { fastest } = solve(tripMission(s, s.home), 10);
      expect(fastest, v.name).not.toBeNull();
    }
  });

  test("every workplace is reachable from every home before 09:00 on a normal day", () => {
    for (const home of ["stratford", "peckham", "brixton", "canadawater", "claphamcommon", "camden", "shoreditch"]) {
      for (const [job, station] of [["retail", "oxford"], ["cafe", "kingscross"], ["tech", "shoreditch"], ["finance", "canarywharf"], ["civil", "westminster"]]) {
        if (home === station) continue;
        const s = fresh({ home, location: home, job, clock: 7 * 60 + 45, seed: 1 });
        const { fastest } = solve({ ...tripMission(s, station), closedLines: [] }, 10);
        expect(fastest && fastest.est.arrival <= 9 * 60, `${home} → ${station}`).toBe(true);
      }
    }
  });

  test("you can only sleep at home, and dawn forces bed", () => {
    expect(mustSleep(fresh({ clock: 29 * 60 + 30 }))).toBe(true);
    expect(mustSleep(fresh({ clock: 22 * 60 }))).toBe(false);
  });

  test("moving needs a deposit and changes rent", () => {
    const { state } = moveHome(fresh(), "camden");
    expect(state.home).toBe("camden");
    expect(state.badges).toContain("mover");
    expect(moveHome(fresh({ money: 10 }), "camden").state.home).toBe("brixton");
  });

  test("coming back rewards a streak and a rest, never a penalty", () => {
    const day1 = Date.parse("2026-10-10T12:00:00");
    const a = welcomeBack(fresh(), day1).state;
    const b = welcomeBack(a, day1 + 24 * 3600 * 1000).state;
    expect(a.meta.streak).toBe(1);
    expect(b.meta.streak).toBe(2);
    expect(b.money).toBeGreaterThan(a.money);
    const away = welcomeBack(b, day1 + 10 * 24 * 3600 * 1000).state;
    expect(away.meta.streak).toBe(1);
    expect(mood(away.needs)).toBeGreaterThanOrEqual(mood(b.needs));
  });

  test("you can hang out with each player once a day", () => {
    const once = hangOut(fresh({ location: "camden", clock: 12 * 60 }), "p2", "Bea").state;
    const twice = hangOut(once, "p2", "Bea");
    expect(once.needs.social).toBeGreaterThan(fresh().needs.social);
    expect(twice.state).toBe(once);
    expect(sleep({ ...once, location: once.home }).state.hungOutToday).toEqual([]);
  });

  test("the activity list at a venue includes the venue and street options", () => {
    const s = fresh({ location: "camden", clock: 12 * 60 });
    const ids = activitiesHere(s).map((o) => o.activity.id);
    expect(ids).toContain("street-food");
    expect(ids).toContain("coffee");
    expect(ids).not.toContain("breakfast");
  });
});

describe("London Life balance (simulated players, 4 weeks)", () => {
  const run = (strategy: "sensible" | "reckless" | "hermit") => simulate(strategy, { home: "brixton", job: "retail", days: 28, seed: 7 });
  const sensible = run("sensible");
  const reckless = run("reckless");
  const hermit = run("hermit");
  const total = (r: typeof sensible) => r.weeklyMoney.reduce((a, b) => a + b, 0);

  test("a sensible player stays happy, saves money and gets promoted", () => {
    expect(sensible.avgMood).toBeGreaterThanOrEqual(55);
    expect(total(sensible)).toBeGreaterThan(0);
    expect(sensible.level).toBeGreaterThanOrEqual(3);
    expect(sensible.mumBailouts).toBe(0);
    expect(sensible.missedDays).toBe(0);
  });

  test("partying every night costs money and career", () => {
    expect(total(reckless)).toBeLessThan(total(sensible));
    expect(reckless.level).toBeLessThan(sensible.level);
  });

  test("staying in saves money but makes for a duller life", () => {
    expect(total(hermit)).toBeGreaterThan(total(sensible));
    expect(hermit.avgMood).toBeLessThan(sensible.avgMood);
  });
});

describe("Every system together (story, economy, routines), 4 simulated weeks", () => {
  const full = simulate("sensible", { home: "brixton", job: "retail", days: 28, seed: 11, full: true });
  const reckless = simulate("reckless", { home: "brixton", job: "retail", days: 28, seed: 11, full: true });

  test("money stays sane: no runaway income or debt spiral", () => {
    for (const w of full.weeklyMoney) {
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThan(-300);
      expect(w).toBeLessThan(900);
    }
  });

  test("a sensible player is happy, never misses work and never needs Mum", () => {
    expect(full.avgMood).toBeGreaterThanOrEqual(55);
    expect(full.missedDays).toBe(0);
    expect(full.mumBailouts).toBe(0);
  });

  test("partying every night still costs more than living sensibly", () => {
    const total = (r: typeof full) => r.weeklyMoney.reduce((a, b) => a + b, 0);
    expect(total(reckless)).toBeLessThan(total(full));
  });
});
