import { mulberry32 } from "../../game/engine";
import { STATION } from "../../game/network";
import { HOME_ACTIVITIES, JOB, STREET_ACTIVITIES, VENUES, type NeedKey, type Needs } from "../data";
import { dayOfWeek, fmtClock, lifeLevel, type LifeState, type Result } from "../engine";
import type { LifeEvent } from "../events";
import { CAST, CAST_IDS, closeness, who as whoIs, type Character } from "./cast";
import { EVENT, EVENTS, type Choice, type Ctx, type Effect, type StoryEvent } from "./content";
import type { CharId, Plan, StoryMsg, StoryState, Thread, Vars } from "./types";

// The story engine: decides who texts when, applies replies, and tracks invites.
// Pure functions over LifeState; cadence is seeded so a save replays the same way.

const DAY = 24 * 60;
const MAX_MSGS = 60;
const MAX_LEDGER = 120;
/** Ambient texts never stack up beyond this many unanswered threads. */
export const MAX_PENDING = 3;
/** Hard cap on texts per game day, reactive ones included (follow-ups and day one excepted). */
export const MAX_PER_DAY = 6;
/** Minimum game minutes between ambient texts. */
const AMBIENT_GAP = 100;
/** Arriving a little early still counts. */
const EARLY_GRACE = 20;
/** "Never" as a JSON-safe number (Infinity would save as null). */
const NEVER = -1e9;

const absOf = (day: number, clock: number) => (day - 1) * DAY + clock;
const nowAbs = (s: LifeState) => absOf(s.day, s.clock);
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// --- state helpers ---------------------------------------------------------------------------

/** A fresh story. Old saves (past day one) skip the onboarding. */
export function initStory(s: LifeState): StoryState {
  const late = s.day > 1;
  return {
    v: 1,
    threads: {},
    seen: late ? { "jess-welcome": s.day, "jess-evening1": s.day, "jess-bed1": s.day } : {},
    flags: [],
    plans: [],
    queue: [],
    today: { day: s.day, n: 0, last: NEVER },
    lastOpen: 0,
    nextId: 1,
  };
}

const story = (s: LifeState): StoryState => s.story ?? initStory(s);
const withStory = (s: LifeState, st: StoryState): LifeState => ({ ...s, story: st });

function thread(st: StoryState, id: CharId): Thread {
  return st.threads[id] ?? { msgs: [], rel: CAST[id].rel, unread: 0, lastAt: NEVER };
}

function setThread(st: StoryState, id: CharId, t: Thread): StoryState {
  return { ...st, threads: { ...st.threads, [id]: t } };
}

function addMsgs(t: Thread, s: LifeState, texts: string[], from: StoryMsg["from"], unread: boolean): Thread {
  if (!texts.length) return t;
  const msgs = [...t.msgs, ...texts.map((text) => ({ from, text, day: s.day, clock: s.clock }))].slice(-MAX_MSGS);
  return { ...t, msgs, unread: unread ? t.unread + texts.length : t.unread, lastAt: from === "them" ? nowAbs(s) : t.lastAt };
}

function rng(s: LifeState, salt: number) {
  const st = s.story;
  return mulberry32(s.seed ^ Math.imul(s.day, 2654435761) ^ Math.imul(Math.floor(s.clock) + 1, 40503) ^ Math.imul((st?.nextId ?? 0) + salt, 97531));
}

function ctx(s: LifeState, ev: LifeEvent | null, vars: Vars, r: () => number): Ctx {
  const st = story(s);
  return {
    s,
    st,
    ev,
    rng: r,
    vars,
    day: s.day,
    tod: s.clock,
    abs: nowAbs(s),
    dow: dayOfWeek(s.day),
    rel: (id) => thread(st, id).rel,
    has: (f) => st.flags.includes(f),
    since: (f) => (st.seen[`flag:${f}`] === undefined ? Infinity : s.day - st.seen[`flag:${f}`]),
    atHome: s.location === s.home,
    work: JOB[s.job]?.station ?? "",
  };
}

const listChoices = (def: StoryEvent, c: Ctx): { c: Choice; i: number }[] =>
  (def.choices ?? []).map((ch, i) => ({ c: ch, i })).filter((x) => !x.c.show || x.c.show(c));

