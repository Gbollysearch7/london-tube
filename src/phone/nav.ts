import { useSyncExternalStore } from "react";

export type AppId =
  | "messages"
  | "chat"
  | "newgroup"
  | "contacts"
  | "player"
  | "go"
  | "status"
  | "arrivals"
  | "weather"
  | "wallet"
  | "clock"
  | "fares"
  | "feed"
  | "league"
  | "postcards"
  | "tunes"
  | "tips"
  | "invite"
  | "help"
  | "settings"
  | "bank"
  | "jobs"
  | "homes"
  | "today"
  | "badges"
  | "story"
  | "shop"
  | "goals";

export interface Screen {
  app: AppId;
  /** e.g. a conversation or player id */
  id?: string;
}

interface PhoneNav {
  open: boolean;
  stack: Screen[];
}

let nav: PhoneNav = { open: false, stack: [] };
const listeners = new Set<() => void>();
const emit = (next: PhoneNav) => {
  nav = next;
  listeners.forEach((l) => l());
};

export function usePhoneNav(): PhoneNav {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => nav,
  );
}

/** Open the phone, optionally straight into an app. */
export function openPhone(screen?: Screen) {
  emit({ open: true, stack: screen ? [screen] : nav.stack });
}

export function closePhone() {
  emit({ ...nav, open: false });
}

export function togglePhone() {
  if (nav.open) closePhone();
  else openPhone();
}

/** Go deeper inside the phone (keeps Back working). */
export function push(screen: Screen) {
  emit({ open: true, stack: [...nav.stack, screen] });
}

/** Replace the top screen, e.g. contact → chat without stacking. */
export function replace(screen: Screen) {
  emit({ open: true, stack: [...nav.stack.slice(0, -1), screen] });
}

export function back() {
  emit({ ...nav, stack: nav.stack.slice(0, -1) });
}

export function home() {
  emit({ ...nav, stack: [] });
}
