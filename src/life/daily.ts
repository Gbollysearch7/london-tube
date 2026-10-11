import { mulberry32 } from "../game/engine";
import { LINE, STATION } from "../game/network";
import { solve } from "../game/solver";
import type { Link, Mission, Mode } from "../game/types";

// "Today in London": one commute per real day, the same for every player.
// Closures come from live TfL disruptions when there are any, otherwise from the date's seed.

/** TfL line ids that exist on the game network under the same id. */
export const GAME_TFL_LINES = ["victoria", "northern", "central", "jubilee", "bakerloo", "piccadilly", "elizabeth", "windrush", "mildmay", "dlr"];

const PAIRS: [string, string][] = [
  ["brixton", "kingscross"],
  ["claphamjn", "stratford"],
  ["peckham", "camden"],
  ["shepherds", "canarywharf"],
  ["highbury", "waterloo"],
  ["hackney", "victoria"],
  ["paddington", "londonbridge"],
  ["stockwell", "liverpool"],
  ["canadawater", "euston"],
  ["stratford", "claphamcommon"],
  ["camden", "peckham"],
  ["canarywharf", "nhg"],
  ["whitechapel", "vauxhall"],
  ["baker", "canadawater"],
  ["claphamcommon", "highbury"],
  ["westminster", "hackney"],
];

const STARTS = [8 * 60 + 10, 8 * 60 + 30, 10 * 60 + 20, 12 * 60 + 15, 14 * 60, 17 * 60 + 40, 18 * 60 + 10];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Same ride events for every player on a given day, so the leaderboard is fair. */
export function dailySeed(day: string): number {
  return hash(`ride:${day}`);
}

export interface DailyChallenge {
  day: string;
  mission: Mission;
  source: "live" | "seeded";
}

/**
 * Build the day's challenge. `liveDisrupted` are game line ids that TfL reports as disrupted right now
 * (pass [] when TfL is unavailable). The result is always finishable on time and on budget.
 */
export function generateDaily(day: string, liveDisrupted: string[]): DailyChallenge {
  const rng = mulberry32(hash(day));
  const [from, to] = PAIRS[Math.floor(rng() * PAIRS.length)];
  const start = STARTS[Math.floor(rng() * STARTS.length)];
  const dow = new Date(`${day}T12:00:00`).getDay(); // 0 Sunday
  const weekday = dow >= 1 && dow <= 5;
  const weather = rng() < 0.3 ? "rain" : "clear";

  const live = liveDisrupted.filter((l) => GAME_TFL_LINES.includes(l)).slice(0, 2);
  let closed = live.length ? live : rng() < 0.6 ? [GAME_TFL_LINES[Math.floor(rng() * 6)]] : [];
  const source: DailyChallenge["source"] = live.length ? "live" : "seeded";

  const base: Mission = {
    id: `daily-${day}`,
    title: "Today in London",
    brief: "",
    from,
    to,
    start,
    deadline: start + 240,
    budget: 50,
    weekday,
    weather,
    closedLines: closed,
    tip: "",
  };

  // Drop closures until the trip is possible at all.
  let fastest = solve(base).fastest;
  while (!fastest && closed.length) {
    closed = closed.slice(1);
    fastest = solve({ ...base, closedLines: closed }).fastest;
  }
  const arrival = fastest ? fastest.est.arrival : start + 60;
  const slack = 6 + Math.floor(rng() * 7);
  const deadline = Math.ceil((arrival + slack) / 5) * 5;
  const withDeadline = { ...base, closedLines: closed, deadline };
  const cheapest = solve(withDeadline).cheapestOnTime;
  const budget = Math.ceil(((cheapest?.est.cost ?? 4) + 0.25 + rng() * 0.75) * 4) / 4;

  const closures = closed.map((l) => LINE[l].name);
  const brief = [
    `Get from ${STATION[from].name} to ${STATION[to].name}.`,
    closures.length
      ? source === "live"
        ? `Live from TfL: the ${closures.join(" and ")} ${closures.length > 1 ? "are" : "is"} disrupted right now, so ${closures.length > 1 ? "they're" : "it's"} closed in today's game.`
        : `The ${closures.join(" and ")} ${closures.length > 1 ? "are" : "is"} closed today.`
      : "Good service on every line. Can you find the perfect route?",
    "Your first run counts for today's leaderboard.",
  ].join(" ");

  return {
    day,
    source,
    mission: {
      ...withDeadline,
      budget,
      brief,
      tip: cheapest ? `The cheapest on-time route cost ${"£" + cheapest.est.cost.toFixed(2)}, arriving ${fmt(cheapest.est.arrival)}.` : "",
    },
  };
}

const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// --- the daily ritual: day key, numbering, countdown, streaks, share card ---