function pay(s: LifeState, label: string, amount: number): LifeState {
  if (!amount) return s;
  const entry = { day: s.day, clock: s.clock, label, amount: Math.round(amount * 100) / 100 };
  return { ...s, money: Math.round((s.money + amount) * 100) / 100, ledger: [entry, ...s.ledger].slice(0, MAX_LEDGER) };
}

function boost(n: Needs, e: Partial<Needs>): Needs {
  const out = { ...n };
  for (const k of Object.keys(e) as NeedKey[]) out[k] = clamp(out[k] + (e[k] ?? 0));
  return out;
}

const name = (s: LifeState, id: CharId) => whoIs(id, s.job).name;
const trim = (t: string, n = 80) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/**
 * Apply a reply's or an invite's consequences. `unread`: whether the character's answer
 * counts as new (true for invite outcomes that arrive later; false when answering live).
 */
function applyEffect(s0: LifeState, id: CharId, eff: Effect, def: StoryEvent | undefined, vars: Vars, events: string[], unread: boolean): LifeState {
  let s = s0;
  if (eff.money) s = pay(s, eff.moneyLabel ?? CAST[id].name, eff.money);
  if (eff.needs) s = { ...s, needs: boost(s.needs, eff.needs) };
  if (eff.perf) s = { ...s, performance: Math.max(-40, s.performance + eff.perf) };
  if (eff.clock) s = { ...s, clock: s.clock + eff.clock };
  if (eff.xp) {
    const before = lifeLevel(s.xp);
    s = { ...s, xp: s.xp + eff.xp };
    const after = lifeLevel(s.xp);
    if (after > before) events.push(`⭐ Life level ${after}!`);
  }
  let st = story(s);
  if (eff.rel) {
    const t = thread(st, id);
    st = setThread(st, id, { ...t, rel: clamp(t.rel + eff.rel) });
  }
  if (eff.flags?.length || eff.unflags?.length) {
    const add = (eff.flags ?? []).filter((f) => !st.flags.includes(f));
    const seen = { ...st.seen };
    for (const f of add) seen[`flag:${f}`] = s.day;
    st = { ...st, seen, flags: [...st.flags.filter((f) => !eff.unflags?.includes(f)), ...add] };
  }
  if (eff.reply?.length) st = setThread(st, id, addMsgs(thread(st, id), s, eff.reply, "them", unread));
  if (eff.follow) st = { ...st, queue: [...st.queue, { event: eff.follow.event, at: nowAbs(s) + eff.follow.after, vars: eff.follow.vars ?? {} }] };
  if (eff.plan && def?.invite && vars.station) {
    const plan: Plan = {
      id: st.nextId,
      who: id,
      event: def.id,
      station: String(vars.station),
      day: s.day,
      from: Number(vars.from),
      until: Number(vars.until),
      label: String(vars.label ?? def.id),
      vars,
    };
    st = { ...st, nextId: st.nextId + 1, plans: [...st.plans, plan] };
    events.push(`📅 Plan: ${plan.label}, ${fmtClock(plan.from)}–${fmtClock(plan.until)}`);
  }
  if (eff.money) events.push(`${eff.money > 0 ? "💷 +" : "💸 −"}£${Math.abs(eff.money)} · ${eff.moneyLabel ?? CAST[id].name}`);
  if (eff.toast) events.push(eff.toast);
  return withStory(s, st);
}

// --- firing texts -----------------------------------------------------------------------------

function canFire(st: StoryState, def: StoryEvent, day: number): boolean {
  const last = st.seen[def.id];
  if (last === undefined) return true;
  if (def.once) return false;
  return day - last >= (def.cooldown ?? 4);
}

