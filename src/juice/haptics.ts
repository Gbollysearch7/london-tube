import { getPrefs } from "../phone/prefs";

/** Named vibration patterns (ms on/off). Short: these are nudges, not alarms. */
export const BUZZ = {
  tap: 12,
  event: [30, 40, 30],
  late: [80, 60, 80],
  success: [20, 30, 20, 30, 60],
} as const;

export type BuzzPattern = number | readonly number[] | keyof typeof BUZZ;

/** Vibrate if the device supports it and haptics are on. Never throws. */
export function buzz(pattern: BuzzPattern = "tap"): void {
  try {
    if (!getPrefs().haptics) return;
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    const p = typeof pattern === "string" ? BUZZ[pattern] : pattern;
    navigator.vibrate(typeof p === "number" ? p : [...p]);
  } catch {
    // Some browsers throw without a user gesture; haptics are optional.
  }
}
