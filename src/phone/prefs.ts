import { useSyncExternalStore } from "react";

// Per-device phone settings. Storage can fail (private mode); the phone still works with defaults.

export interface PhonePrefs {
  wallpaper: "night" | "thames" | "sunset" | "day";
  notifications: boolean;
  /** Sound effects (chimes, beeps, fanfares). */
  sound: boolean;
  /** Master volume for sound effects, 0–1. */
  volume: number;
  /** Spoken station announcements via speech synthesis. Off by default: it can be a lot. */
  announcements: boolean;
  /** Vibration on supported devices. */
  haptics: boolean;
}

const KEY = "mind-the-gap:phone:v1";
export const DEFAULT_PREFS: PhonePrefs = {
  wallpaper: "night",
  notifications: true,
  sound: true,
  volume: 0.6,
  announcements: false,
  haptics: true,
};

const WALLPAPERS: PhonePrefs["wallpaper"][] = ["night", "thames", "sunset", "day"];

/**
 * Turns whatever was saved (old saves lack the sound fields; storage may hold junk) into a
 * complete, valid PhonePrefs. Missing or wrongly typed fields fall back to defaults.
 */
export function normalisePrefs(raw: unknown): PhonePrefs {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const bool = (k: "notifications" | "sound" | "announcements" | "haptics") =>
    typeof r[k] === "boolean" ? (r[k] as boolean) : DEFAULT_PREFS[k];
  const volume =
    typeof r.volume === "number" && Number.isFinite(r.volume) ? Math.min(1, Math.max(0, r.volume)) : DEFAULT_PREFS.volume;
  const wallpaper = WALLPAPERS.includes(r.wallpaper as PhonePrefs["wallpaper"])
    ? (r.wallpaper as PhonePrefs["wallpaper"])
    : DEFAULT_PREFS.wallpaper;
  return {
    wallpaper,
    notifications: bool("notifications"),
    sound: bool("sound"),
    volume,
    announcements: bool("announcements"),
    haptics: bool("haptics"),
  };
}

function load(): PhonePrefs {
  try {
    return normalisePrefs(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return DEFAULT_PREFS;
  }
}

let prefs = load();
const listeners = new Set<() => void>();

export function setPrefs(patch: Partial<PhonePrefs>) {
  prefs = normalisePrefs({ ...prefs, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Not persisted; fine for this session.
  }
  listeners.forEach((l) => l());
}

/** Current prefs for non-React code (sound, speech, haptics). */
export function getPrefs(): PhonePrefs {
  return prefs;
}

export function usePrefs(): PhonePrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => prefs,
  );
}
