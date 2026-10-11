import { mulberry32 } from "../game/engine";
import { LINE, STATION } from "../game/network";
import type { Charge, Mission, Weather } from "../game/types";
import { passesFor } from "./economy/passes";
import type { EconomyState } from "./economy/types";
import type { RouteMemory } from "./routes/types";
import type { StoryState } from "./story/types";
import {
  AREA,
  BADGE,
  HOME_ACTIVITIES,
  JOB,
  SHIFT_CUTOFF,
  SHIFT_END,
  SHIFT_START,
  STREET_ACTIVITIES,
  VENUES,
  type Activity,
  type NeedKey,
  type Needs,
  type Venue,
} from "./data";

// London Life rules. Every function is pure: it takes a LifeState and returns a new one,
// plus short messages for the player. The UI only renders and calls these.

export type WorkStatus = "pending" | "done" | "missed" | "off";
export type ShiftStyle = "focus" | "team" | "coast";

export interface LedgerEntry {
  day: number;
  clock: number;
  label: string;
  amount: number;
}

export interface LifeState {
  version: 1;
  seed: number;
  name: string;
  avatar: string;
  day: number; // 1 = Monday of week 1
  clock: number; // minutes after midnight of `day`; can run past 24:00
  location: string; // station id
  home: string; // area id (= station id)
  job: string;
  level: number; // career level 1..5
  performance: number; // progress to the next promotion
  needs: Needs;
  money: number;
  xp: number;
  work: WorkStatus;
  onTimeStreak: number;
  rentStreak: number;
  visited: string[]; // venue ids
  badges: string[];
  ledger: LedgerEntry[];
  stats: { trips: number; shifts: number; texts: number; hangouts: number; nightsOut: number; moves: number };
  /** Snapshot at the start of the day, for the summary. */
  dayStart: { money: number; xp: number; badges: number; level: number };
  lastTextBonusAt: number; // real ms
  /** Players already hung out with today (one hang-out per player per day). */
  hungOutToday?: string[];
  /** Characters who text you (story module). */
  story?: StoryState;
  /** Seasons, weekly goals, purchases and businesses (economy module). */
  economy?: EconomyState;
  /** Remembered routes for one-tap trips (routines module). */
  routes?: RouteMemory;
  meta: { streakDay: string; streak: number; lastSeen: number; bestStreak: number };
}

export interface Result {
  state: LifeState;
  events: string[];
}

const DAY = 24 * 60;
const MAX_LEDGER = 120;
export const START_MONEY = 350;
export const TAXI_HOME = 35;
export const MOVE_DEPOSIT_WEEKS = 1;

// --- time ---------------------------------------------------------------------

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** 0 = Monday … 6 = Sunday. */
export const dayOfWeek = (day: number) => (day - 1) % 7;
export const dayName = (day: number) => DAYS[dayOfWeek(day)];
export const isWorkday = (day: number) => dayOfWeek(day) < 5;
export const week = (day: number) => Math.floor((day - 1) / 7) + 1;

/** Calendar day at a clock reading (after midnight it's already tomorrow). */
const calendarDay = (day: number, clock: number) => day + Math.floor(clock / DAY);

// --- needs --------------------------------------------------------------------

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Per hour while awake and out and about. */
const AWAKE: Needs = { energy: -4.5, hunger: -7, social: -1.8, fun: -1.8 };
/** Per hour at work: busy, so time passes differently. */
const AT_WORK: Needs = { energy: -3, hunger: -7, social: -0.6, fun: -1.2 };

function drift(needs: Needs, minutes: number, rates: Needs): Needs {
  const hrs = minutes / 60;
  return {
    energy: clamp(needs.energy + rates.energy * hrs),
    hunger: clamp(needs.hunger + rates.hunger * hrs),
    social: clamp(needs.social + rates.social * hrs),
    fun: clamp(needs.fun + rates.fun * hrs),
  };
}

function boost(needs: Needs, effects: Partial<Needs>): Needs {
  const out = { ...needs };
  for (const k of Object.keys(effects) as NeedKey[]) out[k] = clamp(out[k] + (effects[k] ?? 0));
  return out;
}

/** 0–100. Average of needs, dragged down hard by any need in the red. */
export function mood(n: Needs): number {
  const avg = (n.energy + n.hunger + n.social + n.fun) / 4;
  const red = (Object.values(n) as number[]).filter((v) => v < 20).length;
  return Math.round(clamp(avg - red * 10));
}

