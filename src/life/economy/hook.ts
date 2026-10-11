import { LINE, STATION, isRail } from "../../game/network";
import { VENUES } from "../data";
import type { LifeState, Result } from "../engine";
import type { LifeEvent } from "../events";
import { dailyTakings, economyOf, gainXp, pay, withEconomy } from "./core";
import { ALL_THREE_BONUS, GOAL, currentWeek, goalMet, gradeSeason, newSeason, newWeek, seasonGoals, seasonOf, SEASON_WEEKS } from "./goals";
import { ITEM, TIERS } from "./items";
import { activeOwned, isActive } from "./passes";
import type { EconomyState, WeekProgress } from "./types";

// Reacts to everything that happens in London Life: counts progress towards goals, pays out
// rewards and business takings, applies what you own, and closes weeks and seasons.

const DAY = 24 * 60;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const add = <T,>(list: T[], v: T) => (list.includes(v) ? list : [...list, v]);

/** What a trip's route ("victoria:brixton>stockwell", …) tells us. */
export function tripFacts(route: string[], start: number) {
  const lines = route.map((id) => id.split(":")[0]).filter((l) => LINE[l]);
  const modes = lines.map((l) => LINE[l].mode);
  const buses = new Set(lines.filter((l) => LINE[l].mode === "bus"));
  const tod = start % DAY;
  return {
    railLines: [...new Set(lines.filter((l) => isRail(LINE[l].mode)))],
    bus: buses.size > 0,
    // Changing buses inside one journey is what the Hopper fare is for.
    hopper: buses.size >= 2,
    river: modes.includes("boat"),
    bike: modes.includes("bike"),
    walkOnly: modes.length > 0 && modes.every((m) => m === "walk"),
    // Night Tube hours: lines that would otherwise be shut.
    nightTube: modes.includes("tube") && tod >= 30 && tod < 5 * 60 + 30,
    elizabeth: lines.includes("elizabeth"),
    overground: modes.includes("overground"),
  };
}

function track(w: WeekProgress, ev: LifeEvent, s: LifeState, e: EconomyState): WeekProgress {
  switch (ev.type) {
    case "trip": {
      const f = tripFacts(ev.route, ev.start);
      return {
        ...w,
        trips: w.trips + 1,
        lines: f.railLines.reduce(add, w.lines),
        stations: add(w.stations, ev.to),
        busTrips: w.busTrips + (f.bus ? 1 : 0),
        hopper: w.hopper + (f.hopper ? 1 : 0),
        river: w.river + (f.river ? 1 : 0),
        bike: w.bike + (f.bike ? 1 : 0),
        walkTrips: w.walkTrips + (f.walkOnly ? 1 : 0),
        nightTube: w.nightTube + (f.nightTube ? 1 : 0),
        elizabeth: w.elizabeth + (f.elizabeth ? 1 : 0),
        overground: w.overground + (f.overground ? 1 : 0),
        // Net of any daily-cap refund the routes hook just paid for this trip.
        fares: Math.round((w.fares + Math.max(0, ev.cost - (s.routes?.cap?.lastRefund ?? 0))) * 100) / 100,
      };
    }
    case "shift":
      return ev.lateBy === 0 ? { ...w, onTime: w.onTime + 1 } : w;
    case "activity": {
      if (!ev.venueId) return w;
      const isNew = s.visited.length > e.visitedCount;
      const act = VENUES.find((v) => v.id === ev.venueId)?.activities.find((a) => a.id === ev.activityId);
      const started = s.clock - (act?.minutes ?? 0);
      const evening = started >= 17 * 60 && (act?.minutes ?? 0) >= 60;
      return {
        ...w,
        newPlaces: w.newPlaces + (isNew ? 1 : 0),
        evenings: evening ? add(w.evenings, s.day + Math.floor(started / DAY)) : w.evenings,
      };
    }
    case "daily":
      return { ...w, dailies: w.dailies + 1 };
    default:
      return w;
  }
}

/** Pay out any live goals just completed, and the all-three bonus. */
function rewardGoals(s: LifeState, events: string[], final = false): LifeState {
  const e = economyOf(s);
  let w = e.week;
  let next = s;
  for (const id of w.goals) {
    const g = GOAL[id];
    if (w.done.includes(id) || (g.under && !final) || !goalMet(w, id)) continue;
    w = { ...w, done: [...w.done, id] };
    next = pay(next, `🎯 Weekly goal: ${g.label}`, g.reward);
    next = gainXp(next, g.xp, events);
    events.push(`🎯 Weekly goal done: ${g.label}. +£${g.reward}`);
  }
  if (!w.bonus && w.goals.every((id) => w.done.includes(id))) {
    w = { ...w, bonus: true };
    next = pay(next, "🎯 All three weekly goals", ALL_THREE_BONUS.reward);
    next = gainXp(next, ALL_THREE_BONUS.xp, events);
    events.push(`🏆 All three weekly goals! Bonus +£${ALL_THREE_BONUS.reward}`);
  }
  return withEconomy(next, { ...economyOf(next), week: w });
}

