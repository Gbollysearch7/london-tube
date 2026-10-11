import { getPrefs } from "../phone/prefs";

/** Builders for the classic TfL-style lines, kept pure so they can be tested. */
export const say = {
  mindTheGap: () => "Mind the gap.",
  thisIs: (line: string, station: string) => `This is ${/^[AEIOU]/i.test(line) ? "an" : "a"} ${line} train to ${station}.`,
  nextStation: (station: string) => `The next station is ${station}.`,
};

let voice: SpeechSynthesisVoice | null | undefined;

function britishVoice(): SpeechSynthesisVoice | null {
  if (voice !== undefined) return voice;
  const voices = window.speechSynthesis.getVoices();
  // Voices load asynchronously in some browsers; don't cache an empty list.
  if (voices.length === 0) return null;
  voice = voices.find((v) => v.lang === "en-GB") ?? voices.find((v) => v.lang.startsWith("en-GB")) ?? null;
  return voice;
}

/**
 * Speak a line with an en-GB voice, if announcements are on (off by default).
 * Cancels whatever is still being said so fast-forwarding never builds a backlog. Never throws.
 */
export function announce(text: string): void {
  try {
    if (!getPrefs().announcements) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    const v = britishVoice();
    if (v) u.voice = v;
    u.rate = 0.95;
    u.volume = Math.max(0.1, getPrefs().volume);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // Speech is a nicety.
  }
}

/** Stop any announcement in progress (e.g. leaving the ride). */
export function hush(): void {
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}