export const NEED_LABEL: Record<NeedKey, { label: string; emoji: string }> = {
  energy: { label: "Energy", emoji: "⚡" },
  hunger: { label: "Hunger", emoji: "🍔" },
  social: { label: "Social", emoji: "💬" },
  fun: { label: "Fun", emoji: "🎉" },
};

// --- progression ------------------------------------------------------------------

/** Life level from XP: 100, 300, 600, 1000… */
export function lifeLevel(xp: number): number {
  let lvl = 1;
  while (xp >= (100 * lvl * (lvl + 1)) / 2) lvl++;
  return lvl;
}

export function xpForLevel(lvl: number): number {
  return (100 * (lvl - 1) * lvl) / 2;
}

export const wage = (s: LifeState) => JOB[s.job].pay[s.level - 1];
/** Performance needed for the next promotion: 100, 150, 200, 250. */
export const perfToPromote = (level: number) => 50 + 50 * level;
export const jobTitle = (s: LifeState) => JOB[s.job].titles[s.level - 1];

// --- helpers ------------------------------------------------------------------

function pay(s: LifeState, label: string, amount: number): LifeState {
  if (!amount) return s;
  const entry = { day: s.day, clock: s.clock, label, amount: Math.round(amount * 100) / 100 };
  return { ...s, money: Math.round((s.money + amount) * 100) / 100, ledger: [entry, ...s.ledger].slice(0, MAX_LEDGER) };
}

function award(s: LifeState, id: string, events: string[]): LifeState {
  if (s.badges.includes(id)) return s;
  const b = BADGE[id];
  events.push(`🏅 Badge unlocked: ${b.emoji} ${b.name}`);
  return { ...s, badges: [...s.badges, id], xp: s.xp + 25 };
}

function gainXp(s: LifeState, xp: number, events: string[]): LifeState {
  const before = lifeLevel(s.xp);
  const next = { ...s, xp: s.xp + xp };
  const after = lifeLevel(next.xp);
  if (after > before) events.push(`⭐ Life level ${after}!`);
  return next;
}

// --- setup ------------------------------------------------------------------------

export function newLife(opts: { name: string; avatar: string; home: string; job: string; seed?: number; now?: number }): LifeState {
  const s: LifeState = {
    version: 1,
    seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
    name: opts.name,
    avatar: opts.avatar,
    day: 1,
    clock: 7 * 60,
    location: opts.home,
    home: opts.home,
    job: opts.job,
    level: 1,
    performance: 0,
    needs: { energy: 90, hunger: 55, social: 60, fun: 60 },
    money: START_MONEY,
    xp: 0,
    work: "pending",
    onTimeStreak: 0,
    rentStreak: 0,
    visited: [],
    badges: [],
    ledger: [],
    stats: { trips: 0, shifts: 0, texts: 0, hangouts: 0, nightsOut: 0, moves: 0 },
    dayStart: { money: START_MONEY, xp: 0, badges: 0, level: 1 },
    lastTextBonusAt: 0,
    meta: { streakDay: "", streak: 0, lastSeen: opts.now ?? Date.now(), bestStreak: 0 },
  };
  return s;
}

// --- weather and disruption, seeded per day ----------------------------------------

function dayRng(s: LifeState, salt: number) {
  return mulberry32(s.seed ^ (s.day * 2654435761) ^ salt);
}

export function dayWeather(s: LifeState): Weather {
  return dayRng(s, 1)() < 0.3 ? "rain" : "clear";
}

const STRIKE_LINES = ["victoria", "northern", "central", "jubilee", "bakerloo", "piccadilly"];
const DELAY_LINES = [...STRIKE_LINES, "elizabeth", "windrush", "mildmay", "dlr"];
const CLOSURE_LINES = [...STRIKE_LINES, "windrush", "mildmay", "dlr"];

export type DisruptionKind = "none" | "minor" | "severe" | "strike" | "closure";

export interface Disruption {
  kind: DisruptionKind;
  /** Lines shut all day (a strike or planned engineering works). */
  closed: string[];
  /** Lines running slow: multiplier on in-vehicle time. */
  delayed: Record<string, number>;
}

/**
 * Today's network, seeded per day like real London: weekdays bring minor delays (~35%),
 * severe delays (~10%) or, rarely, a strike (~5%); weekends ~25% planned engineering closure.
 */