/** Send an event's texts. Returns null if its details can't be fixed right now. */
function fire(s0: LifeState, def: StoryEvent, ev: LifeEvent | null, events: string[], counts: boolean, given: Vars = {}): LifeState | null {
  const r = rng(s0, def.id.length * 131 + def.id.charCodeAt(0));
  const pre = ctx(s0, ev, given, r);
  const extra = def.prepare ? def.prepare(pre) : {};
  if (extra === null) return null;
  const vars = { ...given, ...extra };
  const c = { ...pre, vars };
  const texts = def.msgs(c).filter(Boolean);
  if (!texts.length) return null;

  let s = s0;
  let st = story(s);
  // A newer text from the same person replaces an unanswered question.
  const prev = thread(st, def.who).pending;
  if (prev) s = lapse(s, def.who, events);
  st = story(s);

  const shown = listChoices(def, c);
  const now = nowAbs(s);
  const expires = def.invite && vars.from !== undefined ? absOf(s.day, Number(vars.from)) - 10 : now + (def.expiresIn ?? 18 * 60);
  let t = addMsgs(thread(st, def.who), s, texts, "them", true);
  t = shown.length ? { ...t, pending: { event: def.id, opts: shown.map((x) => x.i), labels: shown.map((x) => x.c.label), vars, expires } } : { ...t, pending: undefined };
  st = setThread(st, def.who, t);
  st = {
    ...st,
    seen: { ...st.seen, [def.id]: s.day },
    nextId: st.nextId + 1,
    today: counts ? { day: st.today.day, n: st.today.n + 1, last: now } : st.today,
  };
  s = withStory(s, st);
  events.push(`💬 ${name(s, def.who)}: ${trim(texts[0])}`);
  if (def.onFire) s = applyEffect(s, def.who, def.onFire({ ...c, s, st }), def, vars, events, false);
  return s;
}

/** An unanswered question runs out. */
function lapse(s: LifeState, id: CharId, events: string[]): LifeState {
  const st = story(s);
  const t = thread(st, id);
  if (!t.pending) return s;
  const p = t.pending;
  const def = EVENT[p.event];
  let next = withStory(s, setThread(st, id, { ...t, pending: undefined }));
  const eff: Effect | undefined = def?.ignored ? def.ignored(ctx(next, null, p.vars, rng(next, 7))) : def?.invite ? { rel: -1 } : undefined;
  if (eff) next = applyEffect(next, id, eff, def, p.vars, events, true);
  return next;
}

// --- plans --------------------------------------------------------------------------------------

const ALL_ACTIVITIES = [...HOME_ACTIVITIES, ...STREET_ACTIVITIES, ...VENUES.flatMap((v) => v.activities)];
const activityMinutes = (id: string) => ALL_ACTIVITIES.find((a) => a.id === id)?.minutes ?? 0;

function settlePlans(s0: LifeState, ev: LifeEvent | null, events: string[]): LifeState {
  let s = s0;
  const plans = story(s).plans;
  if (!plans.length) return s;
  // Where you were and for how long: an activity covers its whole duration, and a sleep event is
  // judged at bedtime (the state is already the next morning).
  let now = nowAbs(s);
  let since = now;
  let where = s.location;
  if (ev?.type === "activity") since = now - activityMinutes(ev.activityId);
  if (ev?.type === "sleep" && ev.bedtime !== undefined) {
    now = absOf(ev.summary.day, ev.bedtime);
    since = now;
    where = s.home;
  }
  for (const p of plans) {
    const from = absOf(p.day, p.from);
    const until = absOf(p.day, p.until);
    const def = EVENT[p.event];
    const hit = where === p.station && now >= from - EARLY_GRACE && since <= until;
    if (!hit && now <= until) continue;
    const st = story(s);
    s = withStory(s, { ...st, plans: st.plans.filter((x) => x.id !== p.id) });
    if (!def?.invite) continue;
    const c = ctx(s, ev, p.vars, rng(s, p.id));
    const eff = hit ? def.invite.hit(c) : def.invite.miss(c);
    if (hit) events.push(`🎉 You made it: ${p.label}`);
    else events.push(`😞 Missed: ${p.label}`);
    s = applyEffect(s, p.who, eff, def, p.vars, events, true);
  }
  return s;
}

// --- cadence ------------------------------------------------------------------------------------

/** How many ambient texts a game day may hold: some quiet days, mostly two to four. */
export function dailyBudget(seed: number, day: number): number {
  if (day === 1) return 0;
  const r = mulberry32(seed ^ Math.imul(day, 0x9e3779b1) ^ 0x51ab);
  return r() < 0.18 ? 1 : 2 + Math.floor(r() * 3);
}

export const pendingCount = (st: StoryState | undefined) => (st ? CAST_IDS.filter((id) => st.threads[id]?.pending).length : 0);

