import { Journey, mulberry32 } from "../game/engine";
import { solve } from "../game/solver";
import { JOB, VENUES } from "./data";
import type { LifeEvent } from "./events";
import { runHooks } from "./hooks";
import { answer, threads } from "./story/hook";
import {
  activitiesHere,
  applyTrip,
  canStartShift,
  doActivity,
  isWorkday,
  mood,
  newLife,
  sleep,
  tripMission,
  workShift,
  dayOfWeek,
  type LifeState,
  type ShiftStyle,
} from "./engine";

// Automated players for balancing London Life. Used by the tests; not shipped in the UI.

export interface SimReport {
  weeklyMoney: number[];
  level: number;
  avgMood: number;
  lowNeedDays: number;
  missedDays: number;
  avgNeeds: Record<string, number>;
  avgMoodAfterWork: number;
  mumBailouts: number;
  days: number;
}

type Strategy = "sensible" | "reckless" | "hermit";

function travel(s: LifeState, to: string, rng: () => number, prefer: "cheap" | "fast"): LifeState {
  if (s.location === to) return s;
  const mission = tripMission(s, to);
  const sol = solve(mission, 8);
  const pick = prefer === "cheap" ? sol.cheapestOnTime ?? sol.fastest : sol.fastest ?? sol.cheapestOnTime;
  if (!pick) return s;
  const j = new Journey(mission, pick.route, rng);
  let guard = 0;
  while (!j.done && guard++ < 20000) {
    if (j.pending) j.resolve(Math.floor(rng() * j.pending.choices.length));
    else j.advance(0.5);
  }
  const from = s.location;
  const start = s.clock;
  const after = applyTrip(s, {
    to,
    arrival: j.clock,
    cost: j.meter.total,
    stress: j.stress,
    charges: j.meter.charges,
    legs: j.legs.map((l) => ({ mode: l.link.mode, start: l.board })),
  }).state;
  return hook(
    after,
    { type: "trip", from, to, start, arrival: j.clock, cost: j.meter.total, stress: j.stress, route: pick.route.map((l) => l.id), charges: j.meter.charges },
    rng,
  );
}

function tryDo(s: LifeState, id: string): LifeState {
  const opt = activitiesHere(s).find((o) => o.activity.id === id && !o.blocked);
  if (!opt) return s;
  const next = doActivity(s, opt.activity, opt.venue).state;
  return next === s ? s : hook(next, { type: "activity", activityId: opt.activity.id, venueId: opt.venue?.id, cost: opt.activity.cost }, simRng);
}

/** Best available activity at a venue station that is open now. */
function bestVenueActivity(s: LifeState, wantCheap: boolean): LifeState {
  const opts = activitiesHere(s).filter((o) => o.venue && !o.blocked);
  if (!opts.length) return s;
  opts.sort((a, b) => (wantCheap ? a.activity.cost - b.activity.cost : b.activity.cost - a.activity.cost));
  const next = doActivity(s, opts[0].activity, opts[0].venue).state;
  return next === s ? s : hook(next, { type: "activity", activityId: opts[0].activity.id, venueId: opts[0].venue?.id, cost: opts[0].activity.cost }, simRng);
}

/** Run every system's hooks, as the real store does after each action (when `full` is on). */
let FULL = false;
let simRng: () => number = Math.random;
function hook(s: LifeState, ev: LifeEvent, rng: () => number): LifeState {
  if (!FULL) return s;
  let next = runHooks(s, ev).state;
  // Reply to any characters waiting on us, like a player would.
  for (const t of threads(next)) {
    if (t.choices.length) next = answer(next, t.id, Math.floor(rng() * t.choices.length)).state;
  }
  return next;
}