export function dayDisruption(s: LifeState): Disruption {
  const r = dayRng(s, 2);
  const x = r();
  const pick = (list: string[]) => list[Math.floor(r() * list.length)];
  if (!isWorkday(s.day)) {
    return x < 0.25 ? { kind: "closure", closed: [pick(CLOSURE_LINES)], delayed: {} } : { kind: "none", closed: [], delayed: {} };
  }
  if (x < 0.05) return { kind: "strike", closed: [pick(STRIKE_LINES)], delayed: {} };
  if (x < 0.15) return { kind: "severe", closed: [], delayed: { [pick(DELAY_LINES)]: 1.6 } };
  if (x < 0.5) {
    const delayed: Record<string, number> = {};
    const count = r() < 0.6 ? 1 : 2;
    while (Object.keys(delayed).length < count) delayed[pick(DELAY_LINES)] = Math.round((1.2 + r() * 0.2) * 20) / 20;
    return { kind: "minor", closed: [], delayed };
  }
  return { kind: "none", closed: [], delayed: {} };
}

function lineList(ids: string[]): string {
  const names = ids.map((id) => LINE[id]?.name ?? id);
  if (names.length > 1 && names.every((n) => n.endsWith(" line"))) {
    const bare = names.map((n) => n.slice(0, -5));
    return `${bare.slice(0, -1).join(", ")} and ${bare[bare.length - 1]} lines`;
  }
  return names.join(" and ");
}

/** One line for the UI, e.g. "Minor delays on the Northern line", or "" on a good service day. */
export function describeDisruption(d: Disruption): string {
  switch (d.kind) {
    case "minor":
      return `Minor delays on the ${lineList(Object.keys(d.delayed))}`;
    case "severe":
      return `Severe delays on the ${lineList(Object.keys(d.delayed))}`;
    case "strike":
      return `Strike: no ${lineList(d.closed)} today`;
    case "closure":
      return `Engineering works: ${lineList(d.closed)} closed today`;
    default:
      return "";
  }
}

/** The line shut all day (strike or engineering works), if any. */
export function dayStrike(s: LifeState): string | null {
  return dayDisruption(s).closed[0] ?? null;
}

const NIGHT_TUBE = new Set(["victoria", "central", "jubilee", "northern", "piccadilly"]);
const ALL_RAIL = ["victoria", "northern", "central", "jubilee", "bakerloo", "piccadilly", "elizabeth", "windrush", "mildmay", "dlr", "rail-waterloo", "rail-victoria", "rail-crosscity"];

/** Lines not running for a trip that starts at `clock`. */
export function closedAt(s: LifeState, clock: number): string[] {
  const tod = clock % DAY;
  const closed = new Set<string>();
  for (const l of dayDisruption(s).closed) closed.add(l);
  if (tod >= 22 * 60 || tod < 7 * 60) closed.add("river");
  if (tod >= 30 && tod < 5 * 60 + 30) {
    // The Night Tube runs on Friday and Saturday nights only (the evening's day decides).
    const evening = clock >= DAY ? s.day : s.day - 1;
    const nightTube = dayOfWeek(evening) === 4 || dayOfWeek(evening) === 5;
    for (const l of ALL_RAIL) if (!(nightTube && NIGHT_TUBE.has(l))) closed.add(l);
  }
  return [...closed];
}

// --- what you can do -------------------------------------------------------------------

export const venuesAt = (station: string): Venue[] => VENUES.filter((v) => v.station === station);

function dayAllowed(a: Activity, day: number): boolean {
  const dow = dayOfWeek(day);
  if (!a.days) return true;
  if (a.days === "weekend") return dow >= 5;
  if (a.days === "weekday") return dow < 5;
  if (a.days === "saturday") return dow === 5;
  return dow === 4 || dow === 5; // friday-saturday
}

export interface ActivityOption {
  activity: Activity;
  venue?: Venue;
  /** Why it can't be done right now, or null if it can. */
  blocked: string | null;
}

export function activityStatus(s: LifeState, a: Activity): string | null {
  if (!dayAllowed(a, s.day)) return a.days === "saturday" ? "Saturdays only" : a.days === "weekend" ? "Weekends only" : a.days === "weekday" ? "Weekdays only" : "Fri & Sat nights";
  if (a.opens !== undefined && s.clock < a.opens) return `Opens ${fmtClock(a.opens)}`;
  if (a.closes !== undefined && s.clock >= a.closes) return "Closed now";
  if (a.cost > 0 && s.money < a.cost) return "Can't afford it";
  return null;
}

