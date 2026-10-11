import type { CharId } from "./types";

// The people in your London life. Names and voices live here; what they say lives in content.ts.

export interface Character {
  id: CharId;
  name: string;
  emoji: string;
  color: string;
  /** Who they are, shown under their name. */
  role: string;
  /** Starting relationship. */
  rel: number;
}

export const CAST: Record<CharId, Character> = {
  jess: { id: "jess", name: "Jess", emoji: "🧣", color: "#c2569b", role: "Flatmate", rel: 50 },
  dele: { id: "dele", name: "Dele", emoji: "⚽", color: "#ee7c0e", role: "Best mate", rel: 60 },
  boss: { id: "boss", name: "Boss", emoji: "💼", color: "#2546a8", role: "Manager", rel: 40 },
  mum: { id: "mum", name: "Mum", emoji: "🌻", color: "#3ecf8e", role: "Mum", rel: 65 },
  sam: { id: "sam", name: "Sam", emoji: "🌙", color: "#7d4fb8", role: "Someone new", rel: 15 },
  priya: { id: "priya", name: "Priya", emoji: "☕", color: "#00afad", role: "Work mate", rel: 30 },
};

export const CAST_IDS = Object.keys(CAST) as CharId[];

/** The manager depends on the job. */
const BOSSES: Record<string, { name: string; emoji: string; place: string; thing: string }> = {
  retail: { name: "Bev", emoji: "🛍️", place: "the shop floor", thing: "the delivery" },
  cafe: { name: "Marco", emoji: "☕", place: "the café", thing: "the morning rush" },
  tech: { name: "Tom", emoji: "💻", place: "the office", thing: "stand-up" },
  finance: { name: "Victoria", emoji: "📊", place: "the desk", thing: "the market open" },
  civil: { name: "Graham", emoji: "🏛️", place: "the department", thing: "the minister's briefing" },
};

export const bossOf = (job: string) => BOSSES[job] ?? BOSSES.retail;

/** Display details, with the manager adapted to the job. */
export function who(id: CharId, job: string): Character {
  const c = CAST[id];
  if (id !== "boss") return c;
  const b = bossOf(job);
  return { ...c, name: b.name, emoji: b.emoji };
}

/** A soft word for how close you are. Shown subtly in the thread. */
export function closeness(id: CharId, rel: number, flags: string[]): string {
  if (id === "sam") {
    if (flags.includes("sam-official")) return "Together ❤️";
    if (flags.includes("sam-d2")) return "Two dates in";
    if (flags.includes("sam-d1")) return "First date done";
    return rel >= 35 ? "Flirting, probably" : "Getting to know you";
  }
  if (id === "mum") return rel >= 60 ? "Proud of you" : rel >= 35 ? "Mildly worried" : "Very worried";
  if (id === "boss") return rel >= 70 ? "Rates you highly" : rel >= 45 ? "Good books" : rel >= 25 ? "Watching you" : "On thin ice";
  return rel >= 80 ? "Inseparable" : rel >= 60 ? "Close" : rel >= 40 ? "Friendly" : rel >= 20 ? "Acquaintance" : "Drifting";
}
