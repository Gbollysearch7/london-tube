import type { Conversation, Message, Profile } from "./types";

// Pure helpers for the online phone, kept free of Supabase so they can be unit tested.

export const NAME_MAX = 20;
export const MESSAGE_MAX = 1000;
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

export function cleanMessage(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim().slice(0, MESSAGE_MAX);
}

/** The other player in a 1:1 chat. */
export function dmPartner(conv: Conversation, me: string): string | undefined {
  return conv.kind === "dm" ? conv.members.find((m) => m !== me) : undefined;
}

export function conversationTitle(conv: Conversation, me: string, players: Record<string, Profile>): string {
  if (conv.kind === "dm") {
    const other = dmPartner(conv, me);
    return (other && players[other]?.name) || "Unknown player";
  }
  return conv.name || "Group";
}

export function conversationEmoji(conv: Conversation, me: string, players: Record<string, Profile>): string {
  if (conv.kind === "dm") {
    const other = dmPartner(conv, me);
    return (other && players[other]?.avatar) || "🙂";
  }
  return conv.emoji;
}

/** Messages from other (unblocked) players that arrived after I last read the chat. */
export function unreadCount(conv: Conversation, messages: Message[], me: string, blocked: Set<string>): number {
  const since = conv.lastReadAt ? Date.parse(conv.lastReadAt) : -Infinity;
  return messages.filter((m) => m.sender_id !== me && !blocked.has(m.sender_id) && Date.parse(m.created_at) > since).length;
}

/** Pinned lobby first, then newest activity first. */
export function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    if (a.kind === "public" && b.kind !== "public") return -1;
    if (b.kind === "public" && a.kind !== "public") return 1;
    return Date.parse(b.last_message_at) - Date.parse(a.last_message_at);
  });
}

/** Insert or replace by id, keeping chronological order (server ids are monotonic). */
export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map<number, Message>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);
}

export function isOnline(p: Profile | undefined, presence: Set<string>, now = Date.now()): boolean {
  if (!p) return false;
  return presence.has(p.id) || now - Date.parse(p.last_seen) < ONLINE_WINDOW_MS;
}

/** "now", "5m", "3h", "2d" style relative time for chat lists. */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function clockTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Leaderboard order: stars, then best points, then who got there first. */
export function rankPlayers(players: Profile[]): Profile[] {
  return [...players].sort((a, b) => b.stars - a.stars || b.points - a.points || Date.parse(a.created_at) - Date.parse(b.created_at));
}