export function activitiesHere(s: LifeState): ActivityOption[] {
  const list: ActivityOption[] = [];
  if (s.location === s.home) for (const a of HOME_ACTIVITIES) list.push({ activity: a, blocked: activityStatus(s, a) });
  for (const v of venuesAt(s.location)) for (const a of v.activities) list.push({ activity: a, venue: v, blocked: activityStatus(s, a) });
  if (s.location !== s.home) for (const a of STREET_ACTIVITIES) list.push({ activity: a, blocked: activityStatus(s, a) });
  return list;
}

export function fmtClock(m: number): string {
  const t = Math.floor(m) % DAY;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// --- actions ---------------------------------------------------------------------------

export function doActivity(s: LifeState, a: Activity, venue?: Venue): Result {
  const events: string[] = [];
  const blocked = activityStatus(s, a);
  if (blocked) return { state: s, events: [blocked] };
  let next = pay(s, venue ? `${a.label} · ${venue.name}` : a.label, -a.cost);
  next = { ...next, clock: next.clock + a.minutes, needs: boost(drift(next.needs, a.minutes, AWAKE), a.effects) };
  next = gainXp(next, (a.xp ?? 0) + (venue ? 5 : 0), events);
  if (venue && !next.visited.includes(venue.id)) {
    next = { ...next, visited: [...next.visited, venue.id] };
    events.push(`📸 New postcard: ${venue.emoji} ${venue.name}`);
    next = gainXp(next, 15, events);
  }
  if (venue && s.clock >= 18 * 60) next = { ...next, stats: { ...next.stats, nightsOut: next.stats.nightsOut + (a.minutes >= 90 ? 1 : 0) } };
  if (next.visited.length >= 5) next = award(next, "explorer", events);
  if (next.visited.length >= 12) next = award(next, "londoner", events);
  return afterAction(next, events);
}

/** Hang out with another player who is at the same place. Once per player per day. */
export function hangOut(s: LifeState, otherId: string, otherName: string): Result {
  if (s.hungOutToday?.includes(otherId)) return { state: s, events: [`You've already hung out with ${otherName} today.`] };
  const events: string[] = [`🤝 You hung out with ${otherName}.`];
  let next: LifeState = {
    ...s,
    hungOutToday: [...(s.hungOutToday ?? []), otherId],
    clock: s.clock + 45,
    needs: boost(drift(s.needs, 45, AWAKE), { social: 35, fun: 10 }),
    stats: { ...s.stats, hangouts: s.stats.hangouts + 1 },
  };
  next = gainXp(next, 20, events);
  next = award(next, "hangout", events);
  return afterAction(next, events);
}

/** Texting a real player tops up Social, at most once a minute of real time. */
export function textBonus(s: LifeState, now: number): Result {
  if (now - s.lastTextBonusAt < 60_000) return { state: s, events: [] };
  const events: string[] = [];
  let next: LifeState = {
    ...s,
    needs: boost(s.needs, { social: 6 }),
    lastTextBonusAt: now,
    stats: { ...s.stats, texts: s.stats.texts + 1 },
  };
  if (next.stats.texts >= 10) next = award(next, "texter", events);
  return { state: next, events };
}

export interface TripOutcome {
  to: string;
  arrival: number;
  cost: number;
  stress: number;
  charges: Charge[];
  /** [mode, boarding time] for each leg */
  legs: { mode: string; start: number }[];
}

export function applyTrip(s: LifeState, t: TripOutcome): Result {
  const events: string[] = [];
  const minutes = Math.max(0, t.arrival - s.clock);
  let next = pay(s, `Travel to ${STATION[t.to].name}`, -t.cost);
  const needs = drift(next.needs, minutes, AWAKE);
  // A stressful commute eats into your fun; a long one into your energy.
  next = {
    ...next,
    location: t.to,
    clock: t.arrival,
    needs: boost(needs, { fun: -Math.max(0, t.stress - 30) * 0.3, energy: -minutes * 0.05 }),
    stats: { ...next.stats, trips: next.stats.trips + 1 },
  };
  next = gainXp(next, 3, events);
  if (t.legs.some((l) => l.mode === "bus" && l.start >= DAY && l.start < DAY + 5 * 60)) next = award(next, "night-bus", events);
  if (t.charges.some((c) => c.label.includes("Hopper") && !/Diversion|Replacement/.test(c.label))) next = award(next, "hopper", events);
  if (t.to === s.home && t.arrival >= DAY + 60) next = award(next, "night-owl", events);
  if (t.to === JOB[s.job].station && next.work === "pending" && next.clock >= SHIFT_CUTOFF) {
    events.push("You got to work after 11:00. Your manager sends you home: today counts as missed.");
    next = missDay(next, events);
  }
  return afterAction(next, events);
}

export function canStartShift(s: LifeState): boolean {
  return s.work === "pending" && s.location === JOB[s.job].station && s.clock < SHIFT_CUTOFF;
}

export const SHIFT_STYLES: Record<ShiftStyle, { label: string; emoji: string; hint: string; perf: number; effects: Partial<Needs> }> = {
  focus: { label: "Head down", emoji: "🎯", hint: "Big performance boost. Tiring and joyless.", perf: 14, effects: { energy: -15, fun: -12 } },
  team: { label: "Help the team", emoji: "🤝", hint: "Solid performance and good for your Social.", perf: 9, effects: { energy: -10, social: 15 } },
  coast: { label: "Coast", emoji: "🛋️", hint: "Barely any progress, but you keep your energy.", perf: 2, effects: { energy: -3, fun: 4, social: 4 } },
};

export function workShift(s: LifeState, style: ShiftStyle): Result {
  const events: string[] = [];
  if (!canStartShift(s)) return { state: s, events: ["You can't start a shift right now."] };
  const job = JOB[s.job];
  const start = Math.max(s.clock, SHIFT_START);
  const lateBy = Math.max(0, s.clock - SHIFT_START);
  const fraction = (SHIFT_END - start) / (SHIFT_END - SHIFT_START);
  const m = mood(s.needs);
  const st = SHIFT_STYLES[style];
  const perf = Math.round(st.perf + (m - 50) / 6 + (lateBy === 0 ? 4 : -Math.min(15, lateBy / 4)));
  const earned = Math.round(job.pay[s.level - 1] * fraction);

  let next: LifeState = { ...s, clock: SHIFT_END };
  next = { ...next, needs: boost(drift(next.needs, SHIFT_END - s.clock, AT_WORK), { ...st.effects, hunger: 45 }) };
  next = pay(next, "Lunch", -6);
  next = pay(next, `Wages · ${job.titles[s.level - 1]}${lateBy ? ` (late ${lateBy} min)` : ""}`, earned);
  next = {
    ...next,
    work: "done",
    performance: Math.max(-40, next.performance + perf),
    onTimeStreak: lateBy === 0 ? next.onTimeStreak + 1 : 0,
    stats: { ...next.stats, shifts: next.stats.shifts + 1 },
  };
  events.push(lateBy ? `You were ${lateBy} min late. Earned £${earned}.` : `On time! Earned £${earned}.`);
  if (perf < 0) events.push("Your manager noticed. Performance went down.");
  next = gainXp(next, lateBy ? 15 : 25, events);
  next = award(next, "first-day", events);
  if (next.onTimeStreak >= 5) next = award(next, "punctual", events);

  if (next.level < 5 && next.performance >= perfToPromote(next.level)) {
    next = { ...next, level: next.level + 1, performance: next.performance - perfToPromote(next.level) };
    events.push(`📈 Promoted to ${job.titles[next.level - 1]}! Pay is now £${job.pay[next.level - 1]} a day.`);
    next = gainXp(next, 60, events);
    next = award(next, "promoted", events);
    if (next.level === 5) next = award(next, "top-job", events);
  } else if (next.level === 5) {
    next = { ...next, performance: Math.min(next.performance, 100) };
  }
  return afterAction(next, events);
}

function missDay(s: LifeState, events: string[]): LifeState {
  events.push("📉 Missed work today: no pay, and your manager isn't happy.");
  return { ...s, work: "missed", performance: Math.max(-40, s.performance - 20), onTimeStreak: 0 };
}

/** Running out of energy (or staying out until dawn) sends you home in a cab. */
function afterAction(s: LifeState, events: string[]): Result {
  if (s.needs.energy > 0 && s.clock < DAY + 5 * 60) return { state: s, events };
  events.push(
    s.location === s.home ? "😵 You're running on empty and fall asleep on the sofa." : `😵 Running on empty. You get a cab home (£${TAXI_HOME}) and crash.`,
  );
  let next = s.location === s.home ? s : pay({ ...s, location: s.home }, "Cab home", -TAXI_HOME);
  next = { ...next, location: next.home };
  return { state: next, events };
}

export interface DaySummary {
  day: number;
  earned: number;
  spent: number;
  rent: number;
  xp: number;
  level: number;
  promoted: boolean;
  newBadges: string[];
  notes: string[];
  mood: number;
}

export function canSleep(s: LifeState): boolean {
  return s.location === s.home;
}

/** Exhausted, or it's nearly dawn: the only option left is bed. */
export function mustSleep(s: LifeState): boolean {
  return s.location === s.home && (s.needs.energy <= 0 || s.clock >= DAY + 5 * 60);
}

/** End the day: sleep until 07:00, settle rent and bills, and start the next day. */
export function sleep(s: LifeState): { state: LifeState; summary: DaySummary; events: string[] } {
  const events: string[] = [];
  const notes: string[] = [];
  let next = s;
  if (isWorkday(next.day) && next.work === "pending") next = missDay(next, notes);

  const todays = next.ledger.filter((l) => l.day === next.day);
  const earned = todays.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
  const spent = -todays.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);

  const endMood = mood(next.needs);
  if (next.needs.social > 80) next = award(next, "social", events);
  if ((Object.values(next.needs) as number[]).every((v) => v > 60)) next = award(next, "perfect", events);

  let rent = 0;
  if (dayOfWeek(next.day) === 6) {
    rent = AREA[next.home].rent;
    next = pay(next, `Rent · ${AREA[next.home].name}`, -rent);
    next = { ...next, rentStreak: next.money >= 0 ? next.rentStreak + 1 : 0 };
    notes.push(`🏠 Rent paid: £${rent}.`);
    if (next.rentStreak >= 4) next = award(next, "rent", events);
  }
  if (next.money < 0) {
    next = pay(next, "Overdraft fee", -5);
    notes.push("🏦 You're overdrawn. The bank charged £5.");
  }
  if (next.money < -200) {
    next = pay(next, "Mum (emergency loan)", 250);
    next = { ...next, needs: boost(next.needs, { fun: -15 }) };
    notes.push("📞 Mum sent £250 with a lecture about budgeting. Ouch.");
  }
  if (next.money >= 1000) next = award(next, "saver", events);

  // Sleep until 07:00. Late nights mean less energy tomorrow.
  const hours = (DAY + 7 * 60 - next.clock) / 60;
  const rested = drift(next.needs, hours * 60, { energy: 0, hunger: -2, social: -0.4, fun: 0 });
  rested.energy = clamp(next.needs.energy + Math.max(0, hours) * 13);
  if (hours < 6) notes.push(`😴 Only ${Math.max(0, Math.round(hours))} hours of sleep. You'll feel it.`);

  const summary: DaySummary = {
    day: next.day,
    earned: Math.round(earned),
    spent: Math.round(spent),
    rent,
    xp: next.xp - next.dayStart.xp,
    level: lifeLevel(next.xp),
    promoted: next.level > next.dayStart.level,
    newBadges: next.badges.slice(next.dayStart.badges),
    notes,
    mood: endMood,
  };

  const day = next.day + 1;
  next = {
    ...next,
    day,
    clock: 7 * 60,
    location: next.home,
    needs: rested,
    hungOutToday: [],
    work: isWorkday(day) ? "pending" : "off",
    dayStart: { money: next.money, xp: next.xp, badges: next.badges.length, level: next.level },
  };
  return { state: next, summary, events };
}