function trackSeason(s: LifeState, ev: LifeEvent): LifeState {
  const e = economyOf(s);
  let season = e.season;
  if (ev.type === "shift" && ev.lateBy === 0) season = { ...season, onTime: season.onTime + 1 };
  if (ev.type === "activity" && ev.venueId) season = { ...season, venues: add(season.venues, ev.venueId) };
  if (ev.type === "daily") season = { ...season, dailies: season.dailies + 1 };
  return season === e.season ? s : withEconomy(s, { ...e, season });
}

/** Overnight: business takings, home comforts, expiries, and the week or season rolling over. */
function overnight(s: LifeState, events: string[]): LifeState {
  let next = s;
  const e = economyOf(s);
  const ended = s.day - 1;

  // Takings for the day that just ended.
  if (e.businesses.length) {
    let total = 0;
    const businesses = e.businesses.map((b) => {
      if (b.openedDay > ended) return b;
      const t = dailyTakings(s, b, ended);
      total += t;
      next = pay(next, `${TIERS[b.tier].emoji} Takings · ${TIERS[b.tier].name}, ${STATION[b.station].name}`, t);
      return { ...b, earned: b.earned + t };
    });
    next = withEconomy(next, { ...economyOf(next), businesses });
    if (total) events.push(`☕ Your businesses took £${total} yesterday.`);
  }

  // Home upgrades make mornings better.
  const n = { ...next.needs };
  if (activeOwned(next, "bed")) n.energy = clamp(n.energy + 8);
  if (activeOwned(next, "kitchen")) n.hunger = clamp(n.hunger + 10);
  if (activeOwned(next, "telly")) n.fun = clamp(n.fun + 6);
  if (activeOwned(next, "plants")) {
    n.fun = clamp(n.fun + 3);
    n.social = clamp(n.social + 3);
  }
  next = { ...next, needs: n };

  // Passes and adverts that ran out overnight.
  const en = economyOf(next);
  for (const o of en.owned) if (o.expires === next.day) events.push(`${ITEM[o.id].emoji} Your ${ITEM[o.id].name.toLowerCase()} has expired.`);
  const owned = en.owned.filter((o) => isActive(o, next.day));
  const advert = en.advert && next.day < en.advert.expires ? en.advert : undefined;
  if (en.advert && !advert) events.push("📣 Your line advert has come down.");
  next = withEconomy(next, { ...en, owned, advert });

  // A new week starts on Monday morning.
  if (currentWeek(next.day) !== economyOf(next).week.week) next = endWeek(next, events);
  return next;
}

function endWeek(s: LifeState, events: string[]): LifeState {
  let next = rewardGoals(s, events, true);
  const e = economyOf(next);
  const wk = currentWeek(next.day);
  let season = e.season;
  let report = e.report;
  let titles = e.titles;
  let history = e.history;
  // The sleep that starts week 13 (25, 37, …) closes the season.
  if (wk > 1 && (wk - 1) % SEASON_WEEKS === 0 && seasonOf(next.day) !== e.season.n) {
    const g = gradeSeason(seasonGoals(next, e), e.season.n);
    report = { season: e.season.n, ...g };
    titles = [...titles, g.title];
    history = [...history, { season: e.season.n, grade: g.grade, points: g.points }];
    if (g.reward) next = pay(next, `🏆 Season ${e.season.n} report: grade ${g.grade}`, g.reward);
    events.push(`🏆 Season ${e.season.n} report card: grade ${g.grade}!`);
    season = newSeason(next, e.season.n + 1);
  } else if (seasonOf(next.day) !== e.season.n) {
    // Out of step (an old save, or a skipped day): start the right season quietly.
    season = newSeason(next, seasonOf(next.day));
  }
  return withEconomy(next, { ...economyOf(next), week: newWeek(next.seed, wk), season, report, titles, history });
}

export function economyHook(s: LifeState, ev: LifeEvent): Result {
  const events: string[] = [];
  const first = !s.economy;
  let next = withEconomy(s, economyOf(s));

  if (ev.type === "sleep") {
    next = overnight(next, events);
  } else {
    // Old saves or a stale week: catch up without fanfare.
    const e = economyOf(next);
    if (!first && currentWeek(next.day) !== e.week.week) next = withEconomy(next, { ...e, week: newWeek(next.seed, currentWeek(next.day)) });
    const e2 = economyOf(next);
    next = withEconomy(next, { ...e2, week: track(e2.week, ev, next, e2) });
    next = trackSeason(next, ev);
    next = rewardGoals(next, events);
  }

  if (ev.type === "trip" && ev.stress > 30 && activeOwned(next, "headphones")) {
    // Give back half of the fun the engine took for a stressful ride.
    const back = (ev.stress - 30) * 0.3 * 0.5;
    next = { ...next, needs: { ...next.needs, fun: clamp(next.needs.fun + back) } };
    if (back >= 3) events.push("🎧 Your headphones took the edge off that journey.");
  }
  if (ev.type === "shift" && activeOwned(next, "outfit")) {
    const perf = next.performance + 2;
    next = { ...next, performance: next.level === 5 ? Math.min(perf, 100) : perf };
  }

  next = withEconomy(next, { ...economyOf(next), visitedCount: next.visited.length });
  return { state: next, events };
}
