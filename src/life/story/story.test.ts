import { describe, expect, test } from "vitest";
import { JOB } from "../data";
import { dayOfWeek, isWorkday, newLife, type DaySummary, type LifeState } from "../engine";
import type { LifeEvent } from "../events";
import { EVENTS } from "./content";
import { MAX_PER_DAY, activePlans, answer, dailyBudget, initStory, markRead, pendingCount, sendStory, storyHook, storyUnread, threads } from "./hook";
import type { CharId } from "./types";

const fresh = (patch: Partial<LifeState> = {}, seed = 42): LifeState => ({ ...newLife({ name: "T", avatar: "🙂", home: "brixton", job: "retail", seed, now: 0 }), ...patch });

const summary = (day: number, notes: string[] = []): DaySummary => ({ day, earned: 0, spent: 0, rent: 0, xp: 0, level: 1, promoted: false, newBadges: [], notes, mood: 50 });

const texts = (s: LifeState, id: CharId) => (s.story?.threads[id]?.msgs ?? []).filter((m) => m.from === "them").map((m) => m.text);
const allText = (s: LifeState) => Object.values(s.story?.threads ?? {}).flatMap((t) => t!.msgs.map((m) => m.text)).join("\n");

const trip = (s: LifeState, to: string, arrival: number): [LifeState, LifeEvent] => [
  { ...s, location: to, clock: arrival },
  { type: "trip", from: s.location, to, start: s.clock, arrival, cost: 2, stress: 10, route: [] },
];

const nextDay = (s: LifeState, notes: string[] = []): [LifeState, LifeEvent] => {
  const day = s.day + 1;
  return [{ ...s, day, clock: 7 * 60, location: s.home, work: isWorkday(day) ? "pending" : "off" }, { type: "sleep", summary: summary(s.day, notes) }];
};

const hook = ([s, ev]: [LifeState, LifeEvent]) => storyHook(s, ev);

