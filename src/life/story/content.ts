import { LINE, STATION } from "../../game/network";
import { solve } from "../../game/solver";
import { AREA, JOB, SHIFT_START, type Needs } from "../data";
import { dayName, dayStrike, dayWeather, fmtClock, isWorkday, jobTitle, tripMission, venuesAt, wage, type LifeState } from "../engine";
import type { LifeEvent } from "../events";
import { bossOf } from "./cast";
import type { CharId, StoryState, Vars } from "./types";

// What the cast says and when. Each event: a trigger, 1–3 texts, and 2–3 replies with effects.
// The hook (hook.ts) decides cadence; this file is just the script.

export interface Ctx {
  s: LifeState;
  st: StoryState;
  ev: LifeEvent | null;
  rng: () => number;
  vars: Vars;
  day: number;
  /** Clock as LifeState keeps it (may be past 24:00). */
  tod: number;
  abs: number;
  /** 0 = Monday … 6 = Sunday. */
  dow: number;
  rel: (id: CharId) => number;
  has: (flag: string) => boolean;
  /** Game days since a flag was set (Infinity if never). */
  since: (flag: string) => number;
  atHome: boolean;
  work: string;
}

export interface Effect {
  money?: number;
  moneyLabel?: string;
  needs?: Partial<Needs>;
  perf?: number;
  rel?: number;
  xp?: number;
  /** Minutes that pass (a phone call, a favour). */
  clock?: number;
  flags?: string[];
  unflags?: string[];
  /** The character's answer. */
  reply?: string[];
  follow?: { event: string; after: number; vars?: Vars };
  /** Accept the event's invite. */
  plan?: boolean;
  toast?: string;
}

export interface Choice {
  label: string;
  show?: (c: Ctx) => boolean;
  effect?: (c: Ctx) => Effect;
}

export interface StoryEvent {
  id: string;
  who: CharId;
  /** onboard and reactive ignore the daily budget; follow only fires from the queue. */
  kind: "onboard" | "reactive" | "ambient" | "follow";
  once?: boolean;
  /** Game days before it can fire again. */
  cooldown?: number;
  weight?: number;
  when?: (c: Ctx) => boolean;
  /** Fix the details (station, times, coin flips) once, when the text is sent. Null = not now. */
  prepare?: (c: Ctx) => Vars | null;
  msgs: (c: Ctx) => string[];
  /** Happens as the text arrives (Mum's £20). */
  onFire?: (c: Ctx) => Effect;
  choices?: Choice[];
  invite?: { hit: (c: Ctx) => Effect; miss: (c: Ctx) => Effect };
  /** Minutes before unanswered replies lapse (invites lapse when the window opens). */
  expiresIn?: number;
  ignored?: (c: Ctx) => Effect;
}

// --- helpers -----------------------------------------------------------------------

const H = (h: number, m = 0) => h * 60 + m;
const ev = <T extends LifeEvent["type"]>(c: Ctx, t: T) => (c.ev?.type === t ? (c.ev as Extract<LifeEvent, { type: T }>) : null);
const pick = <T,>(c: Ctx, xs: T[]) => xs[Math.floor(c.rng() * xs.length)];
const between = (c: Ctx, a: number, b: number) => c.tod >= a && c.tod <= b;
const v = (c: Ctx, k: string) => String(c.vars[k] ?? "");
const stationName = (id: string) => STATION[id]?.name ?? id;

/** Somewhere to meet: never your own front door. */
function meet(c: Ctx, stations: string[], from: number, until: number, place?: (st: string) => string, label?: (place: string) => string): Vars | null {
  const opts = stations.filter((x) => x !== c.s.home && STATION[x]);
  if (!opts.length || c.tod > from - 45) return null;
  const station = pick(c, opts);
  const p = place ? place(station) : venuesAt(station)[0]?.name ?? stationName(station);
  return { station, stationName: stationName(station), place: p, from, until, fromT: fmtClock(from), untilT: fmtClock(until), label: label ? label(p) : p };
}

/** A plan at home (games night). */
function atHomePlan(c: Ctx, from: number, until: number, label: string): Vars | null {
  if (c.tod > from - 30) return null;
  return { station: c.s.home, stationName: stationName(c.s.home), place: "the flat", from, until, fromT: fmtClock(from), untilT: fmtClock(until), label };
}

/** How the line is said out loud. */
function lineSpeak(id: string): string {
  const l = LINE[id];
  if (!l) return "the tube";
  if (l.mode === "bus") return `the ${l.name.replace("Bus ", "")} bus`;
  if (l.mode === "overground") return "the Overground";
  if (l.mode === "dlr") return "the DLR";
  if (l.mode === "rail") return "the train";
  return `the ${l.name}`;
}

