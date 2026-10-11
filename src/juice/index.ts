/**
 * Juice: sound, speech, haptics and celebration. Every call respects the phone prefs
 * (sound, volume, announcements, haptics), is throttled, and never throws, so call freely.
 *
 *   sfx(name)          "chime" station bing-bong · "oyster" card tap · "doors" closing beeps ·
 *                      "ping" new message · "coin" money in · "fanfare" big win ·
 *                      "promotion" job promotion jingle · "late" sting · "tap" UI click ·
 *                      "alert" something needs a decision
 *   startRumble() / stopRumble()   quiet train rumble while moving (idempotent)
 *   announce(text)     en-GB speech, off by default; build lines with say.mindTheGap(),
 *                      say.thisIs(line, station), say.nextStation(station). hush() stops it.
 *   buzz(pattern)      navigator.vibrate; "tap" | "event" | "late" | "success" or raw ms
 *   celebrate(kind)    confetti + sound: "small" (visual only), "big" (fanfare), "promotion" (jingle)
 *   <Confetti kind fire? active? />   declarative celebrate() for components
 *
 * Suggested wiring: sfx("ping") on incoming texts, sfx("coin") on wages,
 * celebrate("promotion") on promotions.
 */
export { sfx, startRumble, stopRumble, RECIPES, SFX_GAPS, type SfxName, type Note } from "./sound";
export { announce, hush, say } from "./announce";
export { buzz, BUZZ, type BuzzPattern } from "./haptics";
export { celebrate, type CelebrationKind } from "./celebrate";
export { default as Confetti } from "./Confetti";
export { createThrottle, prefersReducedMotion } from "./throttle";