/** A new challenge starts at 07:00 London time, so late-night players still finish "today". */
export const ROLLOVER_HOUR = 7;
/** Live TfL closures are only trusted while the network is running normally. */
const LIVE_FROM = 7 * 60;
const LIVE_UNTIL = 22 * 60;
/** Challenge #1. */
/** Challenge #1. Launch weekend: the first challenge day is the 10th, since before 07:00 on the 11th it is still the 10th's. */
export const FIRST_DAY = "2026-10-10";

const londonFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Wall-clock date and time in London at an instant. */
export function londonClock(ms: number): { y: number; m: number; d: number; minutes: number } {
  const p: Record<string, number> = {};
  for (const part of londonFmt.formatToParts(new Date(ms))) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { y: p.year, m: p.month, d: p.day, minutes: (p.hour % 24) * 60 + p.minute };
}

const ymd = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.toISOString().slice(0, 10);
};

/** Shift a YYYY-MM-DD key by whole days (calendar maths in UTC, so no DST surprises). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return ymd(y, m, d + n);
}

/**
 * The challenge day: the London date of (now − 7h). Done on London wall-clock time, so the switch is at
 * 07:00 local in both GMT and BST, including the mornings the clocks change.
 */
export function challengeDay(ms: number): string {
  const c = londonClock(ms);
  return c.minutes < ROLLOVER_HOUR * 60 ? ymd(c.y, c.m, c.d - 1) : ymd(c.y, c.m, c.d);
}

/** Whether a challenge created now may use live TfL closures (07:00–22:00 London). */
export function liveWindow(ms: number): boolean {
  const { minutes } = londonClock(ms);
  return minutes >= LIVE_FROM && minutes < LIVE_UNTIL;
}

/** "#N", counting 2026-10-11 as #1. */
export function challengeNumber(day: string): number {
  const toMs = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toMs(day) - toMs(FIRST_DAY)) / 86_400_000) + 1;
}

/** London's UTC offset in ms at an instant (0 in GMT, 1h in BST). */
function londonOffset(ms: number): number {
  const c = londonClock(ms);
  const wall = Date.UTC(c.y, c.m - 1, c.d, Math.floor(c.minutes / 60), c.minutes % 60);
  return wall - Math.floor(ms / 60_000) * 60_000;
}

/** Milliseconds until the next challenge goes live (the next 07:00 in London). */
export function msUntilNextChallenge(ms: number): number {
  const next = addDays(challengeDay(ms), 1);
  const [y, m, d] = next.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, ROLLOVER_HOUR);
  const guess = wall - londonOffset(wall);
  const at = wall - londonOffset(guess);
  return Math.max(0, at - ms);
}

/** "5h 12m", "12m", "under a minute". */
export function fmtCountdown(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "under a minute";
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}

/** "Sunday 11 October". */
export function fmtChallengeDate(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export interface DailyStreak {
  /** Consecutive challenge days played, ending today (or yesterday if today isn't played yet). */
  current: number;
  best: number;
  playedToday: boolean;
  /** A streak is running but today's challenge hasn't been played: it breaks at the next rollover. */
  atRisk: boolean;
}

/** Streak over the challenge days a player has a scored run for. */
export function dailyStreak(playedDays: Iterable<string>, today: string): DailyStreak {
  const played = new Set(playedDays);
  const playedToday = played.has(today);
  let current = 0;
  for (let d = playedToday ? today : addDays(today, -1); played.has(d); d = addDays(d, -1)) current++;
  let best = 0;
  for (const d of played) {
    if (played.has(addDays(d, -1))) continue; // only count from the start of each run
    let n = 0;
    for (let k = d; played.has(k); k = addDays(k, 1)) n++;
    best = Math.max(best, n);
  }
  return { current, best, playedToday, atRisk: !playedToday && current > 0 };
}

const MODE_EMOJI: Record<Mode, string> = {
  tube: "🚇",
  elizabeth: "🚄",
  overground: "🚆",
  dlr: "🚈",
  rail: "🚆",
  bus: "🚌",
  boat: "⛴️",
  walk: "🚶",
  bike: "🚲",
};

/** One emoji per leg: consecutive hops on the same line count as one leg. */
export function routeEmoji(route: Pick<Link, "line" | "mode">[]): string {
  let out = "";
  let last = "";
  for (const l of route) {
    if (l.line === last) continue;
    last = l.line;
    out += MODE_EMOJI[l.mode] ?? "🚇";
  }
  return out;
}

/** Spoiler-free, personal-info-free share card. */
export function shareText(o: { day: string; stars: number; arrival: number; cost: number; route?: Pick<Link, "line" | "mode">[]; streak: number; link: string }): string {
  const stars = "★".repeat(o.stars) + "☆".repeat(Math.max(0, 3 - o.stars));
  const legs = o.route?.length ? `${routeEmoji(o.route)} ` : "";
  const lines = [`Tube Life #${challengeNumber(o.day)} 📅 ${stars}`, `${legs}${fmt(Math.floor(o.arrival))} · £${o.cost.toFixed(2)}`];
  if (o.streak > 0) lines.push(`🔥 ${o.streak}-day streak`);
  lines.push(o.link);
  return lines.join("\n");
}