function ambient(s: LifeState, ev: LifeEvent, events: string[]): LifeState {
  const st = story(s);
  const now = nowAbs(s);
  const tod = s.clock;
  if (st.today.n >= Math.min(MAX_PER_DAY, dailyBudget(s.seed, s.day))) return s;
  if (now - st.today.last < AMBIENT_GAP || tod < 7 * 60 || tod > 23 * 60 + 30) return s;
  if (pendingCount(st) >= MAX_PENDING) return s;
  const r = rng(s, 1);
  if (r() > 0.55) return s;
  const c = ctx(s, ev, {}, r);
  const pool = EVENTS.filter((d) => {
    if (d.kind !== "ambient" || !canFire(st, d, s.day)) return false;
    const t = st.threads[d.who];
    if (t?.pending || (t && now - t.lastAt < 180)) return false;
    return !d.when || d.when(c);
  });
  // Try in weighted order until one can fix its details (e.g. a venue that isn't your home).
  const order = pool.map((d) => ({ d, k: Math.pow(r(), 1 / (d.weight ?? 1)) })).sort((a, b) => b.k - a.k);
  for (const { d } of order) {
    const next = fire(s, d, ev, events, true);
    if (next) return next;
  }
  return s;
}

function reactive(s0: LifeState, ev: LifeEvent, events: string[]): LifeState {
  let s = s0;
  let fired = 0;
  let onboarded = false;
  for (const d of EVENTS) {
    if (d.kind !== "onboard" && d.kind !== "reactive") continue;
    if (d.id === "mum-back") continue;
    const st = story(s);
    if (!canFire(st, d, s.day)) continue;
    const onboard = d.kind === "onboard";
    if (onboard && onboarded) continue;
    if (!onboard && (fired >= 2 || st.today.n >= MAX_PER_DAY)) continue;
    const c = ctx(s, ev, {}, rng(s, 3 + fired));
    if (d.when && !d.when(c)) continue;
    const next = fire(s, d, ev, events, !onboard);
    if (!next) continue;
    s = next;
    // One onboarding beat per tick, so day one unfolds rather than arriving at once.
    if (onboard) onboarded = true;
    else fired++;
  }
  return s;
}

function followUps(s0: LifeState, ev: LifeEvent, events: string[]): LifeState {
  let s = s0;
  const now = nowAbs(s);
  const due = story(s).queue.filter((q) => q.at <= now);
  if (!due.length) return s;
  const st = story(s);
  s = withStory(s, { ...st, queue: st.queue.filter((q) => q.at > now) });
  for (const q of due) {
    const def = EVENT[q.event];
    if (!def) continue;
    s = fire(s, def, ev, events, false, q.vars) ?? s;
  }
  return s;
}

function expire(s0: LifeState, events: string[]): LifeState {
  let s = s0;
  const now = nowAbs(s);
  for (const id of CAST_IDS) {
    const p = story(s).threads[id]?.pending;
    if (p && now > p.expires) s = lapse(s, id, events);
  }
  return s;
}

/** A good relationship with the manager quietly helps your performance. */
function bossBonus(s: LifeState, ev: LifeEvent): LifeState {
  if (ev.type !== "shift") return s;
  const rel = thread(story(s), "boss").rel;
  const bonus = rel >= 80 ? 3 : rel >= 60 ? 2 : 0;
  return bonus ? { ...s, performance: s.performance + bonus } : s;
}

// --- public API ---------------------------------------------------------------------------------

/** Runs after every life event (last in the hook chain). */
export function storyHook(s0: LifeState, ev: LifeEvent): Result {
  const events: string[] = [];
  let s = s0.story ? s0 : withStory(s0, initStory(s0));
  let st = story(s);
  if (st.today.day !== s.day) s = withStory(s, (st = { ...st, today: { day: s.day, n: 0, last: st.today.last } }));

  let away = false;
  if (ev.type === "open") {
    away = st.lastOpen > 0 && ev.now - st.lastOpen >= 2 * DAY * 60 * 1000;
    s = withStory(s, { ...st, lastOpen: ev.now });
  }

  s = bossBonus(s, ev);
  s = settlePlans(s, ev, events);
  s = expire(s, events);
  s = followUps(s, ev, events);
  if (away) s = fire(s, EVENT["mum-back"], ev, events, false, { away: 1 }) ?? s;
  s = reactive(s, ev, events);
  s = ambient(s, ev, events);

  return { state: s, events };
}

