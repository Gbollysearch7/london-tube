import { useEffect, useMemo, useRef, useState } from "react";
import { MESSAGE_MAX, ago, clockTime, conversationEmoji, conversationTitle, dmPartner, sortConversations } from "../../online/logic";
import {
  addToGroup,
  block,
  createGroup,
  dismissFailed,
  leaveGroup,
  loadHistory,
  markAllRead,
  markRead,
  send,
  unblock,
  unreadFor,
  useOnline,
} from "../../online/store";
import type { Conversation } from "../../online/types";
import { back, push, replace } from "../nav";
import { AppHeader, Avatar, OnlineGate, useIsOnline } from "../ui";
import { StoryChatRows } from "../../life/story/phone";

const QUICK = ["On my way 🚇", "Running late 😬", "Just arrived 🎯", "Mind the gap!", "Signal failure again 🙄", "Who's on the Victoria line?"];
const GROUP_EMOJI = ["👥", "🚇", "🚌", "☕", "⚽", "🎉", "💼", "🏃", "🌧️", "🍻"];

export function MessagesApp() {
  return (
    <div className="app">
      <AppHeader title="Messages" />
      <div className="app-body messages-body">
        {/* Characters text you whether or not you're online. */}
        <StoryChatRows onOpen={(id) => push({ app: "story", id })} />
        <OnlineGate title="Messages" inline>
          <ChatList />
        </OnlineGate>
      </div>
    </div>
  );
}

