import { useMemo, useState } from "react";
import { ago, rankPlayers } from "../../online/logic";
import { block, startDm, unblock, useOnline } from "../../online/store";
import { push, replace } from "../nav";
import { setPrefs, usePrefs, type PhonePrefs } from "../prefs";
import { AppHeader, Avatar, OnlineGate, ProfileForm, useIsOnline } from "../ui";

export function ContactsApp() {
  return (
    <OnlineGate title="Contacts">
      <Contacts />
    </OnlineGate>
  );
}

function Contacts() {
  const s = useOnline();
  const online = useIsOnline();
  const [query, setQuery] = useState("");
  const people = Object.values(s.players)
    .filter((p) => p.id !== s.me!.id && p.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(online(b)) - Number(online(a)) || Date.parse(b.last_seen) - Date.parse(a.last_seen));
  const onlineCount = people.filter((p) => online(p)).length;

  return (
    <div className="app">
      <AppHeader title="Contacts" right={<span className="muted small">{onlineCount} online</span>} />
      <div className="app-body">
        <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players" aria-label="Search players" />
        <ul className="plist">
          {people.map((p) => (
            <li key={p.id}>
              <button className="prow" onClick={() => push({ app: "player", id: p.id })}>
                <Avatar p={p} online={online(p)} />
                <span className="prow-main">
                  <span className="prow-title">
                    {p.name} {s.blocked.has(p.id) && <span className="tag">blocked</span>}
                  </span>
                  <span className="prow-sub">{online(p) ? p.status || "Online" : `Seen ${ago(p.last_seen)} ago`}</span>
                </span>
                <span className="prow-meta muted small">★ {p.stars}</span>
              </button>
            </li>
          ))}
          {people.length === 0 && <li className="muted small">No one else here yet. Share the game from the Invite app.</li>}
        </ul>
      </div>
    </div>
  );
}

export function PlayerApp({ id }: { id: string }) {
  return (
    <OnlineGate title="Player">
      <PlayerCard id={id} />
    </OnlineGate>
  );
}