describe("story: day one with Jess", () => {
  test("opening the game on day one gets a welcome with the commute", () => {
    const r = storyHook(fresh(), { type: "open", now: 1 });
    const jess = texts(r.state, "jess");
    expect(jess[0]).toMatch(/Welcome to the flat/);
    expect(jess.join(" ")).toMatch(/Oxford Circus/);
    expect(jess.join(" ")).toMatch(/Victoria line/);
    expect(threads(r.state)[0].choices.length).toBe(2);
    expect(storyUnread(r.state)).toBe(3);
    expect(r.events.some((e) => e.startsWith("💬 Jess"))).toBe(true);
  });

  test("the commute tip adapts to the job and home", () => {
    const r = storyHook(fresh({ home: "stratford", location: "stratford", job: "finance" }), { type: "open", now: 1 });
    expect(texts(r.state, "jess").join(" ")).toMatch(/Canary Wharf/);
    const same = storyHook(fresh({ home: "shoreditch", location: "shoreditch", job: "tech" }), { type: "open", now: 1 });
    expect(texts(same.state, "jess").join(" ")).toMatch(/round the corner/);
  });

  test("answering applies the reply and clears the question", () => {
    const s = storyHook(fresh(), { type: "open", now: 1 }).state;
    const before = s.story!.threads.jess!.rel;
    const r = answer(s, "jess", 0);
    const t = r.state.story!.threads.jess!;
    expect(t.rel).toBe(before + 5);
    expect(t.pending).toBeUndefined();
    expect(t.msgs.some((m) => m.from === "me")).toBe(true);
    expect(r.events[0]).toMatch(/Jess: Stop it/);
    // Out-of-range or repeat answers do nothing.
    expect(answer(r.state, "jess", 0).state).toBe(r.state);
  });

  test("after the first shift: Jess suggests the evening, the boss says well done, then bedtime", () => {
    let s = storyHook(fresh(), { type: "open", now: 1 }).state;
    s = answer(s, "jess", 0).state;
    s = { ...s, clock: 17 * 60, location: JOB.retail.station, work: "done", stats: { ...s.stats, shifts: 1 } };
    s = storyHook(s, { type: "shift", style: "team", lateBy: 0, earned: 75, promoted: false }).state;
    expect(texts(s, "jess").join(" ")).toMatch(/Games night/);
    expect(texts(s, "boss").join(" ")).toMatch(/Good first day/);
    expect(threads(s).find((t) => t.id === "boss")!.character.name).toBe("Bev");

    // Accept games night, get home inside the window: big reward.
    s = answer(s, "jess", 0).state;
    expect(activePlans(s)).toHaveLength(1);
    const social = s.needs.social;
    const rel = s.story!.threads.jess!.rel;
    const r = hook(trip(s, "brixton", 19 * 60 + 45));
    expect(activePlans(r.state)).toHaveLength(0);
    expect(r.state.needs.social).toBeGreaterThan(social);
    expect(r.state.story!.threads.jess!.rel).toBe(rel + 8);
    expect(r.events.some((e) => e.includes("You made it"))).toBe(true);

    const night = storyHook({ ...r.state, clock: 22 * 60 }, { type: "activity", activityId: "tv", cost: 0 }).state;
    expect(texts(night, "jess").join(" ")).toMatch(/Bed before midnight or you'll be a zombie on the Victoria line/);
  });

  test("old saves past day one start without onboarding", () => {
    const old = fresh({ day: 10, clock: 7 * 60 });
    delete (old as Partial<LifeState>).story;
    expect(storyUnread(old)).toBe(0);
    expect(threads(old)).toEqual([]);
    expect(activePlans(old)).toEqual([]);
    const r = storyHook(old, { type: "open", now: 1 });
    expect(r.state.story).toBeDefined();
    expect(allText(r.state)).not.toMatch(/Welcome to the flat/);
  });
});

describe("story: reactive texts", () => {
  const day3 = () => {
    const s = fresh({ day: 3, clock: 17 * 60, location: JOB.retail.station, work: "done" });
    return { ...s, story: initStory({ ...s, day: 2 }), stats: { ...s.stats, shifts: 3 } };
  };

  test("late to work: the manager notices", () => {
    const r = storyHook(day3(), { type: "shift", style: "focus", lateBy: 12, earned: 70, promoted: false });
    expect(texts(r.state, "boss").join(" ")).toMatch(/12 minutes late/);
  });

  test("promotion: the boss and Mum", () => {
    const r = storyHook({ ...day3(), level: 2 }, { type: "shift", style: "focus", lateBy: 0, earned: 90, promoted: true });
    expect(texts(r.state, "boss").join(" ")).toMatch(/Senior sales/);
    expect(texts(r.state, "mum").join(" ")).toMatch(/PROMOTED/);
  });

  test("overdrawn: Mum asks, and tops you up if you're close", () => {
    const [s, ev] = nextDay({ ...day3(), money: -20 });
    const r = storyHook(s, ev);
    expect(texts(r.state, "mum").join(" ")).toMatch(/overdrawn/);
    const paid = answer(r.state, "mum", 0).state;
    expect(paid.money).toBe(10);
    expect(paid.ledger[0]).toMatchObject({ label: "Mum (top-up)", amount: 30 });
  });

  test("missed work, hunger, the daily challenge, and coming back after a break", () => {
    const missed = hook(nextDay(day3(), ["📉 Missed work today: no pay, and your manager isn't happy."])).state;
    expect(texts(missed, "boss").join(" ")).toMatch(/Didn't see you today/);

    const hungry = storyHook({ ...day3(), location: "brixton", needs: { energy: 50, hunger: 10, social: 50, fun: 50 } }, { type: "activity", activityId: "tv", cost: 0 }).state;
    expect(texts(hungry, "jess").join(" ")).toMatch(/lasagne/);

    const daily = storyHook(day3(), { type: "daily", stars: 3 }).state;
    expect(texts(daily, "dele").join(" ")).toMatch(/3 stars/);

    let s = storyHook(day3(), { type: "open", now: 1_000 }).state;
    expect(texts(s, "mum").join(" ")).not.toMatch(/ALIVE/);
    s = storyHook(s, { type: "open", now: 1_000 + 3 * 86_400_000 }).state;
    expect(texts(s, "mum").join(" ")).toMatch(/ALIVE/);
  });

  test("Saturday morning rent reminder and strike-day warning", () => {
    const fri = { ...day3(), day: 5 };
    const sat = hook(nextDay(fri)).state;
    expect(dayOfWeek(sat.day)).toBe(5);
    expect(texts(sat, "jess").join(" ")).toMatch(/Rent reminder.*£190/);

    // Find a strike day for this seed and check Jess warns about it.
    let s: LifeState = { ...day3(), day: 1 };
    let warned = false;
    for (let i = 0; i < 40 && !warned; i++) {
      const r = hook(nextDay(s));
      warned = r.events.some((e) => e.includes("on strike"));
      s = r.state;
    }
    expect(warned).toBe(true);
  });

  test("a good relationship with the boss quietly helps performance", () => {
    const s = day3();
    const close = { ...s, story: { ...s.story!, threads: { boss: { msgs: [], rel: 85, unread: 0, lastAt: -1e9 } } } };
    const r = storyHook(close, { type: "shift", style: "focus", lateBy: 5, earned: 70, promoted: false });
    expect(r.state.performance).toBe(s.performance + 3);
  });
});

describe("story: choices and follow-ups", () => {
  test("lending Jess a tenner costs money now and pays back with interest later", () => {
    let s = fresh({ day: 4, clock: 12 * 60, money: 200 });
    s = sendStory(s, "jess-borrow").state;
    s = answer(s, "jess", 0).state;
    expect(s.money).toBe(190);
    expect(s.ledger[0]).toMatchObject({ label: "Lent Jess £10", amount: -10 });
    for (let i = 0; i < 3; i++) s = hook(nextDay(s)).state;
    s = storyHook({ ...s, clock: 12 * 60 + 5 }, { type: "activity", activityId: "tv", cost: 0 }).state;
    expect(texts(s, "jess").join(" ")).toMatch(/Sent you £12/);
    expect(s.ledger.some((l) => l.label === "Jess paid you back" && l.amount === 12)).toBe(true);
  });

  test("Mum's £20 perk arrives with the text", () => {
    const s = sendStory(fresh({ day: 5, clock: 12 * 60 }), "mum-tenner").state;
    expect(s.money).toBe(370);
  });

  test("conditional replies only show when they apply", () => {
    const home = sendStory(fresh({ day: 3, clock: 13 * 60 }), "jess-hungry").state;
    expect(threads(home)[0].choices[0]).toMatch(/Lasagne/);
    const away = sendStory(fresh({ day: 3, clock: 13 * 60, location: "bank" }), "jess-hungry").state;
    expect(threads(away)[0].choices[0]).toBe("On it");
  });

  test("opening a thread marks it read", () => {
    const s = sendStory(fresh({ day: 3, clock: 13 * 60 }), "mum-food").state;
    expect(storyUnread(s)).toBe(1);
    const read = markRead(s, "mum");
    expect(storyUnread(read)).toBe(0);
    expect(markRead(read, "mum")).toBe(read);
  });

  test("unanswered questions lapse quietly", () => {
    let s = sendStory(fresh({ day: 3, clock: 13 * 60 }), "mum-food").state;
    s = hook(nextDay(hook(nextDay(s)).state)).state;
    expect(s.story!.threads.mum!.pending).toBeUndefined();
    expect(answer(s, "mum", 0).state).toBe(s);
  });
});

describe("story: invites", () => {
  const friday = () => fresh({ day: 5, clock: 12 * 60 });

  test("accept and turn up: big reward", () => {
    let s = sendStory(friday(), "dele-gig").state;
    expect(texts(s, "dele").join(" ")).toMatch(/Camden Town, 19:30–20:30/);
    s = answer(s, "dele", 0).state;
    expect(activePlans(s)).toEqual([{ characterId: "dele", station: "camden", stationName: "Camden Town", day: 5, from: 19 * 60 + 30, until: 20 * 60 + 30, label: "Gig with Dele · Camden" }]);
    const rel = s.story!.threads.dele!.rel;
    const xp = s.xp;
    const r = hook(trip(s, "camden", 19 * 60 + 40));
    expect(r.state.story!.threads.dele!.rel).toBe(rel + 10);
    expect(r.state.xp).toBe(xp + 25);
    expect(texts(r.state, "dele").pop()).toMatch(/You made it/);
    expect(activePlans(r.state)).toEqual([]);
  });

  test("going somewhere else is not turning up", () => {
    let s = answer(sendStory(friday(), "dele-gig").state, "dele", 0).state;
    s = hook(trip(s, "hackney", 19 * 60 + 45)).state;
    expect(activePlans(s)).toHaveLength(1);
  });

  test("let the window pass: disappointed text and a relationship drop", () => {
    let s = answer(sendStory(friday(), "dele-gig").state, "dele", 0).state;
    const rel = s.story!.threads.dele!.rel;
    const r = hook(trip(s, "brixton", 21 * 60));
    expect(r.state.story!.threads.dele!.rel).toBe(rel - 8);
    expect(texts(r.state, "dele").pop()).toMatch(/Steve/);
    expect(r.state.story!.threads.dele!.unread).toBeGreaterThan(0);
    expect(activePlans(r.state)).toEqual([]);
  });

  test("never invites you to your own front door", () => {
    // Brixton is one of Dele's pubs, but not when you live there.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = sendStory(fresh({ day: 2, clock: 12 * 60 }, seed), "dele-pub");
      expect(r.state.story!.threads.dele!.pending!.vars.station).not.toBe("brixton");
    }
  });

  test("Sam's arc: first date, the morning after, second date, official", () => {
    let s = fresh({ day: 6, clock: 12 * 60 });
    s = { ...s, story: { ...initStory(s), flags: ["sam-met"], threads: { sam: { msgs: [], rel: 40, unread: 0, lastAt: -1e9 } } } };
    s = answer(sendStory(s, "sam-date1").state, "sam", 0).state;
    const plan = activePlans(s)[0];
    s = hook(trip(s, plan.station, 19 * 60 + 5)).state;
    expect(s.story!.flags).toContain("sam-d1");
    s = hook(nextDay(s)).state;
    s = storyHook({ ...s, clock: 8 * 60 + 40 }, { type: "activity", activityId: "breakfast", cost: 2 }).state;
    expect(texts(s, "sam").join(" ")).toMatch(/really nice time/);
    s = answer(s, "sam", 0).state;

    for (let i = 0; i < 4; i++) s = hook(nextDay(s)).state;
    s = { ...s, clock: 12 * 60 };
    s = answer(sendStory(s, "sam-date2").state, "sam", 0).state;
    s = hook(trip(s, "leicester", 18 * 60 + 50)).state;
    expect(s.story!.flags).toContain("sam-d2");

    for (let i = 0; i < 4; i++) s = hook(nextDay(s)).state;
    s = answer(sendStory({ ...s, clock: 20 * 60 }, "sam-official").state, "sam", 0).state;
    expect(s.story!.flags).toContain("sam-official");
    expect(threads(s).find((t) => t.id === "sam")!.closeness).toMatch(/Together/);
  });
});

describe("story: content", () => {
  test("a big cast with plenty to say", () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
    for (const e of EVENTS) {
      expect(e.choices?.length ?? 0, e.id).toBeGreaterThanOrEqual(2);
      expect(e.choices!.length, e.id).toBeLessThanOrEqual(3);
      if (e.invite) expect(e.prepare, e.id).toBeDefined();
    }
    for (const id of ["jess", "dele", "boss", "mum", "sam", "priya"]) expect(EVENTS.some((e) => e.who === id)).toBe(true);
  });

  test("daily budget: mostly 2–4, some quiet days, day one is onboarding", () => {
    const b = Array.from({ length: 200 }, (_, i) => dailyBudget(7, i + 2));
    expect(dailyBudget(7, 1)).toBe(0);
    expect(Math.min(...b)).toBe(1);
    expect(Math.max(...b)).toBe(4);
  });
});

