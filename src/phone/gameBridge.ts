import { useEffect, useState, useSyncExternalStore } from "react";
import type { Journey } from "../game/engine";
import type { Progress } from "../game/progress";
import type { Outcome } from "../game/scoring";
import type { Link, Mission } from "../game/types";

// What the phone apps can see of the game: the current screen, mission, plan and live ride.

export interface GameView {
  screen: "menu" | "plan" | "ride" | "result" | "life" | "daily";
  /** What you're up to in London Life, shown to other players. */
  lifeStatus?: string;
  mission: Mission | null;
  route: Link[];
  journey: Journey | null;
  outcome: Outcome | null;
  progress: Progress;
}

let view: GameView = { screen: "menu", mission: null, route: [], journey: null, outcome: null, progress: {} };
const listeners = new Set<() => void>();

export type GameDestination = "life" | "daily" | "menu";
let navigateFn: ((to: GameDestination) => void) | null = null;

/** Lets phone apps jump to a game screen (e.g. the Today app opens the daily challenge). */
export function registerNavigator(fn: (to: GameDestination) => void) {
  navigateFn = fn;
}

export function navigateGame(to: GameDestination) {
  navigateFn?.(to);
}

export function setGameView(patch: Partial<GameView>) {
  view = { ...view, ...patch };
  listeners.forEach((l) => l());
}

export function useGameView(): GameView {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => view,
  );
}

/** Re-render every `ms` while mounted, for apps that read the live (mutable) journey. */
export function useTicker(ms = 250) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}