export function simulate(
  strategy: Strategy,
  opts: { home: string; job: string; days: number; seed: number; full?: boolean },
): SimReport {
  FULL = !!opts.full;
  simRng = mulberry32(opts.seed ^ 0x5eed);
  const rng = mulberry32(opts.seed);
  let s = newLife({ name: "Bot", avatar: "🤖", home: opts.home, job: opts.job, seed: opts.seed, now: 0 });
  s = hook(s, { type: "open", now: 0 }, rng);
  const weeklyMoney: number[] = [];
  let moodSum = 0;
  let workMoodSum = 0;
  const needSum = { energy: 0, hunger: 0, social: 0, fun: 0 };
  let lowNeedDays = 0;
  let missedDays = 0;
  let bailouts = 0;
  let weekStart = s.money;

  for (let d = 0; d < opts.days; d++) {
    const dow = dayOfWeek(s.day);
    s = tryDo(s, "breakfast");

    if (isWorkday(s.day)) {
      if (strategy === "reckless") s = { ...s, clock: s.clock + 80 }; // hits snooze
      s = travel(s, JOB[s.job].station, rng, strategy === "reckless" ? "cheap" : "fast");
      if (canStartShift(s)) {
        const style: ShiftStyle = strategy === "reckless" ? "coast" : d % 3 === 0 ? "focus" : "team";
        const before = s;
        s = workShift(s, style).state;
        s = hook(
          s,
          {
            type: "shift",
            style,
            lateBy: Math.max(0, before.clock - 9 * 60),
            earned: s.ledger.find((l) => l.label.startsWith("Wages"))?.amount ?? 0,
            promoted: s.level > before.level,
          },
          rng,
        );
      }
    }
    workMoodSum += mood(s.needs);
    {
    }

    const goOut = strategy === "reckless" || (strategy === "sensible" && [1, 3, 4, 5].includes(dow) && s.money > 60);
    if (goOut) {
      const venues = VENUES.filter((v) => v.station !== s.location);
      const venue = venues[Math.floor(rng() * venues.length)];
      if (!isWorkday(s.day)) s = { ...s, clock: Math.max(s.clock, 12 * 60) };
      else s = { ...s, clock: Math.max(s.clock, 18 * 60) };
      s = travel(s, venue.station, rng, "fast");
      s = bestVenueActivity(s, strategy === "sensible");
      if (strategy === "reckless") s = bestVenueActivity(s, false);
    }

    s = travel(s, s.home, rng, "fast");
    if (s.location === s.home) {
      if (s.needs.hunger < 60) s = tryDo(s, "cook");
      if (s.needs.hunger < 40) s = tryDo(s, "snack");
      if (strategy !== "reckless" && s.needs.social < 45) s = tryDo(s, "call");
      if (strategy !== "reckless" && s.needs.fun < 45) s = tryDo(s, "tv");
      if (strategy === "sensible" && dow === 6) s = tryDo(s, "flatmates");
    }

    moodSum += mood(s.needs);
    for (const k of Object.keys(needSum) as (keyof typeof needSum)[]) needSum[k] += s.needs[k];
    if ((Object.values(s.needs) as number[]).some((v) => v < 15)) lowNeedDays++;
    if (s.work === "missed" || (isWorkday(s.day) && s.work === "pending")) missedDays++;
    const before = s.money;
    const slept = sleep({ ...s, location: s.home });
    slept.state = hook(slept.state, { type: "sleep", summary: slept.summary, bedtime: s.clock }, rng);
    if (slept.summary.notes.some((n) => n.includes("Mum"))) bailouts++;
    s = slept.state;
    void before;
    if (dayOfWeek(s.day) === 0) {
      weeklyMoney.push(Math.round(s.money - weekStart));
      weekStart = s.money;
    }
  }
  return {
    weeklyMoney,
    level: s.level,
    avgMood: Math.round(moodSum / opts.days),
    avgMoodAfterWork: Math.round(workMoodSum / opts.days),
    avgNeeds: Object.fromEntries(Object.entries(needSum).map(([k, v]) => [k, Math.round(v / opts.days)])),
    lowNeedDays,
    missedDays,
    mumBailouts: bailouts,
    days: opts.days,
  };
}
