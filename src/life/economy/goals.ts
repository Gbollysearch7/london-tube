import { mulberry32 } from "../../game/engine";
import { VENUES } from "../data";
import type { LifeState } from "../engine";
import type { EconomyState, Grade, ReportRow, SeasonProgress, WeekProgress } from "./types";

// Weekly goals and 12-week seasons. Pure data and maths; the hook feeds in what happened.

export const SEASON_WEEKS = 12;

const weekOf = (day: number) => Math.floor((day - 1) / 7) + 1;
export const seasonOf = (day: number) => Math.floor((weekOf(day) - 1) / SEASON_WEEKS) + 1;
/** 1..12 within the current season. */
export const weekInSeason = (day: number) => ((weekOf(day) - 1) % SEASON_WEEKS) + 1;
export const currentWeek = weekOf;

// --- weekly goals ---------------------------------------------------------------------------

export interface WeeklyGoal {
  id: string;
  emoji: string;
  label: string;
  target: number;
  reward: number;
  xp: number;
  progress: (w: WeekProgress) => number;
  /** "Under" goals are judged when the week ends: progress must stay below the target. */
  under?: boolean;
}

export const FARE_LIMIT = 20;
/** The fares goal only counts if you actually travelled. */
export const FARE_MIN_TRIPS = 6;

export const WEEKLY_GOALS: WeeklyGoal[] = [
  { id: "lines-3", emoji: "🚇", label: "Ride 3 different lines", target: 3, reward: 25, xp: 30, progress: (w) => w.lines.length },
  { id: "lines-5", emoji: "🗺️", label: "Ride 5 different lines", target: 5, reward: 45, xp: 50, progress: (w) => w.lines.length },
  { id: "river", emoji: "⛴️", label: "Take a river bus", target: 1, reward: 30, xp: 35, progress: (w) => w.river },
  { id: "on-time", emoji: "⏱️", label: "On time every workday", target: 5, reward: 50, xp: 50, progress: (w) => w.onTime },
  { id: "fares", emoji: "💷", label: `Under £${FARE_LIMIT} on travel (${FARE_MIN_TRIPS}+ trips)`, target: FARE_LIMIT, reward: 40, xp: 40, progress: (w) => w.fares, under: true },
  { id: "hopper", emoji: "🎫", label: "Use the bus Hopper", target: 1, reward: 25, xp: 30, progress: (w) => w.hopper },
  { id: "new-place", emoji: "📸", label: "Visit a new place", target: 1, reward: 25, xp: 30, progress: (w) => w.newPlaces },
  { id: "cycle", emoji: "🚲", label: "Cycle somewhere", target: 1, reward: 20, xp: 25, progress: (w) => w.bike },
  { id: "out-2", emoji: "🌃", label: "Go out 2 evenings", target: 2, reward: 30, xp: 35, progress: (w) => w.evenings.length },
  { id: "night-tube", emoji: "🌙", label: "Ride the Night Tube", target: 1, reward: 35, xp: 40, progress: (w) => w.nightTube },
  { id: "daily-3", emoji: "📅", label: "Finish 3 daily challenges", target: 3, reward: 45, xp: 50, progress: (w) => w.dailies },
  { id: "elizabeth", emoji: "💜", label: "Ride the Elizabeth line", target: 1, reward: 20, xp: 25, progress: (w) => w.elizabeth },
  { id: "overground", emoji: "🧡", label: "Ride the Overground", target: 1, reward: 20, xp: 25, progress: (w) => w.overground },
  { id: "bus-5", emoji: "🚌", label: "Take 5 bus journeys", target: 5, reward: 30, xp: 35, progress: (w) => w.busTrips },
  { id: "stations-6", emoji: "📍", label: "Arrive at 6 different stations", target: 6, reward: 30, xp: 35, progress: (w) => w.stations.length },
  { id: "walk", emoji: "🚶", label: "Walk a whole journey", target: 1, reward: 15, xp: 20, progress: (w) => w.walkTrips },
];

export const GOAL: Record<string, WeeklyGoal> = Object.fromEntries(WEEKLY_GOALS.map((g) => [g.id, g]));
export const ALL_THREE_BONUS = { reward: 60, xp: 60 };