/** Reply to a character's latest text with one of the offered choices. */
export function answer(s: LifeState, characterId: string, choiceIndex: number): Result {
  const id = characterId as CharId;
  const st = s.story;
  const t = st?.threads[id];
  const p = t?.pending;
  if (!st || !t || !p || choiceIndex < 0 || choiceIndex >= p.opts.length) return { state: s, events: [] };
  const events: string[] = [];
  if (nowAbs(s) > p.expires) return { state: lapse(s, id, events), events: ["That moment has passed."] };
  const def = EVENT[p.event];
  const choice = def?.choices?.[p.opts[choiceIndex]];
  let next = withStory(s, setThread(st, id, { ...addMsgs(t, s, [p.labels[choiceIndex]], "me", false), pending: undefined, unread: 0 }));
  if (!def || !choice) return { state: next, events };
  const eff = choice.effect ? choice.effect(ctx(next, null, p.vars, rng(next, 11 + choiceIndex))) : {};
  next = applyEffect(next, id, eff, def, p.vars, events, false);
  if (eff.reply?.length) events.unshift(`💬 ${name(next, id)}: ${trim(eff.reply[0])}`);
  // Accepting while already there counts straight away.
  next = settlePlans(next, null, events);
  return { state: next, events };
}

/** Opening a thread marks it read. */
export function markRead(s: LifeState, characterId: string): LifeState {
  const id = characterId as CharId;
  const t = s.story?.threads[id];
  if (!s.story || !t || !t.unread) return s;
  return withStory(s, setThread(s.story, id, { ...t, unread: 0 }));
}

/** Unread character texts (for the phone badge). */
export function storyUnread(s: LifeState | null | undefined): number {
  if (!s?.story) return 0;
  return CAST_IDS.reduce((n, id) => n + (s.story!.threads[id]?.unread ?? 0), 0);
}

export interface ThreadView {
  id: CharId;
  character: Character;
  msgs: StoryMsg[];
  rel: number;
  closeness: string;
  unread: number;
  /** Reply options, if the character is waiting for an answer. */
  choices: string[];
  last?: StoryMsg;
  lastAt: number;
}

/** Character chats with any messages, most recent first. */
export function threads(s: LifeState | null | undefined): ThreadView[] {
  if (!s?.story) return [];
  const st = s.story;
  return CAST_IDS.filter((id) => st.threads[id]?.msgs.length)
    .map((id) => {
      const t = st.threads[id]!;
      return {
        id,
        character: whoIs(id, s.job),
        msgs: t.msgs,
        rel: t.rel,
        closeness: closeness(id, t.rel, st.flags),
        unread: t.unread,
        choices: t.pending && nowAbs(s) <= t.pending.expires ? t.pending.labels : [],
        last: t.msgs[t.msgs.length - 1],
        lastAt: absOf(t.msgs[t.msgs.length - 1].day, t.msgs[t.msgs.length - 1].clock),
      };
    })
    .sort((a, b) => b.lastAt - a.lastAt);
}

export interface PlanView {
  characterId: CharId;
  station: string;
  stationName: string;
  /** Game day of the plan; from/until are clock minutes on that day (may pass 24:00). */
  day: number;
  from: number;
  until: number;
  label: string;
}

/** Accepted invites that haven't happened yet. */
export function activePlans(s: LifeState | null | undefined): PlanView[] {
  if (!s?.story) return [];
  const now = nowAbs(s);
  return s.story.plans
    .filter((p) => absOf(p.day, p.until) >= now)
    .map((p) => ({ characterId: p.who, station: p.station, stationName: STATION[p.station]?.name ?? p.station, day: p.day, from: p.from, until: p.until, label: p.label }))
    .sort((a, b) => absOf(a.day, a.from) - absOf(b.day, b.from));
}

/** Send one scripted text now, ignoring triggers and cadence. For tests and debugging. */
export function sendStory(s0: LifeState, eventId: string, vars: Vars = {}): Result {
  const def = EVENT[eventId];
  const s = s0.story ? s0 : withStory(s0, initStory(s0));
  if (!def) return { state: s0, events: [] };
  const events: string[] = [];
  return { state: fire(s, def, null, events, false, vars) ?? s0, events };
}
