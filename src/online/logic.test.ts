import { describe, expect, test } from "vitest";
import { ago, cleanMessage, cleanName, conversationTitle, isOnline, mergeMessages, rankPlayers, sortConversations, unreadCount } from "./logic";
import type { Conversation, Message, Profile } from "./types";

const player = (id: string, extra: Partial<Profile> = {}): Profile => ({
  id,
  name: id.toUpperCase(),
  avatar: "🙂",
  color: "#000000",
  status: "",
  stars: 0,
  points: 0,
  last_seen: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  ...extra,
});
const conv = (id: string, kind: Conversation["kind"], extra: Partial<Conversation> = {}): Conversation => ({
  id,
  kind,
  name: kind === "dm" ? null : id,
  emoji: "💬",
  created_by: null,
  last_message_at: "2026-01-01T10:00:00Z",
  members: [],
  lastReadAt: null,
  ...extra,
});
const msg = (id: number, sender: string, at: string, conversation_id = "c"): Message => ({ id, conversation_id, sender_id: sender, body: `m${id}`, created_at: at });

describe("phone chat logic", () => {
  test("names and messages are trimmed and capped", () => {
    expect(cleanName("   Ayo   from\n Peckham  ")).toBe("Ayo from Peckham");
    expect(cleanName("x".repeat(50))).toHaveLength(20);
    expect(cleanMessage("  hi  ")).toBe("hi");
    expect(cleanMessage("   ")).toBe("");
  });

  test("a 1:1 chat is titled after the other player", () => {
    const players = { me: player("me"), ayo: player("ayo", { name: "Ayo" }) };
    expect(conversationTitle(conv("c", "dm", { members: ["me", "ayo"] }), "me", players)).toBe("Ayo");
    expect(conversationTitle(conv("Crew", "group"), "me", players)).toBe("Crew");
  });

  test("unread counts only others' messages after my last read, ignoring blocked players", () => {
    const c = conv("c", "group", { lastReadAt: "2026-01-01T10:00:00Z" });
    const messages = [
      msg(1, "ayo", "2026-01-01T09:59:00Z"),
      msg(2, "ayo", "2026-01-01T10:01:00Z"),
      msg(3, "me", "2026-01-01T10:02:00Z"),
      msg(4, "troll", "2026-01-01T10:03:00Z"),
      msg(5, "bea", "2026-01-01T10:04:00Z"),
    ];
    expect(unreadCount(c, messages, "me", new Set(["troll"]))).toBe(2);
    expect(unreadCount({ ...c, lastReadAt: null }, messages, "me", new Set())).toBe(4);
  });

  test("the public lobby stays on top, then newest chats first", () => {
    const list = sortConversations([
      conv("old", "dm", { last_message_at: "2026-01-01T08:00:00Z" }),
      conv("lobby", "public", { last_message_at: "2026-01-01T01:00:00Z" }),
      conv("new", "group", { last_message_at: "2026-01-01T12:00:00Z" }),
    ]);
    expect(list.map((c) => c.id)).toEqual(["lobby", "new", "old"]);
  });

  test("merging messages de-duplicates by id and keeps time order", () => {
    const a = [msg(2, "x", "2026-01-01T10:02:00Z"), msg(1, "x", "2026-01-01T10:01:00Z")];
    const merged = mergeMessages(a, [msg(2, "x", "2026-01-01T10:02:00Z"), msg(3, "y", "2026-01-01T10:00:00Z")]);
    expect(merged.map((m) => m.id)).toEqual([3, 1, 2]);
  });

  test("online means present now or seen in the last two minutes", () => {
    const now = Date.parse("2026-01-01T10:00:00Z");
    expect(isOnline(player("a", { last_seen: "2026-01-01T09:59:00Z" }), new Set(), now)).toBe(true);
    expect(isOnline(player("b", { last_seen: "2026-01-01T09:50:00Z" }), new Set(), now)).toBe(false);
    expect(isOnline(player("b", { last_seen: "2026-01-01T09:50:00Z" }), new Set(["b"]), now)).toBe(true);
  });

  test("league ranks by stars, then points", () => {
    const ranked = rankPlayers([player("a", { stars: 5, points: 100 }), player("b", { stars: 9 }), player("c", { stars: 5, points: 900 })]);
    expect(ranked.map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  test("relative times", () => {
    const now = Date.parse("2026-01-01T10:00:00Z");
    expect(ago("2026-01-01T09:59:50Z", now)).toBe("now");
    expect(ago("2026-01-01T09:55:00Z", now)).toBe("5m");
    expect(ago("2026-01-01T07:00:00Z", now)).toBe("3h");
  });
});