/** Three different goals for a week, the same every time for this seed and week. */
export function pickGoals(seed: number, week: number): string[] {
  const rng = mulberry32((seed ^ Math.imul(week, 0x9e3779b1)) >>> 0);
  const pool = WEEKLY_GOALS.map((g) => g.id);
  const out: string[] = [];
  // Never two line-count goals in one week: they'd overlap.
  while (out.length < 3) {
    const id = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    if (id.startsWith("lines-") && out.some((o) => o.startsWith("lines-"))) continue;
    out.push(id);
  }
  return out;
}

export function newWeek(seed: number, week: number): WeekProgress {
  return {
    week,
    goals: pickGoals(seed, week),
    done: [],
    bonus: false,
    lines: [],
    stations: [],
    trips: 0,
    busTrips: 0,
    walkTrips: 0,
    river: 0,
    bike: 0,
    hopper: 0,
    nightTube: 0,
    elizabeth: 0,
    overground: 0,
    fares: 0,
    onTime: 0,
    evenings: [],
    newPlaces: 0,
    dailies: 0,
  };
}

/** Is a live (not "under") goal met right now? */
export const goalMet = (w: WeekProgress, id: string) => {
  const g = GOAL[id];
  return g.under ? w.trips >= FARE_MIN_TRIPS && g.progress(w) < g.target : g.progress(w) >= g.target;
};

// --- seasons ---------------------------------------------------------------------------------

export function newSeason(s: LifeState, n: number): SeasonProgress {
  return { n, startDay: s.day, startMoney: s.money, venues: [], onTime: 0, dailies: 0 };
}

export interface SeasonGoal {
  id: string;
  emoji: string;
  label: string;
  target: number;
  value: number;
  money?: boolean;
}

/** The five season goals, harder each season. */
export function seasonGoals(s: LifeState, e: EconomyState): SeasonGoal[] {
  const n = e.season.n;
  return [
    { id: "savings", emoji: "💰", label: "Saved this season", target: 3000 + 1500 * (n - 1), value: Math.round(s.money - e.season.startMoney), money: true },
    { id: "career", emoji: "📈", label: "Career level", target: Math.min(5, 3 + n), value: s.level },
    { id: "places", emoji: "📸", label: "Places visited this season", target: Math.min(VENUES.length, 8 + 2 * (n - 1)), value: e.season.venues.length },
    { id: "on-time", emoji: "⏱️", label: "On-time workdays", target: Math.min(SEASON_WEEKS * 5, 50 + 2 * (n - 1)), value: e.season.onTime },
    { id: "dailies", emoji: "📅", label: "Daily challenges", target: 4 + 2 * (n - 1), value: e.season.dailies },
  ];
}

export const GRADE_STEPS: { grade: Grade; min: number; reward: number; title: string }[] = [
  { grade: "A", min: 85, reward: 400, title: "Zone 1 Legend" },
  { grade: "B", min: 70, reward: 250, title: "Seasoned Commuter" },
  { grade: "C", min: 55, reward: 150, title: "Platform Regular" },
  { grade: "D", min: 40, reward: 80, title: "Strap-hanger" },
  { grade: "E", min: 25, reward: 30, title: "Lost at Bank" },
  { grade: "F", min: 0, reward: 0, title: "Stuck at the Barrier" },
];

/** Each goal is worth 20 points, with partial credit. */
export function gradeSeason(goals: SeasonGoal[], season: number) {
  const rows: ReportRow[] = goals.map((g) => ({
    id: g.id,
    label: g.label,
    value: g.value,
    target: g.target,
    points: Math.round(20 * Math.max(0, Math.min(1, g.value / g.target))),
  }));
  const points = rows.reduce((a, r) => a + r.points, 0);
  const step = GRADE_STEPS.find((g) => points >= g.min)!;
  return {
    rows,
    points,
    grade: step.grade,
    reward: Math.round(step.reward * (1 + 0.25 * (season - 1))),
    title: `${step.title} · Season ${season}`,
  };
}