function PlayerCard({ id }: { id: string }) {
  const s = useOnline();
  const online = useIsOnline();
  const p = s.players[id];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMe = id === s.me!.id;
  const blocked = s.blocked.has(id);
  const recent = s.activity.filter((a) => a.user_id === id).slice(0, 5);

  if (!p) {
    return (
      <div className="app">
        <AppHeader title="Player" />
        <p className="muted center pad">Player not found.</p>
      </div>
    );
  }

  const text = async () => {
    setBusy(true);
    setError(null);
    try {
      replace({ app: "chat", id: await startDm(id) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open a chat.");
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <AppHeader title={p.name} />
      <div className="app-body center-col">
        <Avatar p={p} size={84} online={online(p)} />
        <h3>{p.name}</h3>
        <p className="muted small">{online(p) ? p.status || "Online now" : `Last seen ${ago(p.last_seen)} ago`}</p>
        <div className="stat-row">
          <div>
            <strong>★ {p.stars}</strong>
            <span className="muted small">stars</span>
          </div>
          <div>
            <strong>{p.points.toLocaleString()}</strong>
            <span className="muted small">points</span>
          </div>
        </div>
        {!isMe && (
          <div className="row gap-s">
            <button className="pbtn" disabled={busy || blocked} onClick={() => void text()}>
              💬 Text
            </button>
            <button className="pbtn ghosty" onClick={() => void (blocked ? unblock(id) : block(id))}>
              {blocked ? "Unblock" : "🚫 Block"}
            </button>
          </div>
        )}
        {error && <p className="perror">{error}</p>}
        {recent.length > 0 && (
          <ul className="feed small">
            {recent.map((a) => (
              <li key={a.id}>
                <span>{a.text}</span>
                <span className="muted">{ago(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function FeedApp() {
  return (
    <OnlineGate title="The Commute">
      <Feed />
    </OnlineGate>
  );
}

function Feed() {
  const s = useOnline();
  const items = s.activity.filter((a) => !s.blocked.has(a.user_id));
  return (
    <div className="app">
      <AppHeader title="📰 The Commute" />
      <div className="app-body">
        <p className="muted small">Live from every player in London.</p>
        <ul className="plist">
          {items.map((a) => (
            <li key={a.id}>
              <button className="prow" onClick={() => push({ app: "player", id: a.user_id })}>
                <Avatar p={s.players[a.user_id]} size={30} />
                <span className="prow-main">
                  <span className="prow-text">{a.text}</span>
                </span>
                <span className="muted small">{ago(a.created_at)}</span>
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="muted small">Quiet morning. Finish a mission to make the news.</li>}
        </ul>
      </div>
    </div>
  );
}

export function LeagueApp() {
  return (
    <OnlineGate title="League">
      <League />
    </OnlineGate>
  );
}

function League() {
  const s = useOnline();
  const ranked = useMemo(() => rankPlayers(Object.values(s.players)).slice(0, 50), [s.players]);
  const myRank = rankPlayers(Object.values(s.players)).findIndex((p) => p.id === s.me!.id) + 1;
  return (
    <div className="app">
      <AppHeader title="🏆 League" right={myRank > 0 && <span className="muted small">You: #{myRank}</span>} />
      <div className="app-body">
        <ol className="league">
          {ranked.map((p, i) => (
            <li key={p.id} className={p.id === s.me!.id ? "me" : ""}>
              <button className="prow" onClick={() => push({ app: "player", id: p.id })}>
                <span className="rank">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
                <Avatar p={p} size={30} />
                <span className="prow-main">
                  <span className="prow-title">{p.name}</span>
                </span>
                <span className="prow-meta">
                  <strong>★ {p.stars}</strong>
                  <span className="muted small">{p.points.toLocaleString()} pts</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const WALLPAPERS: { id: PhonePrefs["wallpaper"]; label: string }[] = [
  { id: "night", label: "Night Tube" },
  { id: "thames", label: "Thames" },
  { id: "sunset", label: "Sunset" },
  { id: "day", label: "Daytime" },
];

export function SettingsApp() {
  const prefs = usePrefs();
  const s = useOnline();
  return (
    <div className="app">
      <AppHeader title="⚙️ Settings" />
      <div className="app-body">
        <section className="pcard">
          <h4>Wallpaper</h4>
          <div className="wall-picker">
            {WALLPAPERS.map((w) => (
              <button key={w.id} className={`wall wall-${w.id} ${prefs.wallpaper === w.id ? "on" : ""}`} onClick={() => setPrefs({ wallpaper: w.id })}>
                {w.label}
              </button>
            ))}
          </div>
        </section>
        <section className="pcard">
          <label className="toggle">
            <span>Message notifications</span>
            <input type="checkbox" checked={prefs.notifications} onChange={(e) => setPrefs({ notifications: e.target.checked })} />
          </label>
        </section>
        <section className="pcard">
          <h4>Sound and feel</h4>
          <label className="toggle">
            <span>Sound effects</span>
            <input type="checkbox" checked={prefs.sound} onChange={(e) => setPrefs({ sound: e.target.checked })} />
          </label>
          <label className="toggle">
            <span>Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={prefs.volume}
              disabled={!prefs.sound}
              onChange={(e) => setPrefs({ volume: Number(e.target.value) })}
              aria-label="Volume"
              style={{ width: 130 }}
            />
          </label>
          <label className="toggle">
            <span>Station announcements</span>
            <input type="checkbox" checked={prefs.announcements} onChange={(e) => setPrefs({ announcements: e.target.checked })} />
          </label>
          <label className="toggle">
            <span>Vibration</span>
            <input type="checkbox" checked={prefs.haptics} onChange={(e) => setPrefs({ haptics: e.target.checked })} />
          </label>
        </section>
        <OnlineGate title="Settings" inline>
          <section className="pcard">
            <h4>Your profile</h4>
            <ProfileForm />
          </section>
          {s.blocked.size > 0 && (
            <section className="pcard">
              <h4>Blocked players</h4>
              <ul className="plist">
                {[...s.blocked].map((id) => (
                  <li key={id} className="row between">
                    <span>{s.players[id]?.name ?? "Unknown player"}</span>
                    <button className="link" onClick={() => void unblock(id)}>
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </OnlineGate>
      </div>
    </div>
  );
}