// --- moving and changing jobs ---------------------------------------------------------------

export function moveHome(s: LifeState, area: string): Result {
  const events: string[] = [];
  const a = AREA[area];
  if (!a || area === s.home) return { state: s, events: ["You already live there."] };
  const deposit = a.rent * MOVE_DEPOSIT_WEEKS;
  if (s.money < deposit) return { state: s, events: [`You need £${deposit} for the deposit.`] };
  let next = pay(s, `Deposit · ${a.name}`, -deposit);
  next = { ...next, home: area, stats: { ...next.stats, moves: next.stats.moves + 1 } };
  events.push(`📦 You moved to ${a.name}. Rent is now £${a.rent} a week.`);
  next = award(next, "mover", events);
  return { state: next, events };
}

export function changeJob(s: LifeState, job: string): Result {
  if (!JOB[job] || job === s.job) return { state: s, events: [] };
  // Experience carries over partly: you start one level lower than you were (min 1).
  const level = Math.max(1, s.level - 1);
  return {
    state: { ...s, job, level, performance: 0, onTimeStreak: 0, work: s.work === "pending" ? "pending" : s.work },
    events: [`💼 New job: ${JOB[job].titles[level - 1]} at ${JOB[job].place}.`],
  };
}

// --- trips ------------------------------------------------------------------------------