/** Jess's commute advice: the obvious line from home to work, found with the route solver. */
export function commuteTip(s: LifeState): { line: string; text: string } {
  const work = JOB[s.job].station;
  const workName = stationName(work);
  if (work === s.home) return { line: "stairs", text: `Work's at ${workName}? That's literally round the corner, you jammy thing. Shift's 9:00, so you can lie in till 08:40.` };
  try {
    const base = tripMission({ ...s, clock: H(7, 45), location: s.home, work: "pending" }, work);
    const sol = solve({ ...base, closedLines: [] }, 6).fastest;
    if (sol) {
      const mins = new Map<string, number>();
      const seq: string[] = [];
      for (const l of sol.route) {
        if (l.mode === "walk") continue;
        mins.set(l.line, (mins.get(l.line) ?? 0) + l.minutes);
        if (seq[seq.length - 1] !== l.line) seq.push(l.line);
      }
      const total = Math.max(5, Math.round(sol.est.arrival - base.start));
      const leave = Math.floor((SHIFT_START - total - 10) / 5) * 5;
      if (!seq.length) return { line: "walk", text: `Work's at ${workName}, yeah? It's a walk, about ${total} mins. Shift's 9:00, leave by ${fmtClock(leave)} and you're golden.` };
      const main = [...mins.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const changes = seq.length - 1;
      const how = changes === 0 ? `straight there on ${lineSpeak(main)}` : `${lineSpeak(seq[0])}, then ${lineSpeak(seq[1])}${changes > 1 ? " and a bit more" : ""}`;
      return {
        line: lineSpeak(main),
        text: `Work's at ${workName}, yeah? From ${stationName(s.home)} it's ${how}, about ${total} mins door to door. Shift's 9:00, so leave by ${fmtClock(leave)} and you're golden.`,
      };
    }
  } catch {
    // The solver is a nicety here; fall through to generic advice.
  }
  return { line: "the tube", text: `Work's at ${workName}, yeah? Plan it on the map before you go. Shift's 9:00, leave by half eight and you're golden.` };
}

const SAM_SPOTS: Record<string, string> = {
  peckham: "the rooftop in Peckham",
  waterloo: "the South Bank",
  kingscross: "Coal Drops Yard",
  londonbridge: "Borough Market",
  brixton: "Brixton Village",
  camden: "Camden Market",
};

const nextMorning = (c: Ctx, at = H(8, 30)) => Math.max(60, 1440 - (c.tod % 1440) + at);

// --- the script ----------------------------------------------------------------------

export const EVENTS: StoryEvent[] = [
  // ===== Day one with Jess =====
  {
    id: "jess-welcome",
    who: "jess",
    kind: "onboard",
    once: true,
    when: (c) => c.day === 1,
    prepare: (c) => ({ tip: commuteTip(c.s).text }),
    msgs: (c) => [
      `Oi oi! You made it 🎉 Welcome to the flat. I'm Jess, your new flatmate and self-appointed ${AREA[c.s.home]?.name ?? "London"} tour guide.`,
      `Kettle's on. There's bread, eggs, and a yoghurt I'd describe as "historic". Make breakfast before you go, trust me.`,
      v(c, "tip"),
    ],
    choices: [
      { label: "Thanks Jess, you're a star 🙌", effect: () => ({ rel: 5, reply: ["Stop it. Go eat your eggs 🍳"] }) },
      { label: "What happened to the yoghurt?", effect: () => ({ rel: 3, needs: { fun: 3 }, reply: ["We don't talk about the yoghurt.", "Have a good first day x"] }) },
    ],
    expiresIn: 12 * 60,
  },
  {
    id: "jess-evening1",
    who: "jess",
    kind: "onboard",
    once: true,
    when: (c) => c.day === 1 && c.tod >= H(16, 30) && c.tod < H(21) && c.st.seen["jess-welcome"] !== undefined,
    prepare: (c) => {
      const from = Math.max(H(19, 30), c.tod + 45);
      return atHomePlan(c, from, from + 120, "Games night with Jess");
    },
    msgs: (c) => [
      `How was day one?! Tell me everything. Actually tell me later, I'm making my famous "everything in the fridge" pasta.`,
      `Games night at ours, ${v(c, "fromT")}–${v(c, "untilT")}. Be home and you're in. Loser does the washing up 🎲`,
    ],
    choices: [
      { label: "I'm in. Prepare to lose 😤", effect: () => ({ plan: true, rel: 2, reply: ["Big talk. I've been practising against the toaster."] }) },
      { label: "Can I just come for the pasta?", effect: () => ({ plan: true, rel: 1, reply: ["Pasta is a ticket, not a gift. You're playing."] }) },
      { label: "Knackered, rain check?", effect: () => ({ rel: -1, reply: ["Fair. Pasta's in the fridge if you change your mind 🍝"] }) },
    ],
    invite: {
      hit: () => ({ needs: { social: 25, fun: 20, hunger: 20 }, rel: 8, xp: 20, reply: ["YOU MADE IT. Right, rules: there are no rules. I'm already cheating."], toast: "🎲 Games night with Jess. Pasta was… brave." }),
      miss: () => ({ rel: -4, reply: ["Played Monopoly against myself. I lost. Somehow. 😔"] }),
    },
  },
  {
    id: "jess-bed1",
    who: "jess",
    kind: "onboard",
    once: true,
    when: (c) => c.day === 1 && c.tod >= H(21, 30) && c.tod < H(26),
    prepare: (c) => ({ line: commuteTip(c.s).line }),
    msgs: (c) => [
      v(c, "line") === "stairs"
        ? "Big day tomorrow. Bed before midnight, even if work is two minutes away."
        : `Big day tomorrow. Bed before midnight or you'll be a zombie on ${v(c, "line")}.`,
      "Night x 🌙",
    ],
    choices: [
      { label: "Night Jess 😴", effect: () => ({ rel: 2 }) },
      { label: "One more episode…", effect: () => ({ needs: { fun: 5 }, reply: ["Famous last words."] }) },
    ],
  },

  // ===== Reactive: things you did =====
  {
    id: "boss-first",
    who: "boss",
    kind: "reactive",
    once: true,
    when: (c) => !!ev(c, "shift") && c.s.stats.shifts === 1,
    msgs: (c) => [`Good first day. You picked up ${bossOf(c.s.job).thing} quicker than most.`, "Same again tomorrow. 9:00 sharp, not 9:01."],
    choices: [
      { label: "Thanks, see you at 9 💪", effect: () => ({ rel: 5, reply: ["Good."] }) },
      { label: "My feet are in bits", effect: () => ({ rel: 2, reply: ["You'll get used to it. Or you won't, and you'll stop noticing."] }) },
    ],
  },
  {
    id: "boss-promo",
    who: "boss",
    kind: "reactive",
    when: (c) => !!ev(c, "shift")?.promoted,
    msgs: (c) => [`It's official: you're our new ${jobTitle(c.s)}. Well deserved.`, "Don't let it go to your head. Okay, a little bit."],
    choices: [
      { label: "Thank you! Won't let you down", effect: () => ({ rel: 6, reply: ["I know. That's why you got it."] }) },
      { label: "Does this mean a bigger mug?", effect: () => ({ rel: 3, needs: { fun: 5 }, reply: ["Same mug. More responsibility. Congratulations."] }) },
    ],
  },
  {
    id: "mum-proud",
    who: "mum",
    kind: "reactive",
    when: (c) => !!ev(c, "shift")?.promoted,
    msgs: () => ["PROMOTED?! Your auntie told me before you did. Your AUNTIE.", "I've told the family WhatsApp. Sorry. Actually not sorry. So proud of you ❤️"],
    choices: [
      { label: "Thanks Mum ❤️", effect: () => ({ rel: 6, needs: { social: 8 }, reply: ["Now eat something to celebrate. Something green."] }) },
      { label: "Mum, not the WhatsApp", effect: () => ({ rel: 3, needs: { fun: 4 }, reply: ["Too late. Your uncle has sent a thumbs up. That's huge for him."] }) },
    ],
  },
  {
    id: "boss-late",
    who: "boss",
    kind: "reactive",
    cooldown: 1,
    when: (c) => (ev(c, "shift")?.lateBy ?? 0) > 0,
    prepare: (c) => ({ late: ev(c, "shift")?.lateBy ?? 0 }),
    msgs: (c) => [`You were ${v(c, "late")} minutes late today.`, dayStrike(c.s) ? "I know about the strike. Leave earlier on strike days." : "Trains, was it?"],
    choices: [
      { label: "Signal failure, I swear", effect: () => ({ rel: -1, reply: ["Ah yes. The famous signal failure."] }) },
      { label: "Sorry, won't happen again", effect: () => ({ rel: 2, reply: ["Good. I'll hold you to that."] }) },
      { label: "I stopped for a croissant 🥐", effect: () => ({ rel: -4, needs: { fun: 6 }, reply: ["…Was it at least a good croissant?"] }) },
    ],
  },
  {
    id: "boss-missed",
    who: "boss",
    kind: "reactive",
    cooldown: 1,
    when: (c) => {
      const sl = ev(c, "sleep");
      if (sl) return sl.summary.notes.some((n) => n.includes("Missed work"));
      const t = ev(c, "trip");
      return !!t && t.to === c.work && c.s.work === "missed";
    },
    msgs: () => ["Didn't see you today. Everything all right?"],
    choices: [
      { label: "Sorry, I was ill 🤒", effect: () => ({ rel: -2, reply: ["Feel better. A heads-up next time, please."] }) },
      { label: "Honestly? Overslept.", effect: () => ({ rel: -5, reply: ["Honesty noted. So is the alarm clock aisle in Argos."] }) },
      { label: "It won't happen again", effect: () => ({ rel: 1, reply: ["Let's make sure it doesn't."] }) },
    ],
  },
  {
    id: "boss-overtime",
    who: "boss",
    kind: "reactive",
    cooldown: 6,
    when: (c) => {
      const sh = ev(c, "shift");
      return !!sh && !sh.promoted && sh.lateBy === 0 && c.dow < 4 && c.s.stats.shifts > 2 && c.rng() < 0.3;
    },
    msgs: () => ["Anyone able to stay until 19:00 tonight? Paid, obviously. And there's pizza 🍕"],
    choices: [
      {
        label: "I'll stay",
        effect: (c) =>
          c.s.location !== c.work
            ? { reply: ["Ah, you've already gone. Next time!"] }
            : { clock: 120, needs: { energy: -12, hunger: 20 }, money: Math.round(wage(c.s) * 0.3), moneyLabel: "Overtime", perf: 5, rel: 6, reply: ["Legend. Pizza's in the back."] },
      },
      { label: "Can't tonight, sorry", effect: () => ({ rel: -1, reply: ["No worries."] }) },
    ],
    expiresIn: 45,
  },
  {
    id: "priya-hello",
    who: "priya",
    kind: "reactive",
    once: true,
    when: (c) => !!ev(c, "shift") && c.s.stats.shifts >= 2,
    msgs: () => ["Hiii, it's Priya from work 👋 I'm the one who knows where the good mugs are hidden.", `If anyone offers you the "World's Best Dad" mug, say no. It has a history.`],
    choices: [
      { label: "Tell me everything about the mugs", effect: () => ({ rel: 6, needs: { fun: 3 }, flags: ["priya-met"], reply: ["Lunch soon. I'll brief you. Bring a notebook."] }) },
      { label: "Thanks Priya! 😄", effect: () => ({ rel: 4, flags: ["priya-met"] }) },
    ],
    ignored: () => ({ flags: ["priya-met"] }),
  },
  {
    id: "dele-payday",
    who: "dele",
    kind: "reactive",
    cooldown: 6,
    when: (c) => !!ev(c, "shift") && c.dow === 4,
    prepare: (c) => meet(c, ["hackney", "shoreditch", "londonbridge"], H(18, 30), H(20), undefined, (p) => `Friday pint with Dele · ${p}`),
    msgs: (c) => [
      "FRIDAYYY. It's payday. (It isn't, we get paid daily. But it FEELS like payday.)",
      `Pint at ${v(c, "place")}? ${v(c, "fromT")}–${v(c, "untilT")}, meet at ${v(c, "stationName")}. First round's yours, obviously.`,
    ],
    choices: [
      { label: "Go on then 🍺", effect: () => ({ plan: true, reply: ["YES. See you there."] }) },
      { label: "Can't, I'm skint", effect: () => ({ rel: -1, reply: ["Skint is a state of mind. But fair. Next week."] }) },
    ],
    invite: {
      hit: () => ({ money: -6, moneyLabel: "Round with Dele", needs: { social: 35, fun: 15, energy: -6 }, rel: 8, xp: 20, reply: ["There they are! Your pint's on the table. Well, half of it. I got thirsty."] }),
      miss: (c) => ({ rel: -6, reply: [`Waited at ${v(c, "stationName")} till ${v(c, "untilT")}. Drank your pint out of spite 🍺`] }),
    },
  },
  {
    id: "mum-overdrawn",
    who: "mum",
    kind: "reactive",
    cooldown: 5,
    when: (c) => !!ev(c, "sleep") && c.s.money < 0,
    msgs: () => ["The bank app sent me a notification. I don't know how I'm still on your account, but here we are.", "Are you overdrawn? Be honest."],
    choices: [
      {
        label: "…a little bit 😬",
        effect: (c) =>
          c.rel("mum") >= 40
            ? { money: 30, moneyLabel: "Mum (top-up)", rel: 2, reply: ["Sent £30. For emergencies only. A meal deal is not an emergency."] }
            : { rel: 1, reply: ["Make a budget. A real one. On paper."] },
      },
      { label: "No, all fine!", effect: () => ({ rel: -3, reply: ["Hmm. I'm your mother. I can tell from here."] }) },
    ],
  },
  {
    id: "jess-hungry",
    who: "jess",
    kind: "reactive",
    cooldown: 2,
    when: (c) => c.s.needs.hunger < 22 && c.day > 1 && between(c, H(8), H(23)),
    prepare: (c) => ({ home: c.atHome ? 1 : 0 }),
    msgs: (c) => [
      "I can hear your stomach from my room. Through a wall. Eat something!!",
      c.vars.home ? `There's half a lasagne in the fridge. I wrote your name on it. Well, I wrote "NOT JESS'S".` : "Grab a meal deal or something, you'll fade away.",
    ],
    choices: [
      { label: "Lasagne. Right now 🙏", show: (c) => !!c.vars.home, effect: () => ({ needs: { hunger: 35 }, clock: 10, rel: 4, reply: ["The lasagne has found its purpose."] }) },
      { label: "On it", show: (c) => !c.vars.home, effect: () => ({ rel: 1, reply: ["Proper food, not just crisps."] }) },
      { label: "I'm fine, I'm fasting (by accident)", effect: () => ({ reply: ["That's not fasting, that's forgetting."] }) },
    ],
    expiresIn: 4 * 60,
  },
  {
    id: "jess-strike",
    who: "jess",
    kind: "reactive",
    cooldown: 1,
    when: (c) => !!ev(c, "sleep") && !!dayStrike(c.s),
    prepare: (c) => ({ line: lineSpeak(dayStrike(c.s) ?? "") }),
    msgs: (c) => [`Heads up 🪧 ${v(c, "line")} is on strike today. Plan a different way in.`, "Platforms will be rammed. Bring snacks and patience."],
    choices: [
      { label: "Cheers for the warning", effect: () => ({ rel: 3 }) },
      { label: "Bus it is 🚌", effect: () => ({ rel: 2, reply: ["Top deck, front seat. It's the only way."] }) },
    ],
  },
  {
    id: "jess-rent",
    who: "jess",
    kind: "reactive",
    cooldown: 6,
    when: (c) => !!ev(c, "sleep") && c.dow === 5,
    prepare: (c) => ({ rent: AREA[c.s.home]?.rent ?? 0 }),
    msgs: (c) => [
      `Rent reminder from your favourite flatmate 🏠 £${v(c, "rent")} goes out tomorrow night.`,
      c.s.money < Number(c.vars.rent) ? "Your face when you check your balance: 😬" : "Please don't make me have The Conversation with the landlord again.",
    ],
    choices: [
      { label: "All sorted 👍", show: (c) => c.s.money >= Number(c.vars.rent), effect: () => ({ rel: 2, reply: ["Look at you. A responsible adult."] }) },
      { label: "Define 'sorted'…", show: (c) => c.s.money < Number(c.vars.rent), effect: () => ({ rel: 1, reply: ["Pick up some shifts? Sell a kidney? Kidding. Mostly. You've got till tomorrow night."] }) },
      { label: "What's The Conversation?", effect: () => ({ rel: 2, needs: { fun: 4 }, reply: ["He brings his own chair. It's terrifying."] }) },
    ],
  },
  {
    id: "jess-late-night",
    who: "jess",
    kind: "reactive",
    cooldown: 3,
    when: (c) => {
      const t = ev(c, "trip");
      return !!t && t.to === c.s.home && t.arrival >= H(24, 30);
    },
    prepare: (c) => ({ time: fmtClock(c.tod) }),
    msgs: (c) => [`Was that you crashing in at ${v(c, "time")} or a fox? Genuinely couldn't tell.`],
    choices: [
      { label: "Definitely a fox 🦊", effect: () => ({ rel: 2, needs: { fun: 4 }, reply: ["Foxes don't usually say 'shh' that loudly."] }) },
      { label: "Sorry!! I'll make you breakfast", effect: () => ({ rel: 5, reply: ["Holding you to that. Eggs. Two of them."] }) },
    ],
  },
  {
    id: "dele-daily",
    who: "dele",
    kind: "reactive",
    cooldown: 2,
    when: (c) => !!ev(c, "daily"),
    prepare: (c) => ({ stars: ev(c, "daily")?.stars ?? 0 }),
    msgs: (c) => [
      Number(c.vars.stars) >= 3 ? `Saw your daily commute. ${v(c, "stars")} stars?? Who are you, the Mayor?` : `Saw your daily commute. ${v(c, "stars")} star${c.vars.stars === 1 ? "" : "s"}. Not bad. Not good either. But not bad.`,
      "I got five. (I didn't play. But I would have got five.)",
    ],
    choices: [
      { label: "Prove it then", effect: () => ({ rel: 3, reply: ["I don't have to prove anything. I'm a legend in my own head."] }) },
      { label: "Let me have this, Dele", effect: () => ({ rel: 4, needs: { fun: 3 }, reply: ["Fine. Best commuter in London. Today only."] }) },
    ],
  },
  {
    id: "mum-back",
    who: "mum",
    kind: "reactive",
    // Fired directly by the hook on "open" after two real days away.
    when: (c) => c.vars.away === 1,
    msgs: () => ["Oh, you're ALIVE. Lovely. I'd started writing the eulogy.", "Text your mother. Or call. A text is fine. A call is better."],
    choices: [
      { label: "Sorry Mum, been mad busy", effect: () => ({ rel: 2, reply: ["Busy is good. Too busy for your mum is not."] }) },
      { label: "Calling you now 📞", effect: () => ({ rel: 5, clock: 20, needs: { social: 12 }, reply: ["…that was twenty minutes about next door's extension. Worth it. Love you."] }) },
    ],
  },

  // ===== Follow-ups =====
  {
    id: "jess-payback",
    who: "jess",
    kind: "follow",
    msgs: () => ["Told you! Sent you £12. The extra £2 is interest. And emotional damages for the boiler."],
    onFire: () => ({ money: 12, moneyLabel: "Jess paid you back" }),
    choices: [
      { label: "Pleasure doing business 🤝", effect: () => ({ rel: 3 }) },
      { label: "Best flatmate in London", effect: () => ({ rel: 4, reply: ["I KNOW. Tell the landlord."] }) },
    ],
  },
  {
    id: "dele-bet-result",
    who: "dele",
    kind: "follow",
    prepare: (c) => ({ win: c.rng() < 0.5 ? 1 : 0 }),
    msgs: (c) => (c.vars.win ? ["Fine. The Northern line didn't break down. I'm shaken. Sent you a fiver 😤"] : ["Told you. Northern line, 08:12, signal failure at Kennington. Pay up 😎"]),
    onFire: (c) => (c.vars.win ? { money: 5, moneyLabel: "Won a bet with Dele" } : {}),
    choices: [
      { label: "Pleasure 💸", show: (c) => !!c.vars.win, effect: () => ({ rel: 2, reply: ["Enjoy it. It's cursed money."] }) },
      { label: "Sending it 💸", show: (c) => !c.vars.win, effect: () => ({ money: -5, moneyLabel: "Lost a bet to Dele", rel: 3, reply: ["Pleasure doing business 😎"] }) },
      { label: "Double or nothing?", effect: () => ({ rel: 2, reply: ["…You're on. Watch this space."] }) },
    ],
  },
  {
    id: "dele-referral-pay",
    who: "dele",
    kind: "follow",
    msgs: () => ["They didn't have a role in the end, but they paid the referral bonus anyway. Half's yours. £50 🤑"],
    onFire: () => ({ money: 50, moneyLabel: "Referral bonus (via Dele)", xp: 20 }),
    choices: [
      { label: "You're a legend", effect: () => ({ rel: 5 }) },
      { label: "Drinks on me then", effect: () => ({ rel: 6, reply: ["Writing that down. I'll be collecting."] }) },
    ],
  },
  {
    id: "sam-after-d1",
    who: "sam",
    kind: "follow",
    msgs: () => ["Had a really nice time last night. Just saying. Okay bye 🙈"],
    choices: [
      { label: "Me too. Again soon?", effect: () => ({ rel: 6, needs: { fun: 5 }, reply: ["Already planning it."] }) },
      { label: "Who is this? 😉", effect: () => ({ rel: 4, needs: { fun: 5 }, reply: ["Oh, you're FUNNY funny. Great. That's a problem."] }) },
    ],
  },

  // ===== Ambient: Jess =====
  {
    id: "jess-gary",
    who: "jess",
    kind: "ambient",
    once: true,
    msgs: () => ["Update: I've named the plant Gary 🌱", "Gary is thriving. Please don't tell Gary I forgot about him for a month."],
    choices: [
      { label: "Hi Gary 👋", effect: () => ({ rel: 3, needs: { fun: 4 }, reply: ["Gary says hi. Gary is a fern of few words."] }) },
      { label: "Gary deserves better", effect: () => ({ rel: 1, needs: { fun: 5 }, reply: ["Wow. Gary and I need a minute."] }) },
    ],
  },
  {
    id: "jess-bins",
    who: "jess",
    kind: "ambient",
    cooldown: 9,
    when: (c) => isWorkday(c.day) && between(c, H(7), H(9, 30)),
    msgs: () => ["Is it bin day? It feels like bin day. Why does nobody know when bin day is"],
    choices: [
      { label: "It's always bin day, Jess", effect: () => ({ rel: 2, needs: { fun: 3 }, reply: ["That's the most London thing anyone's ever said to me."] }) },
      { label: "Put them out, just in case", effect: () => ({ rel: 3, reply: ["Done. The fox is already eyeing them up 🦊"] }) },
    ],
  },
  {
    id: "jess-borrow",
    who: "jess",
    kind: "ambient",
    cooldown: 14,
    when: (c) => c.s.money >= 60 && c.rel("jess") >= 40 && c.day >= 3,
    msgs: () => ["Awkward one. Can I borrow £10 for the electric? I'll pay you back in a few days.", "I have a spreadsheet. It's colour coded."],
    choices: [
      { label: "Course, sending now", effect: () => ({ money: -10, moneyLabel: "Lent Jess £10", rel: 7, reply: ["You absolute angel. Spreadsheet updated 📊"], follow: { event: "jess-payback", after: 3 * 1440 } }) },
      { label: "I'm skint too, sorry", effect: () => ({ rel: -2, reply: ["No stress! Me and the spreadsheet will figure it out."] }) },
    ],
  },
  {
    id: "jess-takeaway",
    who: "jess",
    kind: "ambient",
    cooldown: 5,
    weight: 1.5,
    when: (c) => c.atHome && between(c, H(18), H(21, 30)) && c.s.money >= 9,
    msgs: () => ["Takeaway? I'm thinking curry. I'm always thinking curry 🍛", "£9 each, the usual place."],
    choices: [
      { label: "In. Get me a korma", effect: () => ({ money: -9, moneyLabel: "Takeaway with Jess", needs: { hunger: 45, social: 12 }, rel: 5, reply: ["Korma for you, vindaloo for me, regret for us both. Ordering!"] }) },
      { label: "Cooking tonight, but thanks", effect: () => ({ rel: 1, reply: ["Look at you, all self-sufficient. Gross. Proud of you."] }) },
    ],
    expiresIn: 90,
  },
  {
    id: "jess-games",
    who: "jess",
    kind: "ambient",
    cooldown: 6,
    when: (c) => (c.dow === 3 || c.dow === 6) && between(c, H(12), H(18)) && c.rel("jess") >= 45,
    prepare: (c) => atHomePlan(c, H(19, 30), H(22), "Games night with Jess"),
    msgs: (c) => [`Games night at ours tonight! ${v(c, "fromT")}–${v(c, "untilT")}.`, "I've got a new game. The rules are 40 pages. We'll skip most of them."],
    choices: [
      { label: "Count me in 🎲", effect: () => ({ plan: true, reply: ["Yesss. I'll get snacks. And a lawyer, for the rules."] }) },
      { label: "Not tonight, sorry", effect: () => ({ rel: -1, reply: ["The cat from next door it is, then."] }) },
    ],
    invite: {
      hit: () => ({ needs: { social: 25, fun: 25 }, rel: 6, xp: 15, reply: ["You came! I've already read the rules wrong. Let's go 🎲"] }),
      miss: () => ({ rel: -4, reply: ["Played it with the cat from next door. The cat won 🐈"] }),
    },
  },
  {
    id: "jess-sunset",
    who: "jess",
    kind: "ambient",
    cooldown: 7,
    when: (c) => c.dow === 5 && between(c, H(10), H(16)) && c.rel("jess") >= 50,
    prepare: (c) => meet(c, ["peckham", "shoreditch", "londonbridge"], H(18), H(19, 30), undefined, (p) => `Sunset drinks with Jess · ${p}`),
    msgs: (c) => ["Saturday plans: you, me, sunset, overpriced drinks.", `${v(c, "place")}, meet at ${v(c, "stationName")} ${v(c, "fromT")}–${v(c, "untilT")}. I'll be the one in the unnecessary sunglasses 😎`],
    choices: [
      { label: "I'll be there", effect: () => ({ plan: true, reply: ["Wear something that says 'I have my life together'. Lie if you must."] }) },
      { label: "Can't today", effect: () => ({ rel: -1, reply: ["Your loss. The sunset will be mediocre without you."] }) },
    ],
    invite: {
      hit: () => ({ money: -8, moneyLabel: "Drinks with Jess", needs: { social: 30, fun: 25 }, rel: 8, xp: 15, reply: ["LOOK AT THAT SKY. Okay, it's mostly a crane. Still beautiful."] }),
      miss: (c) => ({ rel: -5, reply: [`Sunset happened. You didn't. Waited at ${v(c, "stationName")} till ${v(c, "untilT")} 🌇`] }),
    },
  },
  {
    id: "jess-boiler",
    who: "jess",
    kind: "ambient",
    cooldown: 10,
    when: (c) => between(c, H(7), H(10)) || between(c, H(18), H(23)),
    msgs: () => ["The boiler is making the noise again. The haunted one.", "If I don't text back, the boiler got me. Tell my mum I love her."],
    choices: [
      { label: "RIP Jess 🕯️", effect: () => ({ rel: 2, needs: { fun: 4 }, reply: ["Update: I hit it with a slipper. It's fine now. Science."] }) },
      { label: "Turned it off and on again?", effect: () => ({ rel: 2, reply: ["I've tried turning MYSELF off and on. No improvement."] }) },
    ],
  },
  {
    id: "jess-clean",
    who: "jess",
    kind: "ambient",
    cooldown: 8,
    when: (c) => c.atHome && c.dow >= 5 && between(c, H(9), H(15)),
    msgs: () => ["Big clean of the flat? I'll do the kitchen if you do the bathroom. Deal?"],
    choices: [
      { label: "Deal 🧽", effect: () => ({ clock: 45, needs: { energy: -8, fun: -4 }, rel: 7, reply: ["Deal. I've made a playlist called 'Scrubbing Bangers'."] }) },
      { label: "Can I do the kitchen?", effect: () => ({ rel: 2, reply: ["No. Nobody wants the bathroom. That's the whole point."] }) },
    ],
    expiresIn: 3 * 60,
  },

  // ===== Ambient: Dele =====
  {
    id: "dele-hello",
    who: "dele",
    kind: "ambient",
    once: true,
    weight: 4,
    when: (c) => c.day >= 2,
    msgs: () => ["Oi. You actually moved to London?? Without telling me??", "Joking, you did tell me. I just wasn't listening. Welcome to the big smoke 🏙️"],
    choices: [
      { label: "Miss me already?", effect: () => ({ rel: 4, reply: ["Never. Okay, a bit. Pint soon."] }) },
      { label: "It's bigger than I thought", effect: () => ({ rel: 3, reply: ["Everyone says that. Then you ride the Night Tube and it all makes sense."] }) },
    ],
  },
  {
    id: "dele-fantasy",
    who: "dele",
    kind: "ambient",
    cooldown: 9,
    when: (c) => c.st.seen["dele-hello"] !== undefined,
    msgs: () => ["My fantasy football team is in shambles.", "I captained a man who got injured warming up. Warming. Up."],
    choices: [
      { label: "Unlucky, mate", effect: () => ({ rel: 3, reply: ["It's not luck. It's a curse. I'm cursed."] }) },
      { label: "That's not a team, it's a cry for help", effect: () => ({ rel: 3, needs: { fun: 4 }, reply: ["Wow. Blocked. (Not blocked.)"] }) },
    ],
  },
  {
    id: "dele-bet",
    who: "dele",
    kind: "ambient",
    cooldown: 10,
    when: (c) => c.dow <= 2 && c.st.seen["dele-hello"] !== undefined,
    msgs: () => ["Fiver says the Northern line breaks down before Friday."],
    choices: [
      { label: "You're on 🤝", effect: () => ({ rel: 2, reply: ["Deal. Easiest fiver of my life."], follow: { event: "dele-bet-result", after: 2 * 1440 } }) },
      { label: "Never bet against the Northern line", effect: () => ({ rel: 2, reply: ["Smart. The Northern line always wins."] }) },
    ],
  },
  {
    id: "dele-gig",
    who: "dele",
    kind: "ambient",
    cooldown: 7,
    weight: 2,
    when: (c) => (c.dow === 4 || c.dow === 5) && between(c, H(10), H(17, 30)),
    prepare: (c) => meet(c, ["camden"], H(19, 30), H(20, 30), () => "the Roundhouse", () => "Gig with Dele · Camden"),
    msgs: (c) => ["Got a spare ticket for a gig at the Roundhouse tonight 🎤 Band's called Damp Sock. They're better than they sound.", `Meet me at Camden Town, ${v(c, "fromT")}–${v(c, "untilT")}?`],
    choices: [
      { label: "Damp Sock? I'm in 🎸", effect: () => ({ plan: true, reply: ["Knew you'd say yes. Wear shoes you don't love."] }) },
      { label: "Not tonight, mate", effect: () => ({ rel: -1, reply: ["Your loss. Damp Sock will remember this."] }) },
    ],
    invite: {
      hit: () => ({ needs: { social: 30, fun: 40, energy: -10 }, rel: 10, xp: 25, reply: ["You made it! Damp Sock are on in ten. Earplugs? No? Brave."], toast: "🎤 Gig with Dele. Damp Sock were… loud." }),
      miss: (c) => ({ rel: -8, reply: [`Waited at Camden till ${v(c, "untilT")}. Gave your ticket to a man called Steve. Steve had a great time.`] }),
    },
  },
  {
    id: "dele-match",
    who: "dele",
    kind: "ambient",
    cooldown: 7,
    weight: 3,
    when: (c) => c.dow === 5 && between(c, H(7), H(10, 30)),
    prepare: (c) =>
      c.s.home === "stratford"
        ? { station: "stratford", stationName: "Stratford", place: "the stadium", from: H(12), until: H(13), fromT: "12:00", untilT: "13:00", label: "Match with Dele · Stratford" }
        : meet(c, ["stratford"], H(12), H(13), () => "the stadium", () => "Match with Dele · Stratford"),
    msgs: (c) => ["Match day ⚽", `Meet me at Stratford, ${v(c, "fromT")}–${v(c, "untilT")}. I've got a spare ticket and a very optimistic scarf.`],
    choices: [
      { label: "Come on you… whoever we are", effect: () => ({ plan: true, reply: ["That's the spirit. Roughly."] }) },
      { label: "Can't today", effect: () => ({ rel: -1, reply: ["The scarf is disappointed in you."] }) },
    ],
    invite: {
      hit: () => ({ needs: { fun: 45, social: 35, energy: -10 }, rel: 10, xp: 25, reply: ["THERE you are. Kick-off in an hour. Pie first, obviously 🥧"], toast: "⚽ Match day with Dele." }),
      miss: () => ({ rel: -8, reply: ["You missed it. We lost. I'm choosing to blame you."] }),
    },
  },
  {
    id: "dele-pub",
    who: "dele",
    kind: "ambient",
    cooldown: 6,
    weight: 1.5,
    when: (c) => c.dow <= 3 && between(c, H(10), H(16, 30)),
    prepare: (c) => meet(c, ["hackney", "brixton", "londonbridge"], H(18, 30), H(20), undefined, (p) => `Pint with Dele · ${p}`),
    msgs: (c) => [`Pint after work? ${v(c, "place")}, ${v(c, "fromT")}–${v(c, "untilT")}. Meet at ${v(c, "stationName")}.`, "I need to tell you about my landlord. It's a saga. There are chapters."],
    choices: [
      { label: "I need to hear this saga", effect: () => ({ plan: true, reply: ["Chapter one: the boiler. Bring snacks."] }) },
      { label: "Rain check?", effect: () => ({ rel: -1, reply: ["Fine. The saga continues without you."] }) },
    ],
    invite: {
      hit: () => ({ money: -6, moneyLabel: "Round with Dele", needs: { social: 35, fun: 15, energy: -8 }, rel: 8, xp: 15, reply: ["Right. Sit down. So my landlord…"] }),
      miss: () => ({ rel: -6, reply: ["Told the landlord saga to the barman instead. He's on my side, by the way."] }),
    },
  },
  {
    id: "dele-referral",
    who: "dele",
    kind: "ambient",
    once: true,
    weight: 3,
    when: (c) => c.rel("dele") >= 70 && c.day >= 5,
    msgs: () => ["Serious one for a sec. My work's paying referral bonuses and I told them you're a genius.", "Can I put your name down? Worst case, free biscuits at the interview."],
    choices: [
      { label: "Go on then", effect: () => ({ rel: 3, reply: ["Done. I'll let you know."], follow: { event: "dele-referral-pay", after: 1440 } }) },
      { label: "Happy where I am", effect: () => ({ rel: 2, reply: ["Fair. Offer stands."] }) },
    ],
  },
  {
    id: "dele-free",
    who: "dele",
    kind: "ambient",
    cooldown: 10,
    weight: 2,
    when: (c) => c.rel("dele") >= 70 && between(c, H(10), H(17)),
    prepare: (c) => meet(c, ["brixton", "londonbridge", "camden"], H(19), H(20, 30), undefined, (p) => `Dinner on Dele · ${p}`),
    msgs: (c) => ["Got a bonus at work. Tonight's on me. No arguments.", `${v(c, "place")}, meet at ${v(c, "stationName")} ${v(c, "fromT")}–${v(c, "untilT")}.`],
    choices: [
      { label: "Who are you and what have you done with Dele?", effect: () => ({ plan: true, rel: 2, reply: ["Character growth. Don't get used to it."] }) },
      { label: "Can't tonight 😩", effect: () => ({ rel: -1, reply: ["The offer expires. Like milk. Like my generosity."] }) },
    ],
    invite: {
      hit: () => ({ needs: { hunger: 45, social: 35, fun: 20 }, rel: 6, xp: 20, reply: ["Order anything. Within reason. Okay, anything."], toast: "🍛 Dinner's on Dele tonight." }),
      miss: () => ({ rel: -5, reply: ["Ate both dinners. No regrets. Some regrets."] }),
    },
  },
  {
    id: "dele-sunday",
    who: "dele",
    kind: "ambient",
    cooldown: 6,
    when: (c) => c.dow === 6 && between(c, H(7), H(11)),
    msgs: () => ["Why is my head like this", "Why does Sunday exist. Who invented it. I want names."],
    choices: [
      { label: "Fry-up. Only cure.", effect: () => ({ rel: 3, reply: ["Already on it. Hash browns: three."] }) },
      { label: "Drink some water, mate", effect: () => ({ rel: 2, reply: ["Water? On a Sunday? Okay, Mum."] }) },
    ],
  },

  // ===== Ambient: the boss =====
  {
    id: "boss-weekend",
    who: "boss",
    kind: "ambient",
    cooldown: 7,
    when: (c) => c.dow === 5 && between(c, H(9), H(16)) && c.s.stats.shifts >= 2,
    msgs: () => ["Not asking you to come in. Just… if you happened to glance at your emails."],
    choices: [
      { label: "Absolutely not 😇", effect: () => ({ rel: -2, needs: { fun: 5 }, reply: ["Fair. Enjoy your weekend."] }) },
      { label: "On it", effect: () => ({ clock: 30, perf: 4, needs: { fun: -8 }, rel: 5, reply: ["Thank you. I owe you one."] }) },
    ],
    expiresIn: 6 * 60,
  },
  {
    id: "boss-praise",
    who: "boss",
    kind: "ambient",
    cooldown: 7,
    when: (c) => c.rel("boss") >= 60 && isWorkday(c.day) && between(c, H(17), H(21)),
    msgs: () => ["Quick one: someone upstairs mentioned your name today. In a good way, before you panic."],
    onFire: () => ({ perf: 3 }),
    choices: [
      { label: "Ah, that's lovely 😊", effect: () => ({ rel: 3 }) },
      { label: "Who? What did they say?", effect: () => ({ rel: 2, reply: ["Can't say. Keep doing what you're doing."] }) },
    ],
  },
  {
    id: "boss-drinks",
    who: "boss",
    kind: "ambient",
    cooldown: 6,
    when: (c) => c.dow === 4 && between(c, H(7), H(8, 50)) && c.s.work === "pending",
    prepare: (c) =>
      c.work === c.s.home ? null : { station: c.work, stationName: stationName(c.work), place: "work", from: H(17), until: H(18, 30), fromT: "17:00", untilT: "18:30", label: "Team drinks after work" },
    msgs: (c) => [`Team drinks after work tonight, ${v(c, "fromT")}–${v(c, "untilT")}. My round. Don't tell anyone I'm nice.`],
    choices: [
      { label: "I'll stay for one", effect: () => ({ plan: true, rel: 2, reply: ["One. Sure. That's what they all say."] }) },
      { label: "Got plans, sorry", effect: () => ({ reply: ["No problem. Have a good weekend."] }) },
    ],
    invite: {
      hit: () => ({ needs: { social: 25, fun: 10 }, rel: 8, xp: 15, reply: ["You stayed! Right. My round. This never happened."] }),
      miss: () => ({ rel: -2, reply: ["Missed you at drinks. Next time."] }),
    },
  },
  {
    id: "boss-training",
    who: "boss",
    kind: "ambient",
    cooldown: 12,
    when: (c) => isWorkday(c.day) && c.s.level <= 3 && c.s.stats.shifts >= 3 && between(c, H(17), H(20)),
    msgs: () => ["There's a training course next week. Optional. Very optional. But it looks good come review time."],
    choices: [
      { label: "Sign me up", effect: () => ({ perf: 6, needs: { fun: -4 }, rel: 5, reply: ["Done. There'll be biscuits. Probably."] }) },
      { label: "Maybe next time", effect: () => ({ rel: -1, reply: ["Noted."] }) },
    ],
  },

  // ===== Ambient: Mum =====
  {
    id: "mum-food",
    who: "mum",
    kind: "ambient",
    cooldown: 4,
    when: (c) => between(c, H(12), H(21)),
    msgs: () => ["Are you eating properly? And I don't mean crisps."],
    choices: [
      { label: "I cooked a proper dinner 🥦", effect: () => ({ rel: 4, reply: ["A vegetable! In this economy! Proud of you."] }) },
      { label: "Crisps are potatoes, Mum", effect: () => ({ rel: -1, needs: { fun: 3 }, reply: ["Don't get clever with me."] }) },
    ],
  },
  {
    id: "mum-call",
    who: "mum",
    kind: "ambient",
    cooldown: 5,
    when: (c) => between(c, H(17), H(22)),
    msgs: () => ["Call me when you get a minute. Nothing's wrong. Everything's fine.", "Call me."],
    choices: [
      { label: "Calling now 📞", effect: () => ({ clock: 25, needs: { social: 15 }, rel: 6, reply: ["Lovely to hear your voice. Sorry about the twenty minutes on next door's extension."] }) },
      { label: "Later, promise!", effect: () => ({ rel: -1, reply: ["I'll hold you to it."] }) },
    ],
  },
  {
    id: "mum-tenner",
    who: "mum",
    kind: "ambient",
    cooldown: 7,
    weight: 0.8,
    when: (c) => c.rel("mum") >= 60 && c.day >= 3,
    msgs: () => ["Sent you £20. Buy some vegetables. Real ones, not the ones in a pie."],
    onFire: () => ({ money: 20, moneyLabel: "Mum (for vegetables)" }),
    choices: [
      { label: "Love you Mum ❤️", effect: () => ({ rel: 3, reply: ["Love you too. VEGETABLES."] }) },
      { label: "Is a chip a vegetable?", effect: () => ({ rel: 1, needs: { fun: 3 }, reply: ["Not the way you eat them."] }) },
    ],
  },
  {
    id: "mum-sunday",
    who: "mum",
    kind: "ambient",
    cooldown: 6,
    when: (c) => c.dow === 6 && between(c, H(10), H(15)),
    msgs: () => ["Doing a roast. Lamb. You could visit, you know. It's not THAT far."],
    choices: [
      { label: "Next weekend, promise", effect: () => ({ rel: 1, reply: ["Promises, promises. Bring a coat."] }) },
      { label: "Send pics of the roast 📸", effect: () => ({ rel: 3, needs: { fun: 3 }, reply: ["📸 [one very blurry potato]"] }) },
    ],
  },
  {
    id: "mum-rain",
    who: "mum",
    kind: "ambient",
    cooldown: 5,
    weight: 2,
    when: (c) => dayWeather(c.s) === "rain" && between(c, H(7), H(10)),
    msgs: () => ["It says rain in London today. Have you got a coat? A PROPER coat?"],
    choices: [
      { label: "Yes Mum ☔", effect: () => ({ rel: 2, reply: ["A hood is not a coat."] }) },
      { label: "It's London, it's always raining", effect: () => ({ rel: 1, needs: { fun: 3 }, reply: ["Then you should own SEVERAL coats."] }) },
    ],
  },
  {
    id: "mum-neighbour",
    who: "mum",
    kind: "ambient",
    cooldown: 11,
    msgs: () => ["Big news from home: next door have painted their front door yellow.", "Yellow. I don't know what to tell you."],
    choices: [
      { label: "Bold choice", effect: () => ({ rel: 3, needs: { fun: 4 }, reply: ["Bold is one word for it."] }) },
      { label: "Good for them, honestly", effect: () => ({ rel: 2, reply: ["You've changed since you moved to London."] }) },
    ],
  },

  // ===== Ambient: Sam, a slow-burn romance =====
  {
    id: "sam-meet",
    who: "sam",
    kind: "ambient",
    once: true,
    weight: 4,
    when: (c) => c.day >= 3 && between(c, H(10), H(21)),
    msgs: () => ["Hi! It's Sam. From the coffee queue? You held the door, then we both walked into the same revolving bit 🙈", "Anyway. You gave me your number. Hi 👋"],
    choices: [
      { label: "Hi Sam! Smoothest exit of my life", effect: () => ({ rel: 10, flags: ["sam-met"], reply: ["Truly cinematic. I've been laughing about it all day."] }) },
      { label: "Ha, hi! Sorry about your coffee", effect: () => ({ rel: 8, flags: ["sam-met"], reply: ["The coffee survived. Mostly. My dignity didn't."] }) },
    ],
    ignored: () => ({ flags: ["sam-met"] }),
  },
  {
    id: "sam-overground",
    who: "sam",
    kind: "ambient",
    once: true,
    weight: 2,
    when: (c) => c.has("sam-met"),
    msgs: () => ["Settle an argument for me: is the Overground a tube?"],
    choices: [
      { label: "It's orange, so no", effect: () => ({ rel: 5, reply: ["The logic is flawless. I'm telling my sister she's wrong."] }) },
      { label: "Everything's a tube if you believe", effect: () => ({ rel: 6, needs: { fun: 3 }, reply: ["Beautiful. I'm putting that on a mug."] }) },
    ],
  },
  {
    id: "sam-bus",
    who: "sam",
    kind: "ambient",
    once: true,
    weight: 2,
    when: (c) => c.has("sam-met"),
    msgs: () => ["Important question. Possibly a dealbreaker. Best seat on a bus?"],
    choices: [
      { label: "Top deck, front, obviously", effect: () => ({ rel: 6, reply: ["Correct. We can keep talking."] }) },
      { label: "Wherever's free, I'm not fussy", effect: () => ({ rel: 3, reply: ["Chaotic. I respect it."] }) },
    ],
  },
  {
    id: "sam-pigeons",
    who: "sam",
    kind: "ambient",
    cooldown: 12,
    weight: 1.5,
    when: (c) => c.has("sam-met") && between(c, H(9), H(19)),
    prepare: (c) => ({ at: stationName(pick(c, ["bank", "waterloo", "liverpool", "kingscross", "victoria", "londonbridge"])) }),
    msgs: (c) => [`What are you up to? I'm at ${v(c, "at")} watching two pigeons fight over a croissant. It's gripping.`],
    choices: [
      { label: "Who's winning?", effect: () => ({ rel: 5, reply: ["The small one. It's always the small one."] }) },
      { label: "Save me a seat 🍿", effect: () => ({ rel: 6, reply: ["Front row. Croissant not included."] }) },
    ],
  },
  {
    id: "sam-date1",
    who: "sam",
    kind: "ambient",
    cooldown: 3,
    weight: 4,
    when: (c) => c.has("sam-met") && !c.has("sam-d1") && c.rel("sam") >= 30 && between(c, H(10), H(17)),
    prepare: (c) => meet(c, ["peckham", "waterloo", "kingscross", "londonbridge"], H(19), H(20, 15), (st) => SAM_SPOTS[st], (p) => `Drinks with Sam · ${p}`),
    msgs: (c) => ["So I was thinking… drink sometime? Like, tonight?", `${v(c, "place")}, meet at ${v(c, "stationName")} ${v(c, "fromT")}–${v(c, "untilT")}. No pressure. (A bit of pressure.)`],
    choices: [
      { label: "It's a date 😊", effect: () => ({ plan: true, rel: 3, reply: ["Okay. Great. Cool. I'm going to go and panic about what to wear."] }) },
      { label: "Tonight's mad, another time?", effect: () => ({ rel: -2, reply: ["No worries! I'll ask again. I'm persistent. Charmingly."] }) },
    ],
    invite: {
      hit: (c) => ({
        flags: ["sam-d1"],
        rel: 15,
        needs: { social: 30, fun: 25 },
        xp: 30,
        reply: ["You came! Okay I'm nervous. You look great. That's all. Drink?"],
        toast: "💜 First date with Sam.",
        follow: { event: "sam-after-d1", after: nextMorning(c) },
      }),
      miss: (c) => ({ rel: -10, reply: [`Waited at ${v(c, "stationName")} till ${v(c, "untilT")}. Bit gutted, not gonna lie.`] }),
    },
  },
  {
    id: "sam-date2",
    who: "sam",
    kind: "ambient",
    cooldown: 3,
    weight: 4,
    when: (c) => c.has("sam-d1") && !c.has("sam-d2") && c.since("sam-d1") >= 4 && c.rel("sam") >= 45 && between(c, H(10), H(17)),
    prepare: (c) => meet(c, ["leicester"], H(18, 45), H(19, 30), () => "the West End", () => "A show with Sam · Leicester Sq"),
    msgs: (c) => ["Second date? I'm thinking something ambitious.", `A West End show. Meet at Leicester Square, ${v(c, "fromT")}–${v(c, "untilT")}. I'll get the tickets, you get the snacks. Deal?`],
    choices: [
      { label: "Deal. Big bag of Maltesers", effect: () => ({ plan: true, rel: 3, reply: ["The correct snack. This is going well."] }) },
      { label: "Can't tonight 😩", effect: () => ({ rel: -2, reply: ["Okay! Raincheck. The show will still be there. Probably for 30 years."] }) },
    ],
    invite: {
      hit: () => ({ flags: ["sam-d2"], money: -8, moneyLabel: "Snacks for the show", rel: 15, needs: { fun: 50, social: 20 }, xp: 35, reply: ["Maltesers AND good seats. Look at us."], toast: "🎭 Second date with Sam." }),
      miss: () => ({ rel: -10, reply: ["The show was good. The empty seat next to me, less so."] }),
    },
  },
  {
    id: "sam-official",
    who: "sam",
    kind: "ambient",
    once: true,
    weight: 5,
    when: (c) => c.has("sam-d2") && c.since("sam-d2") >= 4 && c.rel("sam") >= 60 && between(c, H(18), H(23)),
    msgs: (c) => [`Okay this is a weird text to send on a ${dayName(c.day)} but…`, "Are we a thing? Like, officially? 🙈"],
    choices: [
      { label: "Officially a thing ❤️", effect: () => ({ flags: ["sam-official"], rel: 15, xp: 50, needs: { social: 20, fun: 20 }, reply: ["Okay. Cool. Very cool. I'm being extremely calm about this 😭"], toast: "❤️ You and Sam are official." }) },
      { label: "Can we keep it casual?", effect: () => ({ flags: ["sam-casual"], rel: -5, reply: ["Casual's fine. Casual's good. I'm fine."] }) },
    ],
    expiresIn: 2 * 1440,
  },
  {
    id: "sam-goodnight",
    who: "sam",
    kind: "ambient",
    cooldown: 3,
    when: (c) => c.has("sam-official") && c.tod >= H(21, 30) && c.tod <= H(24, 30),
    msgs: () => ["Night x Don't fall asleep on the Northern line and end up in Edgware again."],
    choices: [
      { label: "That was ONE time", effect: () => ({ rel: 3, needs: { fun: 3 }, reply: ["Twice. I have witnesses."] }) },
      { label: "Night ❤️", effect: () => ({ rel: 4, needs: { social: 5 } }) },
    ],
  },
  {
    id: "sam-weekly",
    who: "sam",
    kind: "ambient",
    cooldown: 6,
    weight: 2,
    when: (c) => (c.has("sam-official") || c.has("sam-casual")) && c.dow >= 4 && between(c, H(10), H(17)),
    prepare: (c) => meet(c, ["brixton", "waterloo", "londonbridge", "camden"], H(19), H(20, 30), (st) => SAM_SPOTS[st], (p) => `Date with Sam · ${p}`),
    msgs: (c) => ["Date night? I've been thinking about you all day. Also about dumplings.", `${v(c, "place")}, ${v(c, "fromT")}–${v(c, "untilT")}. Meet at ${v(c, "stationName")}?`],
    choices: [
      { label: "See you there 😘", effect: () => ({ plan: true, rel: 2, reply: ["Yay. Wear the jacket."] }) },
      { label: "Not tonight, love", effect: () => ({ rel: -2, reply: ["Okay! Sofa and dumplings alone. Living the dream."] }) },
    ],
    invite: {
      hit: () => ({ money: -10, moneyLabel: "Date night", rel: 8, needs: { social: 30, fun: 25, hunger: 30 }, xp: 20, reply: ["There you are 😊 I ordered us too many dumplings. On purpose."] }),
      miss: (c) => ({ rel: -8, reply: [`Waited at ${v(c, "stationName")} till ${v(c, "untilT")}. Everything okay?`] }),
    },
  },

  // ===== Ambient: Priya from work =====
  {
    id: "priya-gossip",
    who: "priya",
    kind: "ambient",
    cooldown: 8,
    when: (c) => c.has("priya-met") && isWorkday(c.day),
    msgs: () => ["Someone microwaved fish in the staff kitchen AGAIN 🐟", "We have a suspect. I'm 80% sure. It's always the quiet ones."],
    choices: [
      { label: "I'm on the case 🕵️", effect: () => ({ rel: 4, needs: { fun: 5 }, reply: ["Meet me by the kettle at 11. Act natural."] }) },
      { label: "It was me. I'm sorry.", effect: () => ({ rel: 2, needs: { fun: 6 }, reply: ["…I need a minute."] }) },
    ],
  },
  {
    id: "priya-lunch",
    who: "priya",
    kind: "ambient",
    cooldown: 6,
    when: (c) => c.has("priya-met") && isWorkday(c.day) && c.s.work === "pending" && between(c, H(7), H(9)),
    msgs: () => ["Lunch today? I'll show you the actually good meal deal. Not the one everyone goes to. The SECRET one."],
    choices: [
      { label: "Yes please", effect: () => ({ rel: 6, needs: { social: 8, hunger: 10 }, reply: ["Excellent. Wear comfy shoes, it's a walk."] }) },
      { label: "Packed lunch today", effect: () => ({ reply: ["A planner! Respect."] }) },
    ],
  },
  {
    id: "priya-cover",
    who: "priya",
    kind: "ambient",
    cooldown: 12,
    when: (c) => c.has("priya-met") && c.dow === 4 && c.rel("priya") >= 40 && between(c, H(17), H(21)),
    msgs: () => ["Huge favour. Can you cover my Saturday morning? My cousin's getting married and somehow I'm doing the speech."],
    choices: [
      { label: "Sure, go smash that speech", effect: (c) => ({ money: Math.round(wage(c.s) * 0.5), moneyLabel: "Covered Priya's Saturday", needs: { energy: -12 }, perf: 3, rel: 10, reply: ["You're a LIFESAVER. I owe you a whole cake 🎂"] }) },
      { label: "Can't this week, sorry", effect: () => ({ rel: -2, reply: ["Totally fine! I'll beg someone else."] }) },
    ],
  },
  {
    id: "priya-quiz",
    who: "priya",
    kind: "ambient",
    cooldown: 7,
    when: (c) => c.has("priya-met") && c.dow === 3 && c.rel("priya") >= 45 && between(c, H(9), H(17)),
    prepare: (c) => meet(c, ["hackney", "londonbridge", "shoreditch"], H(19), H(20, 30), undefined, (p) => `Pub quiz with Priya · ${p}`),
    msgs: (c) => [`Pub quiz tonight! ${v(c, "place")}, ${v(c, "fromT")}–${v(c, "untilT")}. Team name: "Quiz Akabusi".`, "We need someone who knows rivers. Do you know rivers?"],
    choices: [
      { label: "I know ALL the rivers", effect: () => ({ plan: true, rel: 2, reply: ["Name one. No, don't. Save it for the quiz."] }) },
      { label: "I know zero rivers, sorry", effect: () => ({ rel: -1, reply: ["Honestly, neither do we. Next time!"] }) },
    ],
    invite: {
      hit: () => ({ money: -4, moneyLabel: "Pub quiz entry", needs: { social: 30, fun: 25 }, rel: 8, xp: 15, reply: ["We came fourth! Out of five! Celebrating anyway 🏆"] }),
      miss: () => ({ rel: -5, reply: ["Lost by one point. The question was about rivers. Just saying."] }),
    },
  },
];

export const EVENT: Record<string, StoryEvent> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
