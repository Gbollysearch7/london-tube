import { LINE, STATION } from "../../game/network";
import { lifeLevel, type LifeState, type Result } from "../engine";
import { GOAL, currentWeek, newSeason, newWeek, seasonGoals, seasonOf, weekInSeason, type SeasonGoal, type WeeklyGoal } from "./goals";
import { ADVERT_BOOST, ITEM, MAX_BUSINESSES, TIERS, linesAt, pitchFactor, tierCost } from "./items";
import { activeOwned, isActive } from "./passes";
import type { Business, EconomyState } from "./types";

// Shop and business rules. Pure: each takes a LifeState and returns a new one plus messages.

const MAX_LEDGER = 120;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Money in or out, with a line on the bank statement (the engine's own pay() is private). */
export function pay(s: LifeState, label: string, amount: number): LifeState {
  if (!amount) return s;
  const entry = { day: s.day, clock: s.clock, label, amount: round2(amount) };
  return { ...s, money: round2(s.money + amount), ledger: [entry, ...s.ledger].slice(0, MAX_LEDGER) };
}

export function gainXp(s: LifeState, xp: number, events: string[]): LifeState {
  const before = lifeLevel(s.xp);
  const next = { ...s, xp: s.xp + xp };
  const after = lifeLevel(next.xp);
  if (after > before) events.push(`⭐ Life level ${after}!`);
  return next;
}

/** The economy state for this life, created on first use (old saves have none). */
export function economyOf(s: LifeState): EconomyState {
  const e = s.economy;
  if (e && e.v === 1) return e;
  return {
    v: 1,
    season: newSeason(s, seasonOf(s.day)),
    week: newWeek(s.seed, currentWeek(s.day)),
    owned: [],
    businesses: [],
    titles: [],
    history: [],
    visitedCount: s.visited.length,
  };
}

export const withEconomy = (s: LifeState, e: EconomyState): LifeState => ({ ...s, economy: e });

export const owns = (s: LifeState, id: string) => !!activeOwned(s, id);

/** Days left on a time-limited item, or null if not held / permanent. */
export function daysLeft(s: LifeState, id: string): number | null {
  const o = activeOwned(s, id);
  return o?.expires === undefined ? null : o.expires - s.day;
}

export interface BuyOptions {
  station?: string;
  line?: string;
}

export function buy(s: LifeState, itemId: string, options: BuyOptions = {}): Result {
  const item = ITEM[itemId];
  if (!item) return { state: s, events: ["That's not in the shop."] };
  if (itemId === "advert") return buyAdvert(s, options.line ?? "");
  const e = economyOf(s);
  if (item.needs === "station" && !(options.station && STATION[options.station])) return { state: s, events: ["Pick a station first."] };
  if (item.needs === "line" && !(options.line && LINE[options.line])) return { state: s, events: ["Pick a line first."] };
  const held = e.owned.find((o) => o.id === itemId && isActive(o, s.day));
  if (held && item.days === undefined && !item.needs) return { state: s, events: [`You already own the ${item.name.toLowerCase()}.`] };
  if (held && item.needs && e.owned.some((o) => o.id === itemId && o.station === options.station && o.line === options.line))
    return { state: s, events: ["You already have one there."] };
  if (s.money < item.price) return { state: s, events: [`You need £${item.price} for that.`] };

  let owned = e.owned.filter((o) => isActive(o, s.day));
  if (item.days !== undefined) {
    // Renewing stacks on top of the days you have left.
    const from = Math.max(s.day, held?.expires ?? s.day);
    owned = [...owned.filter((o) => o.id !== itemId), { id: itemId, day: s.day, expires: from + item.days }];
  } else {
    owned = [...owned, { id: itemId, day: s.day, ...(options.station ? { station: options.station } : {}), ...(options.line ? { line: options.line } : {}) }];
  }
  const isFare = item.cat === "travel" && item.days !== undefined;
  const week = isFare ? { ...e.week, fares: round2(e.week.fares + item.price) } : e.week;
  const next = withEconomy(pay(s, `${item.emoji} ${item.name}`, -item.price), { ...e, owned, week });
  return { state: next, events: [held && item.days !== undefined ? `${item.emoji} Renewed: ${item.name}.` : `${item.emoji} Bought: ${item.name}.`] };
}

// --- businesses --------------------------------------------------------------------------

export function businessAt(s: LifeState, station: string): Business | undefined {
  return economyOf(s).businesses.find((b) => b.station === station);
}

export function openBusiness(s: LifeState, station: string): Result {
  const e = economyOf(s);
  if (!STATION[station]) return { state: s, events: ["Pick a station first."] };
  if (e.businesses.some((b) => b.station === station)) return { state: s, events: ["You already trade there."] };
  if (e.businesses.length >= MAX_BUSINESSES) return { state: s, events: [`You can run up to ${MAX_BUSINESSES} businesses.`] };
  const cost = tierCost(station, 0);
  if (s.money < cost) return { state: s, events: [`You need £${cost} to open a cart here.`] };
  const b: Business = { station, tier: 0, invested: cost, openedDay: s.day, earned: 0 };
  const next = withEconomy(pay(s, `☕ Coffee cart pitch · ${STATION[station].name}`, -cost), { ...e, businesses: [...e.businesses, b] });
  return { state: next, events: [`☕ Your coffee cart is trading at ${STATION[station].name}. Takings come in overnight.`] };
}

export function upgradeBusiness(s: LifeState, station: string): Result {
  const e = economyOf(s);
  const b = e.businesses.find((x) => x.station === station);
  if (!b) return { state: s, events: ["You don't trade there."] };
  if (b.tier >= TIERS.length - 1) return { state: s, events: ["That's as big as it gets."] };
  const cost = tierCost(station, b.tier + 1);
  if (s.money < cost) return { state: s, events: [`You need £${cost} to upgrade.`] };
  const t = TIERS[b.tier + 1];
  const nb = { ...b, tier: b.tier + 1, invested: b.invested + cost };
  const next = withEconomy(pay(s, `${t.emoji} Upgrade to ${t.name.toLowerCase()} · ${STATION[station].name}`, -cost), {
    ...e,
    businesses: e.businesses.map((x) => (x.station === station ? nb : x)),
  });
  return { state: next, events: [`${t.emoji} Your ${STATION[station].name} pitch is now a ${t.name.toLowerCase()}.`] };
}

export const SELL_BACK = 0.5;

export function sellBusiness(s: LifeState, station: string): Result {
  const e = economyOf(s);
  const b = e.businesses.find((x) => x.station === station);
  if (!b) return { state: s, events: ["You don't trade there."] };
  const back = Math.round(b.invested * SELL_BACK);
  const next = withEconomy(pay(s, `Sold ${TIERS[b.tier].name.toLowerCase()} · ${STATION[station].name}`, back), {
    ...e,
    businesses: e.businesses.filter((x) => x.station !== station),
  });
  return { state: next, events: [`🤝 Sold your ${STATION[station].name} ${TIERS[b.tier].name.toLowerCase()} for £${back}.`] };
}

export function buyAdvert(s: LifeState, line: string): Result {
  const e = economyOf(s);
  const price = ITEM.advert.price;
  if (!LINE[line]) return { state: s, events: ["Pick a line first."] };
  if (s.money < price) return { state: s, events: [`You need £${price} for that.`] };
  const same = e.advert && e.advert.line === line && s.day < e.advert.expires;
  const expires = (same ? e.advert!.expires : s.day) + 7;
  const next = withEconomy(pay(s, `📣 Advert · ${LINE[line].name}`, -price), { ...e, advert: { line, expires } });
  return { state: next, events: [`📣 Your posters are up on the ${LINE[line].name} for ${expires - s.day} days.`] };
}

/** Is the line advert boosting this station today? */
export function boosted(s: LifeState, station: string, day = s.day): boolean {
  const ad = economyOf(s).advert;
  return !!ad && day < ad.expires && linesAt(station).includes(ad.line);
}

/** One day's takings. Weekdays are busier than weekends, as at real stations. */
export function dailyTakings(s: LifeState, b: Business, day: number): number {
  const weekday = (day - 1) % 7 < 5;
  const base = TIERS[b.tier].daily * pitchFactor(b.station) * (weekday ? 1.1 : 0.75);
  return Math.round(base * (boosted(s, b.station, day) ? ADVERT_BOOST : 1));
}

/** Average takings per week, for the shop screen. */
export const weeklyTakings = (s: LifeState, b: Business) => {
  let t = 0;
  for (let d = 1; d <= 7; d++) t += dailyTakings(s, b, d);
  return t;
};

/** Close the season report: the new season is already running. */
export function dismissReport(s: LifeState): Result {
  const e = economyOf(s);
  if (!e.report) return { state: s, events: [] };
  return { state: withEconomy(s, { ...e, report: undefined }), events: [`🏁 Season ${e.season.n} begins. Good luck!`] };
}

/** The title shown next to your name: your latest one. */
export const currentTitle = (s: LifeState) => {
  const t = s.economy?.titles;
  return t && t.length ? t[t.length - 1] : null;
};

// --- goal getters for the UI ---------------------------------------------------------------

export interface GoalStatus {
  goal: WeeklyGoal;
  value: number;
  done: boolean;
}

export function weeklyGoals(s: LifeState): GoalStatus[] {
  const e = economyOf(s);
  const w = e.week.week === currentWeek(s.day) ? e.week : newWeek(s.seed, currentWeek(s.day));
  return w.goals.map((id) => ({ goal: GOAL[id], value: GOAL[id].progress(w), done: w.done.includes(id) }));
}

export function seasonStatus(s: LifeState): { season: number; week: number; goals: SeasonGoal[]; bonus: boolean } {
  const e = economyOf(s);
  return { season: e.season.n, week: weekInSeason(s.day), goals: seasonGoals(s, e), bonus: e.week.bonus };
}