/** Four weeks of commuting, nights out and lazy weekends, answering most texts. */
function simulate(seed: number, home = "brixton", job = "retail") {
  let s = { ...newLife({ name: "Bot", avatar: "🤖", home, job, seed, now: 0 }), story: undefined } as LifeState;
  const perDay: number[] = [];
  let maxPending = 0;
  let count = 0;
  const run = (st: LifeState, ev: LifeEvent) => {
    const r = storyHook(st, ev);
    count += r.events.filter((e) => e.startsWith("💬")).length;
    maxPending = Math.max(maxPending, pendingCount(r.state.story));
    // Answer about two thirds of texts, always the first option.
    let next = r.state;
    for (const t of threads(next)) if (t.choices.length && (next.clock + t.id.length) % 3 !== 0) next = answer(next, t.id, 0).state;
    return next;
  };
  s = run(s, { type: "open", now: 1 });
  for (let d = 0; d < 28; d++) {
    count = 0;
    const work = JOB[s.job].station;
    if (isWorkday(s.day)) {
      s = run(...trip(s, work, 8 * 60 + 50));
      s = run({ ...s, clock: 17 * 60, work: "done", stats: { ...s.stats, shifts: s.stats.shifts + 1 } }, { type: "shift", style: "team", lateBy: d % 5 === 2 ? 7 : 0, earned: 75, promoted: false });
      s = run(...trip(s, d % 2 ? "camden" : "hackney", 18 * 60 + 40));
      s = run({ ...s, clock: 20 * 60 }, { type: "activity", activityId: "pub", cost: 13 });
      s = run(...trip(s, s.home, 21 * 60 + 15));
    } else {
      s = run({ ...s, clock: 10 * 60 }, { type: "activity", activityId: "breakfast", cost: 2 });
      s = run(...trip(s, "stratford", 12 * 60 + 20));
      s = run({ ...s, clock: 15 * 60 }, { type: "activity", activityId: "match", cost: 40 });
      s = run(...trip(s, s.home, 19 * 60 + 30));
    }
    s = run({ ...s, clock: 22 * 60 }, { type: "activity", activityId: "tv", cost: 0 });
    s = run(...nextDay(s));
    perDay.push(count);
  }
  return { s, perDay, maxPending };
}

