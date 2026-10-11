import { useEffect, useRef } from "react";
import { AppHeader } from "../../phone/ui";
import { dayName, fmtClock, type LifeState } from "../engine";
import { act, useLife } from "../store";
import type { Character } from "./cast";
import { answer, markRead, storyUnread as unreadOf, threads } from "./hook";
import type { StoryMsg } from "./types";
import "./story.css";

// Character chats inside the phone's Messages app.

export function CharAvatar({ c, size = 36 }: { c: Character; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.55, background: c.color }} aria-hidden>
      {c.emoji}
    </span>
  );
}

export const msgTime = (m: StoryMsg) => `${dayName(m.day).slice(0, 3)} ${fmtClock(m.clock)}`;

/** Rows for character chats, shown at the top of the Messages list. */
export function StoryChatRows({ onOpen }: { onOpen: (characterId: string) => void }) {
  const { life } = useLife();
  const list = threads(life);
  if (!list.length) return null;
  return (
    <>
      <h4>People</h4>
      <ul className="plist">
        {list.map((t) => (
          <li key={t.id}>
            <button className="prow" onClick={() => onOpen(t.id)}>
              <CharAvatar c={t.character} />
              <span className="prow-main">
                <span className="prow-title">
                  {t.character.name}
                  <span className="tag">{t.character.role}</span>
                </span>
                <span className="prow-sub">
                  {t.last?.from === "me" ? "You: " : ""}
                  {t.last?.text}
                </span>
              </span>
              <span className="prow-meta">
                {t.last && <span className="muted small">{fmtClock(t.last.clock)}</span>}
                {t.unread > 0 ? <span className="badge-n">{t.unread}</span> : t.choices.length > 0 && <span className="story-dot" aria-label="Waiting for your reply" />}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** One character's chat thread (phone screen: { app: "story", id }). */
export function StoryThread({ id }: { id: string }) {
  const { life } = useLife();
  const t = threads(life).find((x) => x.id === id);
  const scroller = useRef<HTMLDivElement>(null);

  // Reading the chat marks it read, including texts that arrive while it's open.
  useEffect(() => {
    if (t && t.unread > 0) act((s) => ({ state: markRead(s, id), events: [] }));
  }, [id, t?.unread]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [t?.msgs.length]);

  if (!t) {
    return (
      <div className="app">
        <AppHeader title="Chat" />
        <div className="app-body center-col">
          <p className="muted">No messages yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app chat">
      <AppHeader
        title={
          <span className="chat-title">
            <span>
              {t.character.emoji} {t.character.name}
            </span>
            <span className="chat-sub">
              {t.character.role} · {t.closeness}
            </span>
          </span>
        }
        right={<RelMeter rel={t.rel} color={t.character.color} />}
      />
      <div className="chat-scroll" ref={scroller}>
        {t.msgs.map((m, i) => {
          const mine = m.from === "me";
          const newDay = i === 0 || t.msgs[i - 1].day !== m.day;
          return (
            <div key={i} className="story-msg">
              {newDay && <p className="story-day muted small">{dayName(m.day)}</p>}
              <div className={`bubble-row ${mine ? "mine" : ""}`}>
                <div className={`bubble ${mine ? "mine" : ""}`}>
                  <span className="bubble-text">{m.text}</span>
                  <span className="bubble-time">{fmtClock(m.clock)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {t.choices.length > 0 ? (
        <Replies id={t.id} choices={t.choices} />
      ) : (
        <p className="muted small center pad story-hint">{t.character.name} will text again soon.</p>
      )}
    </div>
  );
}

export function Replies({ id, choices, compact }: { id: string; choices: string[]; compact?: boolean }) {
  return (
    <div className={`story-replies ${compact ? "compact" : ""}`}>
      {choices.map((label, i) => (
        <button key={i} onClick={() => act((s) => answer(s, id, i))}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Relationship, shown quietly as a small ring. */
function RelMeter({ rel, color }: { rel: number; color: string }) {
  return (
    <span className="story-rel" title={`Relationship ${Math.round(rel)}/100`} style={{ background: `conic-gradient(${color} ${rel * 3.6}deg, var(--p-line) 0)` }}>
      <span>♥</span>
    </span>
  );
}

/** Unread character texts, added to the phone's badge. */
export function storyUnread(s: LifeState | null): number {
  return unreadOf(s);
}