export type TripPurpose = "work" | "home" | "venue" | "other";

export function tripPurpose(s: LifeState, to: string): TripPurpose {
  if (to === JOB[s.job].station && s.work === "pending") return "work";
  if (to === s.home) return "home";
  return venuesAt(to).length ? "venue" : "other";
}

/** A planner/ride mission for a trip from where you are now. */
export function tripMission(s: LifeState, to: string): Mission {
  const purpose = tripPurpose(s, to);
  const dest = STATION[to].name;
  const venue = venuesAt(to)[0];
  // Work trips: due at 09:00, or by the 11:00 cutoff if you're already late.
  const deadline = purpose === "work" ? (s.clock < SHIFT_START ? SHIFT_START : SHIFT_CUTOFF) : s.clock + 180;
  const title = purpose === "work" ? "Commute to work" : purpose === "home" ? "Heading home" : `Off to ${venue?.name ?? dest}`;
  const disruption = dayDisruption(s);
  const closedLines = closedAt(s, s.clock);
  // Delays only matter on lines that are actually running.
  const delayedLines = Object.fromEntries(Object.entries(disruption.delayed).filter(([l]) => !closedLines.includes(l)));
  return {
    id: "life-trip",
    title,
    brief:
      purpose === "work"
        ? s.clock < SHIFT_START
          ? `Your shift at ${JOB[s.job].place} starts at 09:00.`
          : `You're already late for work. Get there before 11:00 or the day is lost.`
        : purpose === "home"
          ? "Time to head home."
          : `${venue ? venue.emoji + " " : ""}${dest}. No rush, but every minute and every pound comes out of your day.`,
    from: s.location,
    to,
    start: s.clock,
    deadline,
    budget: Math.max(0, Math.floor(s.money * 100) / 100),
    weekday: isWorkday(calendarDay(s.day, s.clock)),
    weather: dayWeather(s),
    closedLines,
    delayedLines,
    tip: describeDisruption(disruption),
    passes: passesFor(s),
  };
}

