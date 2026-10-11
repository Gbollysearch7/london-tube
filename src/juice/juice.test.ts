import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, normalisePrefs } from "../phone/prefs";
import { say } from "./announce";
import { buzz } from "./haptics";
import { celebrate } from "./celebrate";
import { RECIPES, SFX_GAPS, sfx, startRumble, stopRumble } from "./sound";
import { createThrottle } from "./throttle";

describe("prefs", () => {
  it("defaults: sound and haptics on, announcements off", () => {
    expect(normalisePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS.sound).toBe(true);
    expect(DEFAULT_PREFS.haptics).toBe(true);
    expect(DEFAULT_PREFS.announcements).toBe(false);
    expect(DEFAULT_PREFS.volume).toBeGreaterThan(0);
  });

  it("migrates an old save without the new fields, keeping what it had", () => {
    const p = normalisePrefs({ wallpaper: "thames", notifications: false });
    expect(p).toEqual({ ...DEFAULT_PREFS, wallpaper: "thames", notifications: false });
  });

  it("repairs junk values and clamps volume", () => {
    const p = normalisePrefs({ wallpaper: "neon", sound: "yes", volume: 7, haptics: 0 });
    expect(p.wallpaper).toBe(DEFAULT_PREFS.wallpaper);
    expect(p.sound).toBe(true);
    expect(p.volume).toBe(1);
    expect(p.haptics).toBe(true);
    expect(normalisePrefs({ volume: -2 }).volume).toBe(0);
    expect(normalisePrefs({ volume: NaN }).volume).toBe(DEFAULT_PREFS.volume);
    expect(normalisePrefs("garbage")).toEqual(DEFAULT_PREFS);
  });

  it("is JSON round-trippable", () => {
    const p = normalisePrefs({ sound: false, volume: 0.3, announcements: true });
    expect(normalisePrefs(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});

describe("throttle", () => {
  it("blocks repeats inside the gap, per key", () => {
    const allow = createThrottle({ chime: 500 });
    expect(allow("chime", 0)).toBe(true);
    expect(allow("chime", 200)).toBe(false);
    expect(allow("chime", 499)).toBe(false);
    expect(allow("chime", 500)).toBe(true);
    expect(allow("other", 501)).toBe(true); // unknown key: fallback gap 0
    expect(allow("other", 501)).toBe(true);
  });

  it("does not extend the window on blocked calls", () => {
    const allow = createThrottle({}, 100);
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 90)).toBe(false);
    expect(allow("a", 100)).toBe(true);
  });
});

describe("sounds and speech", () => {
  it("every sound has notes and a throttle gap", () => {
    for (const [name, notes] of Object.entries(RECIPES)) {
      expect(notes.length, name).toBeGreaterThan(0);
      expect(SFX_GAPS[name as keyof typeof SFX_GAPS], name).toBeGreaterThan(0);
      for (const n of notes) expect(n.dur).toBeGreaterThan(0);
    }
  });

  it("builds TfL-style lines with the right article", () => {
    expect(say.thisIs("Central line", "Ealing Broadway")).toBe("This is a Central line train to Ealing Broadway.");
    expect(say.thisIs("Elizabeth line", "Abbey Wood")).toBe("This is an Elizabeth line train to Abbey Wood.");
    expect(say.nextStation("Bank")).toBe("The next station is Bank.");
  });

  it("never throws without browser APIs", () => {
    expect(() => {
      sfx("chime");
      startRumble();
      stopRumble();
      buzz("late");
      celebrate("big");
    }).not.toThrow();
  });
});