describe("story: four weeks", () => {
  test("cadence is bounded and never spammy", () => {
    for (const seed of [1, 2, 3, 99]) {
      const { perDay, s } = simulate(seed);
      // Character texts only (answers produce their own 💬 toasts, so count fired events from seen instead).
      expect(Math.max(...perDay)).toBeLessThanOrEqual(2 * (MAX_PER_DAY + 3));
      const fired = Object.keys(s.story!.seen).filter((k) => !k.startsWith("flag:")).length;
      expect(fired).toBeGreaterThan(15);
      const them = Object.values(s.story!.threads).reduce((n, t) => n + t!.msgs.filter((m) => m.from === "them").length, 0);
      expect(them).toBeGreaterThan(40);
    }
  });

  test("texts per game day stay around two to four", () => {
    const { s } = simulate(5);
    const msgsByDay = new Map<number, Set<string>>();
    for (const [id, t] of Object.entries(s.story!.threads)) {
      for (const m of t!.msgs) if (m.from === "them") {
        const set = msgsByDay.get(m.day) ?? new Set();
        set.add(`${id}@${m.clock}`);
        msgsByDay.set(m.day, set);
      }
    }
    // Distinct "conversations started" per day (a burst of 2–3 texts at one moment counts once).
    const perDay = Array.from({ length: 28 }, (_, i) => msgsByDay.get(i + 2)?.size ?? 0);
    const avg = perDay.reduce((a, b) => a + b, 0) / perDay.length;
    expect(avg).toBeGreaterThanOrEqual(1.5);
    expect(avg).toBeLessThanOrEqual(6);
    expect(Math.max(...perDay)).toBeLessThanOrEqual(MAX_PER_DAY + 4);
  });

  test("once-only texts happen once", () => {
    const { s } = simulate(11);
    const all = allText(s);
    expect((all.match(/Welcome to the flat/g) ?? []).length).toBeLessThanOrEqual(1);
    expect(s.story!.seen["jess-welcome"]).toBe(1);
    expect((all.match(/named the plant Gary/g) ?? []).length).toBeLessThanOrEqual(1);
    expect((all.match(/Hiii, it's Priya/g) ?? []).length).toBe(1);
  });

  test("ambient texts hold off when replies pile up", () => {
    const { maxPending } = simulate(3);
    expect(maxPending).toBeLessThanOrEqual(5);
  });

  test("deterministic, and survives a JSON round trip", () => {
    const a = simulate(8).s;
    const b = simulate(8).s;
    expect(a.story).toEqual(b.story);
    const saved = JSON.parse(JSON.stringify(a)) as LifeState;
    expect(saved.story).toEqual(a.story);
    const r1 = storyHook(a, { type: "open", now: 5 });
    const r2 = storyHook(saved, { type: "open", now: 5 });
    expect(r2.state.story).toEqual(r1.state.story);
  });
});
