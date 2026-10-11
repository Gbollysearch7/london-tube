import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { cleanMessage, cleanName, mergeMessages, unreadCount } from "./logic";
import type { Activity, Conversation, Message, OnlineStatus, Profile } from "./types";

// Online layer for the in-game phone: players, chats and live texts.
// TEST MODE (no sign-in): each browser keeps a player id in localStorage and the database
// trusts it. Must be replaced with real auth before a public release; see SECURITY-TODO.md.

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** `?player=2` gives a separate identity in the same browser, handy for testing texts between two players. */
const slot = typeof location !== "undefined" ? new URLSearchParams(location.search).get("player")?.replace(/\W/g, "").slice(0, 12) : "";

const supabase: SupabaseClient | null =
  URL && KEY ? createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

const ID_KEY = `mind-the-gap:player-id${slot ? `-${slot}` : ""}`;
let sessionId = "";

/** This browser's player id: kept in localStorage, or just for this tab if storage is blocked. */
function localPlayerId(): string {
  try {
    const saved = localStorage.getItem(ID_KEY);
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem(ID_KEY, fresh);
    return fresh;
  } catch {
    sessionId ||= crypto.randomUUID();
    return sessionId;
  }
}

export interface OnlineState {
  status: OnlineStatus;
  me: Profile | null;
  players: Record<string, Profile>;
  presence: Set<string>;
  conversations: Record<string, Conversation>;
  /** Messages known per chat: recent history once opened, plus anything unread. */
  messages: Record<string, Message[]>;
  historyLoaded: Record<string, boolean>;
  blocked: Set<string>;
  activity: Activity[];
  lobbyId: string | null;
}

let state: OnlineState = {
  status: supabase ? { kind: "connecting" } : { kind: "off", reason: "Online play isn't set up for this copy of the game." },
  me: null,
  players: {},
  presence: new Set(),
  conversations: {},
  messages: {},
  historyLoaded: {},
  blocked: new Set(),
  activity: [],
  lobbyId: null,
};

const listeners = new Set<() => void>();
const incoming = new Set<(m: Message) => void>();

