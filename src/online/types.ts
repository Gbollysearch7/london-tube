export interface Profile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  status: string;
  stars: number;
  points: number;
  last_seen: string;
  created_at: string;
}

export type ConversationKind = "public" | "dm" | "group";

export interface Conversation {
  id: string;
  kind: ConversationKind;
  name: string | null;
  emoji: string;
  created_by: string | null;
  last_message_at: string;
  /** Player ids in the chat (empty for the public lobby). */
  members: string[];
  /** When I last read it; null if I'm not a member row yet. */
  lastReadAt: string | null;
}

export interface Message {
  id: number;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  /** Set on optimistic messages until the server confirms them. */
  pending?: boolean;
  failed?: string;
}

export interface Activity {
  id: number;
  user_id: string;
  text: string;
  created_at: string;
}

export type OnlineStatus =
  | { kind: "off"; reason: string }
  | { kind: "connecting" }
  | { kind: "needs-profile" }
  | { kind: "ready" }
  | { kind: "error"; reason: string };