function ChatList() {
  const s = useOnline();
  const online = useIsOnline();
  const me = s.me!;
  const list = useMemo(() => sortConversations(Object.values(s.conversations)), [s.conversations]);
  const anyUnread = list.some((c) => unreadFor(c.id, s) > 0);

  return (
    <>
      <h4 className="row between">
        <span>Players</span>
        {anyUnread && (
          <button className="link" onClick={() => void markAllRead()}>
            Read all
          </button>
        )}
      </h4>
        <div className="row gap-s">
          <button className="pbtn small" onClick={() => push({ app: "contacts" })}>
            ✏️ New chat
          </button>
          <button className="pbtn small ghosty" onClick={() => push({ app: "newgroup" })}>
            ＋ New group
          </button>
        </div>
        <ul className="plist">
          {list.map((c) => {
            const msgs = (s.messages[c.id] ?? []).filter((m) => !s.blocked.has(m.sender_id));
            const last = msgs[msgs.length - 1];
            const unread = unreadFor(c.id, s);
            const partner = dmPartner(c, me.id);
            const who = last ? (last.sender_id === me.id ? "You" : s.players[last.sender_id]?.name ?? "Someone") : "";
            return (
              <li key={c.id}>
                <button className="prow" onClick={() => push({ app: "chat", id: c.id })}>
                  {c.kind === "dm" ? (
                    <Avatar p={partner ? s.players[partner] : undefined} online={online(partner ? s.players[partner] : undefined)} />
                  ) : (
                    <span className="avatar group">{c.emoji}</span>
                  )}
                  <span className="prow-main">
                    <span className="prow-title">
                      {conversationTitle(c, me.id, s.players)}
                      {c.kind === "public" && <span className="tag">Everyone</span>}
                    </span>
                    <span className="prow-sub">{last ? `${c.kind === "dm" && who !== "You" ? "" : `${who}: `}${last.body}` : c.kind === "public" ? "Say hi to every player in London" : "No messages yet"}</span>
                  </span>
                  <span className="prow-meta">
                    {last && <span className="muted small">{ago(last.created_at)}</span>}
                    {unread > 0 && <span className="badge-n">{unread > 99 ? "99+" : unread}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
    </>
  );
}

export function ChatApp({ id }: { id: string }) {
  return (
    <OnlineGate title="Chat">
      <ChatThread id={id} />
    </OnlineGate>
  );
}

function ChatThread({ id }: { id: string }) {
  const s = useOnline();
  const online = useIsOnline();
  const me = s.me!;
  const conv = s.conversations[id];
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const msgs = useMemo(() => (s.messages[id] ?? []).filter((m) => !s.blocked.has(m.sender_id)), [s.messages, s.blocked, id]);

  useEffect(() => {
    void loadHistory(id).catch(() => setError("Couldn't load older messages."));
  }, [id]);

  // Reading the chat marks it read, including texts that arrive while it's open.
  useEffect(() => {
    if (conv) void markRead(id);
  }, [id, conv, msgs.length]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  if (!conv) {
    return (
      <div className="app">
        <AppHeader title="Chat" />
        <div className="app-body center-col">
          <p className="muted">This chat isn't available any more.</p>
        </div>
      </div>
    );
  }

  const partnerId = dmPartner(conv, me.id);
  const partner = partnerId ? s.players[partnerId] : undefined;
  const isBlocked = !!partnerId && s.blocked.has(partnerId);
  const title = conversationTitle(conv, me.id, s.players);
  const sub =
    conv.kind === "dm"
      ? partner
        ? online(partner)
          ? partner.status || "Online"
          : `Last seen ${ago(partner.last_seen)} ago`
        : ""
      : conv.kind === "public"
        ? "Every player in the game"
        : `${conv.members.length} people`;

  const submit = async (body: string) => {
    if (!body.trim()) return;
    setText("");
    setError(await send(id, body));
  };

  return (
    <div className="app chat">
      <AppHeader
        title={
          <button className="chat-title" onClick={() => partnerId && push({ app: "player", id: partnerId })} disabled={!partnerId}>
            <span>
              {conv.kind === "dm" ? "" : `${conversationEmoji(conv, me.id, s.players)} `}
              {title}
            </span>
            <span className="chat-sub">{sub}</span>
          </button>
        }
        right={
          conv.kind !== "public" && (
            <button className="link" onClick={() => setMenu((m) => !m)} aria-label="Chat options">
              ⋯
            </button>
          )
        }
      />
      {menu && (
        <div className="chat-menu">
          {conv.kind === "dm" && partnerId && (
            <button onClick={() => void (isBlocked ? unblock(partnerId) : block(partnerId)).then(() => setMenu(false))}>
              {isBlocked ? "Unblock" : "🚫 Block"} {partner?.name}
            </button>
          )}
          {conv.kind === "group" && (
            <>
              <button onClick={() => push({ app: "newgroup", id })}>＋ Add people</button>
              <button
                className="danger"
                onClick={() => {
                  void leaveGroup(id);
                  back();
                }}
              >
                Leave group
              </button>
            </>
          )}
        </div>
      )}
      <div className="chat-scroll" ref={scroller}>
        {msgs.length === 0 && <p className="muted small center">No messages yet. Say hello 👋</p>}
        {msgs.map((m, i) => {
          const mine = m.sender_id === me.id;
          const sender = s.players[m.sender_id];
          const showName = !mine && conv.kind !== "dm" && msgs[i - 1]?.sender_id !== m.sender_id;
          return (
            <div key={m.id} className={`bubble-row ${mine ? "mine" : ""}`}>
              {!mine && conv.kind !== "dm" && (showName ? <Avatar p={sender} size={26} /> : <span className="avatar-gap" />)}
              <div className={`bubble ${mine ? "mine" : ""} ${m.failed ? "failed" : ""}`}>
                {showName && (
                  <span className="bubble-name" style={{ color: sender?.color }}>
                    {sender?.name ?? "Someone"}
                  </span>
                )}
                <span className="bubble-text">{m.body}</span>
                <span className="bubble-time">
                  {m.pending ? "sending…" : m.failed ? "not sent" : clockTime(m.created_at)}
                </span>
                {m.failed && (
                  <button className="link small" onClick={() => dismissFailed(id, m.id)}>
                    {m.failed} · dismiss
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {isBlocked ? (
        <p className="muted small center pad">You blocked {partner?.name}. Unblock them to text.</p>
      ) : (
        <>
          <div className="quick">
            {QUICK.map((q) => (
              <button key={q} onClick={() => void submit(q)}>
                {q}
              </button>
            ))}
          </div>
          {error && <p className="perror pad">{error}</p>}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(text);
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Text message" maxLength={MESSAGE_MAX} aria-label="Message" />
            <button className="send" disabled={!text.trim()} aria-label="Send">
              ➤
            </button>
          </form>
        </>
      )}
    </div>
  );
}

/** New group, or (with `id`) add people to an existing one. */
export function NewGroupApp({ id }: { id?: string }) {
  return (
    <OnlineGate title="New group">
      <NewGroup id={id} />
    </OnlineGate>
  );
}

function NewGroup({ id }: { id?: string }) {
  const s = useOnline();
  const online = useIsOnline();
  const existing: Conversation | undefined = id ? s.conversations[id] : undefined;
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(GROUP_EMOJI[0]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const people = Object.values(s.players)
    .filter((p) => p.id !== s.me!.id && !s.blocked.has(p.id) && !existing?.members.includes(p.id))
    .filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(online(b)) - Number(online(a)) || a.name.localeCompare(b.name))
    .slice(0, 80);

  const toggle = (pid: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await addToGroup(existing.id, [...picked]);
        back();
      } else {
        const conv = await createGroup(name.trim(), emoji, [...picked]);
        replace({ app: "chat", id: conv });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't do that. Try again.");
      setBusy(false);
    }
  };

  const valid = existing ? picked.size > 0 : name.trim().length > 0;

  return (
    <div className="app">
      <AppHeader title={existing ? `Add to ${existing.name}` : "New group"} />
      <div className="app-body">
        {!existing && (
          <>
            <label className="field">
              <span>Group name</span>
              <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Victoria line crew" />
            </label>
            <div className="picker">
              {GROUP_EMOJI.map((e) => (
                <button type="button" key={e} className={e === emoji ? "on" : ""} onClick={() => setEmoji(e)} aria-label={`Group icon ${e}`}>
                  {e}
                </button>
              ))}
            </div>
          </>
        )}
        <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players" aria-label="Search players" />
        <ul className="plist">
          {people.map((p) => (
            <li key={p.id}>
              <button className={`prow ${picked.has(p.id) ? "picked" : ""}`} onClick={() => toggle(p.id)} aria-pressed={picked.has(p.id)}>
                <Avatar p={p} online={online(p)} />
                <span className="prow-main">
                  <span className="prow-title">{p.name}</span>
                  <span className="prow-sub">{p.status || "Commuting somewhere"}</span>
                </span>
                <span className="check">{picked.has(p.id) ? "✓" : ""}</span>
              </button>
            </li>
          ))}
          {people.length === 0 && <li className="muted small">No other players found yet. Invite a friend from the Invite app.</li>}
        </ul>
        {error && <p className="perror">{error}</p>}
      </div>
      <div className="app-foot">
        <button className="pbtn wide" disabled={!valid || busy} onClick={() => void submit()}>
          {busy ? "…" : existing ? `Add ${picked.size || ""}` : `Create group${picked.size ? ` with ${picked.size}` : ""}`}
        </button>
      </div>
    </div>
  );
}