function set(patch: Partial<OnlineState> | ((s: OnlineState) => Partial<OnlineState>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  listeners.forEach((l) => l());
}

export function useOnline(): OnlineState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export const getOnline = () => state;

/** Called for every new message from another (unblocked) player. */
export function onIncomingMessage(cb: (m: Message) => void): () => void {
  incoming.add(cb);
  return () => incoming.delete(cb);
}

export function unreadFor(convId: string, s: OnlineState = state): number {
  const conv = s.conversations[convId];
  if (!conv || !s.me) return 0;
  return unreadCount(conv, s.messages[convId] ?? [], s.me.id, s.blocked);
}

export function totalUnread(s: OnlineState = state): number {
  return Object.keys(s.conversations).reduce((n, id) => n + unreadFor(id, s), 0);
}

function friendly(err: unknown): string {
  const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
  if (/fetch|network/i.test(msg)) return "Can't reach the server. Check your connection.";
  return msg || "Something went wrong.";
}

function need<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

// --- connection --------------------------------------------------------------

let connecting: Promise<void> | null = null;
let live: RealtimeChannel | null = null;
let presenceChannel: RealtimeChannel | null = null;
let heartbeat = 0;

export function connect(): Promise<void> {
  if (!supabase) return Promise.resolve();
  if (state.status.kind === "ready" || state.status.kind === "needs-profile") return Promise.resolve();
  connecting ??= (async () => {
    set({ status: { kind: "connecting" } });
    try {
      const me = need(await supabase.from("profiles").select("*").eq("id", localPlayerId()).maybeSingle()) as Profile | null;
      if (!me) {
        set({ status: { kind: "needs-profile" } });
        return;
      }
      await start(me);
    } catch (e) {
      set({ status: { kind: "error", reason: friendly(e) } });
    } finally {
      connecting = null;
    }
  })();
  return connecting;
}

export function retry() {
  if (state.status.kind === "error") set({ status: { kind: "connecting" } });
  return connect();
}

async function start(me: Profile) {
  if (!supabase) return;
  set({ me, players: { ...state.players, [me.id]: me } });
  const [players, blocks, activity] = await Promise.all([
    supabase.from("profiles").select("*").order("last_seen", { ascending: false }).limit(500),
    supabase.from("blocks").select("blocked"),
    supabase.from("activity").select("*").order("created_at", { ascending: false }).limit(60),
  ]);
  const list = need(players) as Profile[];
  set({
    players: Object.fromEntries(list.map((p) => [p.id, p])),
    blocked: new Set((need(blocks) as { blocked: string }[]).map((b) => b.blocked)),
    activity: need(activity) as Activity[],
  });
  await loadConversations();
  subscribe(me.id);
  window.clearInterval(heartbeat);
  heartbeat = window.setInterval(() => void touch(), 60_000);
  void touch();
  set({ status: { kind: "ready" } });
}

async function loadConversations() {
  if (!supabase || !state.me) return;
  const lobbyId = need(await supabase.rpc("join_lobby", { me: state.me.id })) as string;
  const mine = need(await supabase.from("conversation_members").select("conversation_id,last_read_at").eq("user_id", state.me.id)) as {
    conversation_id: string;
    last_read_at: string;
  }[];
  const ids = mine.map((m) => m.conversation_id);
  if (!ids.length) return;
  const [convs, members] = await Promise.all([
    supabase.from("conversations").select("*").in("id", ids),
    supabase.from("conversation_members").select("conversation_id,user_id").in("conversation_id", ids.filter((id) => id !== lobbyId)),
  ]);
  const memberMap = new Map<string, string[]>();
  for (const m of need(members) as { conversation_id: string; user_id: string }[]) {
    memberMap.set(m.conversation_id, [...(memberMap.get(m.conversation_id) ?? []), m.user_id]);
  }
  const readAt = new Map(mine.map((m) => [m.conversation_id, m.last_read_at]));
  const conversations: Record<string, Conversation> = {};
  for (const c of need(convs) as Omit<Conversation, "members" | "lastReadAt">[]) {
    // Keep a fresher local read mark (set while the chat is open) over the server's copy.
    const local = state.conversations[c.id]?.lastReadAt;
    const server = readAt.get(c.id) ?? null;
    const lastReadAt = local && server && Date.parse(local) > Date.parse(server) ? local : server;
    conversations[c.id] = { ...c, members: memberMap.get(c.id) ?? [], lastReadAt };
  }
  set({ conversations, lobbyId });

  // Pull anything unread so badges are right before a chat is opened.
  const oldest = Object.values(conversations).reduce((min, c) => (c.lastReadAt && c.lastReadAt < min ? c.lastReadAt : min), new Date().toISOString());
  const fresh = need(
    await supabase.from("messages").select("*").in("conversation_id", ids).gt("created_at", oldest).order("created_at", { ascending: false }).limit(300),
  ) as Message[];
  set((s) => {
    const messages = { ...s.messages };
    for (const m of fresh) messages[m.conversation_id] = mergeMessages(messages[m.conversation_id] ?? [], [m]);
    return { messages };
  });
}

function subscribe(myId: string) {
  if (!supabase) return;
  if (live) void supabase.removeChannel(live);
  if (presenceChannel) void supabase.removeChannel(presenceChannel);

  live = supabase
    .channel("mind-the-gap-live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => receive(p.new as Message))
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (p) => {
      const row = p.new as Profile;
      if (row?.id) set((s) => ({ players: { ...s.players, [row.id]: row }, me: s.me?.id === row.id ? row : s.me }));
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity" }, (p) => {
      const row = p.new as Activity;
      set((s) => ({ activity: [row, ...s.activity.filter((a) => a.id !== row.id)].slice(0, 100) }));
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversation_members" }, (p) => {
      const row = p.new as { conversation_id: string; user_id: string };
      if (row.user_id === myId || state.conversations[row.conversation_id]) void loadConversations().catch(() => {});
    })
    .subscribe((status) => {
      // After a dropped connection, catch up on anything missed.
      if (status === "SUBSCRIBED" && state.status.kind === "ready") void loadConversations().catch(() => {});
    });

  presenceChannel = supabase.channel("mind-the-gap-presence", { config: { presence: { key: myId } } });
  presenceChannel
    .on("presence", { event: "sync" }, () => {
      set({ presence: new Set(Object.keys(presenceChannel?.presenceState() ?? {})) });
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void presenceChannel?.track({ at: Date.now() });
    });
}

function receive(m: Message) {
  const known = state.conversations[m.conversation_id];
  set((s) => {
    const conv = s.conversations[m.conversation_id];
    return {
      messages: { ...s.messages, [m.conversation_id]: mergeMessages(s.messages[m.conversation_id] ?? [], [m]) },
      conversations: conv ? { ...s.conversations, [conv.id]: { ...conv, last_message_at: m.created_at } } : s.conversations,
    };
  });
  if (!known) void loadConversations().catch(() => {});
  if (state.me && m.sender_id !== state.me.id && !state.blocked.has(m.sender_id)) incoming.forEach((cb) => cb(m));
}

async function touch() {
  if (!supabase || !state.me) return;
  await supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", state.me.id);
}

// --- actions -------------------------------------------------------------------

export async function saveProfile(input: { name: string; avatar: string; color: string }): Promise<string | null> {
  if (!supabase) return "Online play isn't set up.";
  const name = cleanName(input.name);
  if (!name) return "Pick a name first.";
  try {
    const isNew = !state.me;
    const row = need(
      await supabase.from("profiles").upsert({ id: state.me?.id ?? localPlayerId(), name, avatar: input.avatar, color: input.color }).select("*").single(),
    ) as Profile;
    if (isNew) {
      await start(row);
      await postActivity(`${row.avatar} ${row.name} joined London 👋`);
    } else set((s) => ({ me: row, players: { ...s.players, [row.id]: row } }));
    return null;
  } catch (e) {
    return friendly(e);
  }
}

let lastStatus = "";
let statusTimer = 0;
/** What I'm doing, shown to other players. Coalesced so a busy ride doesn't spam the server. */
export function setStatus(text: string) {
  if (!supabase || !state.me || text === lastStatus) return;
  lastStatus = text;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    if (!state.me) return;
    void supabase.from("profiles").update({ status: text.slice(0, 120), last_seen: new Date().toISOString() }).eq("id", state.me.id);
  }, 1500);
}

