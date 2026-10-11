import { useSyncExternalStore } from "react";
import { textBonus, welcomeBack, type LifeState, type Result } from "./engine";
import type { LifeEvent } from "./events";
import { runHooks } from "./hooks";

// The player's London Life, saved in this browser. (Online saves come after security is restored.)

const slot = typeof location !== "undefined" ? new URLSearchParams(location.search).get("player")?.replace(/\W/g, "").slice(0, 12) : "";
const KEY = `mind-the-gap:life:v1${slot ? `-${slot}` : ""}`;
const DAILY_KEY = `mind-the-gap:daily:v1${slot ? `-${slot}` : ""}`;

export interface Toast {
  id: number;
  text: string;
}

interface LifeStore {
  life: LifeState | null;
  toasts: Toast[];
}

/** Fill in fields added after a save was made, so older saves keep working. */
export function migrateLife(raw: LifeState): LifeState {
  return {
    ...raw,
    visited: raw.visited ?? [],
    badges: raw.badges ?? [],
    ledger: raw.ledger ?? [],
    hungOutToday: raw.hungOutToday ?? [],
    lastTextBonusAt: raw.lastTextBonusAt ?? 0,
    stats: { trips: 0, shifts: 0, texts: 0, hangouts: 0, nightsOut: 0, moves: 0, ...(raw.stats as Partial<LifeState["stats"]> | undefined) },
    meta: {
      streakDay: raw.meta?.streakDay ?? "",
      streak: raw.meta?.streak ?? 0,
      lastSeen: raw.meta?.lastSeen ?? Date.now(),
      bestStreak: raw.meta?.bestStreak ?? raw.meta?.streak ?? 0,
    },
    dayStart: raw.dayStart ?? { money: raw.money, xp: raw.xp, badges: (raw.badges ?? []).length, level: raw.level },
  };
}

function load(): LifeState | null {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as LifeState) : null;
    return parsed?.version === 1 ? migrateLife(parsed) : null;
  } catch {
    return null;
  }
}

let store: LifeStore = { life: load(), toasts: [] };
const listeners = new Set<() => void>();
let toastId = 0;

function commit(next: LifeStore) {
  store = next;
  try {
    if (next.life) localStorage.setItem(KEY, JSON.stringify(next.life));
    else localStorage.removeItem(KEY);
  } catch {
    // Not saved this time (private mode, full storage); the game keeps going.
  }
  listeners.forEach((l) => l());
}

export function useLife(): LifeStore {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => store,
  );
}

export const getLife = () => store.life;

/** Apply an engine action and show its messages. */
export function act(fn: (s: LifeState) => Result): Result | null {
  if (!store.life) return null;
  const res = fn(store.life);
  commit({ life: res.state, toasts: [...store.toasts, ...res.events.map((text) => ({ id: ++toastId, text }))].slice(-6) });
  return res;
}

export function setLife(life: LifeState | null, events: string[] = []) {
  commit({ life, toasts: [...store.toasts, ...events.map((text) => ({ id: ++toastId, text }))].slice(-6) });
}

export function toast(text: string) {
  commit({ ...store, toasts: [...store.toasts, { id: ++toastId, text }].slice(-6) });
}

export function dismissToast(id: number) {
  commit({ ...store, toasts: store.toasts.filter((t) => t.id !== id) });
}

/** Tell the story, economy and routines systems something happened. */
export function emit(ev: LifeEvent): Result | null {
  return act((s) => runHooks(s, ev));
}

/** On opening the game: daily streak and rested bonus. */
export function greet(now = Date.now()) {
  if (!store.life) return;
  act((s) => welcomeBack(s, now));
  emit({ type: "open", now });
}

/** Texting a real player tops up Social. */
export function onTextSent(now = Date.now()) {
  if (!store.life) return;
  act((s) => textBonus(s, now));
  emit({ type: "text" });
}

// --- daily challenge record (per browser) ---

export interface DailyRecord {
  stars: number;
  points: number;
  rewarded: boolean;
}

export function loadDailyRecords(): Record<string, DailyRecord> {
  try {
    return JSON.parse(localStorage.getItem(DAILY_KEY) ?? "{}") as Record<string, DailyRecord>;
  } catch {
    return {};
  }
}

export function saveDailyRecord(day: string, rec: DailyRecord) {
  try {
    const all = loadDailyRecords();
    localStorage.setItem(DAILY_KEY, JSON.stringify({ ...all, [day]: rec }));
  } catch {
    // ignore
  }
}

// The scored daily run is claimed when it starts, so abandoning and retrying can't dodge a bad run.
const STARTED_KEY = `mind-the-gap:daily-started:v1${slot ? `-${slot}` : ""}`;

export function dailyStarted(day: string): boolean {
  try {
    return localStorage.getItem(STARTED_KEY) === day;
  } catch {
    return false;
  }
}

export function markDailyStarted(day: string) {
  try {
    localStorage.setItem(STARTED_KEY, day);
  } catch {
    // ignore
  }
}