// --- real-world days: streaks and the rested bonus ------------------------------------------------

export function isoDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prevIsoDay(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return isoDay(d.getTime());
}

/** Called when the game opens. Rewards coming back; never punishes time away. */
export function welcomeBack(s: LifeState, now: number): Result {
  const events: string[] = [];
  const today = isoDay(now);
  let next = s;
  if (s.meta.streakDay !== today) {
    const streak = s.meta.streakDay === prevIsoDay(today) ? s.meta.streak + 1 : 1;
    const reward = 10 * Math.min(streak, 7);
    next = pay({ ...next, meta: { ...next.meta, streakDay: today, streak, bestStreak: Math.max(streak, next.meta.bestStreak) } }, `Daily streak bonus (day ${streak})`, reward);
    events.push(
      streak > 1
        ? `🔥 ${streak}-day streak! +£${reward}`
        : s.meta.streak === 0
          ? `🎁 Daily bonus: +£${reward}. Play again tomorrow to start a streak 🔥`
          : `👋 Welcome back! +£${reward} daily bonus`,
    );
    if (streak >= 7) next = award(next, "streak-7", events);
  }
  if (now - s.meta.lastSeen >= 18 * 3600 * 1000) {
    next = { ...next, needs: boost(next.needs, { energy: 15, social: 10, fun: 15 }) };
    events.push("😌 You feel rested after your time away.");
  }
  next = { ...next, meta: { ...next.meta, lastSeen: now } };
  return { state: next, events };
}

/** Money for finishing today's daily challenge. */
export function dailyReward(s: LifeState, stars: number): Result {
  const events: string[] = [];
  const amount = 15 * stars;
  let next = amount ? pay(s, `Daily challenge (${"★".repeat(stars)})`, amount) : s;
  next = gainXp(next, 20 + stars * 10, events);
  next = award(next, "daily", events);
  if (amount) events.push(`📅 Daily challenge reward: +£${amount}`);
  return { state: next, events };
}