export async function syncScore(stars: number, points: number) {
  if (!supabase || !state.me || (state.me.stars === stars && state.me.points === points)) return;
  await supabase.from("profiles").update({ stars, points }).eq("id", state.me.id);
}

export async function postActivity(text: string) {
  if (!supabase || !state.me) return;
  await supabase.from("activity").insert({ user_id: state.me.id, text: text.slice(0, 160) });
}

let tempId = -1;
/** `silent` messages (automatic ones, like a hang-out wave) don't count as the player texting. */
export async function send(convId: string, raw: string, opts: { silent?: boolean } = {}): Promise<string | null> {
  if (!supabase || !state.me) return "You're offline.";
  const body = cleanMessage(raw);
  if (!body) return null;
  const temp: Message = { id: tempId--, conversation_id: convId, sender_id: state.me.id, body, created_at: new Date().toISOString(), pending: true };
  set((s) => ({ messages: { ...s.messages, [convId]: mergeMessages(s.messages[convId] ?? [], [temp]) } }));
  const res = await supabase.from("messages").insert({ conversation_id: convId, sender_id: state.me.id, body }).select("*").single();
  if (res.error) {
    const reason = friendly(res.error);
    set((s) => ({ messages: { ...s.messages, [convId]: (s.messages[convId] ?? []).map((m) => (m.id === temp.id ? { ...m, pending: false, failed: reason } : m)) } }));
    return reason;
  }
  const row = res.data as Message;
  set((s) => ({ messages: { ...s.messages, [convId]: mergeMessages((s.messages[convId] ?? []).filter((m) => m.id !== temp.id), [row]) } }));
  if (!opts.silent) sentListeners.forEach((cb) => cb());
  return null;
}

export function dismissFailed(convId: string, id: number) {
  set((s) => ({ messages: { ...s.messages, [convId]: (s.messages[convId] ?? []).filter((m) => m.id !== id) } }));
}

export async function loadHistory(convId: string) {
  if (!supabase || state.historyLoaded[convId]) return;
  const rows = need(await supabase.from("messages").select("*").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(100)) as Message[];
  set((s) => ({
    messages: { ...s.messages, [convId]: mergeMessages(s.messages[convId] ?? [], rows) },
    historyLoaded: { ...s.historyLoaded, [convId]: true },
  }));
}

export async function markRead(convId: string) {
  if (!supabase || !state.me) return;
  const conv = state.conversations[convId];
  if (!conv || unreadFor(convId) === 0) return;
  const now = new Date().toISOString();
  set((s) => ({ conversations: { ...s.conversations, [convId]: { ...conv, lastReadAt: now } } }));
  await supabase.from("conversation_members").update({ last_read_at: now }).eq("conversation_id", convId).eq("user_id", state.me.id);
}

export async function markAllRead() {
  await Promise.all(Object.keys(state.conversations).map((id) => markRead(id)));
}

