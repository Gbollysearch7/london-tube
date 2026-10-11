// Characters who text you. Everything here is saved inside LifeState, so keep it plain JSON.

export type CharId = "jess" | "dele" | "boss" | "mum" | "sam" | "priya";

export type Vars = Record<string, string | number>;

export interface StoryMsg {
  /** "them" = the character, "me" = the player's reply. */
  from: "them" | "me";
  text: string;
  day: number;
  clock: number;
}

/** Reply buttons waiting under a character's latest text. */
export interface Pending {
  event: string;
  /** Indexes into the event's choices that were shown (some choices are conditional). */
  opts: number[];
  labels: string[];
  vars: Vars;
  /** Absolute minutes ((day - 1) * 1440 + clock) after which the question lapses. */
  expires: number;
}

export interface Thread {
  msgs: StoryMsg[];
  /** Relationship, 0–100. */
  rel: number;
  unread: number;
  pending?: Pending;
  /** Absolute minutes of the last text from this character. */
  lastAt: number;
}

/** An accepted invite: be at `station` between `from` and `until` (clock on `day`). */
export interface Plan {
  id: number;
  who: CharId;
  event: string;
  station: string;
  day: number;
  from: number;
  until: number;
  label: string;
  vars: Vars;
}

/** A follow-up text due at an absolute minute. */
export interface Scheduled {
  event: string;
  at: number;
  vars: Vars;
}

export interface StoryState {
  v: 1;
  threads: Partial<Record<CharId, Thread>>;
  /** Event id → game day it last fired. */
  seen: Record<string, number>;
  flags: string[];
  plans: Plan[];
  queue: Scheduled[];
  /** Cadence bookkeeping for the current game day. */
  today: { day: number; n: number; last: number };
  /** Real ms of the last time the game was opened (for "back after a break"). */
  lastOpen: number;
  nextId: number;
}