export async function startDm(otherId: string): Promise<string> {
  if (!supabase) throw new Error("offline");
  const id = need(await supabase.rpc("start_dm", { me: state.me?.id, other: otherId })) as string;
  await loadConversations();
  return id;
}

export async function createGroup(name: string, emoji: string, members: string[]): Promise<string> {
  if (!supabase) throw new Error("offline");
  const id = need(await supabase.rpc("create_group", { me: state.me?.id, group_name: name, group_emoji: emoji, members })) as string;
  await loadConversations();
  return id;
}

export async function addToGroup(convId: string, members: string[]) {
  if (!supabase) return;
  need(await supabase.rpc("add_to_group", { me: state.me?.id, conv: convId, members }));
  await loadConversations();
}

export async function leaveGroup(convId: string) {
  if (!supabase || !state.me) return;
  need(await supabase.from("conversation_members").delete().eq("conversation_id", convId).eq("user_id", state.me.id));
  set((s) => {
    const conversations = { ...s.conversations };
    delete conversations[convId];
    return { conversations };
  });
}

export async function block(id: string) {
  if (!supabase || !state.me) return;
  need(await supabase.from("blocks").upsert({ blocker: state.me.id, blocked: id }));
  set((s) => ({ blocked: new Set([...s.blocked, id]) }));
}

export async function unblock(id: string) {
  if (!supabase || !state.me) return;
  need(await supabase.from("blocks").delete().eq("blocker", state.me.id).eq("blocked", id));
  set((s) => {
    const blocked = new Set(s.blocked);
    blocked.delete(id);
    return { blocked };
  });
}

// --- daily challenge -----------------------------------------------------------------

export interface DailyBoardRow {
  user_id: string;
  points: number;
  stars: number;
  arrival: number;
  cost: number;
  profiles: { name: string; avatar: string; color: string } | null;
}

/** Today's shared challenge: read it, or (first player of the day) create it. Null when offline. */
export async function loadSharedDaily<T>(day: string, create: () => Promise<{ mission: T; source: string }>): Promise<{ mission: T; source: string } | null> {
  if (!supabase) return null;
  const existing = await supabase.from("daily_challenges").select("mission,source").eq("day", day).maybeSingle();
  if (existing.error) return null;
  if (existing.data) return existing.data as { mission: T; source: string };
  const made = await create();
  await supabase.from("daily_challenges").insert({ day, mission: made.mission, source: made.source });
  // Someone else may have created it at the same moment; whatever is stored wins.
  const stored = await supabase.from("daily_challenges").select("mission,source").eq("day", day).maybeSingle();
  return (stored.data as { mission: T; source: string } | null) ?? made;
}

export async function loadDailyBoard(day: string): Promise<DailyBoardRow[]> {
  if (!supabase) return [];
  const res = await supabase.from("daily_runs").select("user_id,points,stars,arrival,cost,profiles(name,avatar,color)").eq("day", day).order("points", { ascending: false }).limit(25);
  return (res.data ?? []) as unknown as DailyBoardRow[];
}

/** Posts the first run of the day. Returns false if this player already has a run today. */
export async function submitDailyRun(day: string, run: { points: number; stars: number; arrival: number; cost: number }): Promise<boolean> {
  if (!supabase || !state.me) return false;
  const res = await supabase.from("daily_runs").insert({ day, user_id: state.me.id, ...run });
  return !res.error;
}

export interface DailyRank {
  /** 1-based; players on the same points share a rank. */
  rank: number;
  total: number;
  row: DailyBoardRow;
}

/** This player's place on a day's board, found with count queries so it works outside the top 25. */
export async function loadDailyRank(day: string): Promise<DailyRank | null> {
  if (!supabase || !state.me) return null;
  const mine = await supabase.from("daily_runs").select("user_id,points,stars,arrival,cost,profiles(name,avatar,color)").eq("day", day).eq("user_id", state.me.id).maybeSingle();
  if (mine.error || !mine.data) return null;
  const row = mine.data as unknown as DailyBoardRow;
  const [above, all] = await Promise.all([
    supabase.from("daily_runs").select("user_id", { count: "exact", head: true }).eq("day", day).gt("points", row.points),
    supabase.from("daily_runs").select("user_id", { count: "exact", head: true }).eq("day", day),
  ]);
  if (above.error || all.error) return null;
  return { rank: (above.count ?? 0) + 1, total: all.count ?? 1, row };
}

/** Called after every message this player successfully sends. */
const sentListeners = new Set<() => void>();
export function onMessageSent(cb: () => void): () => void {
  sentListeners.add(cb);
  return () => sentListeners.delete(cb);
}
