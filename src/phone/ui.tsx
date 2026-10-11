import { useEffect, useState, type ReactNode } from "react";
import { NAME_MAX, isOnline } from "../online/logic";
import { connect, retry, saveProfile, useOnline } from "../online/store";
import type { Profile } from "../online/types";
import { back } from "./nav";

export const AVATARS = ["🙂", "😎", "🤓", "🧐", "🥳", "😴", "🤠", "👩🏾", "👨🏿", "👩🏻", "🧑🏽", "👵🏼", "🧔🏾", "🐶", "🦊", "🐱", "🐸", "🦉", "🚴", "🎧"];
export const COLORS = ["#0a9cda", "#e1251b", "#7d4fb8", "#ee7c0e", "#00afad", "#3ecf8e", "#f2c94c", "#d93a2b", "#2546a8", "#c2569b"];

export function AppHeader({ title, right, onBack = back }: { title: ReactNode; right?: ReactNode; onBack?: () => void }) {
  return (
    <header className="app-head">
      <button className="app-back" onClick={onBack} aria-label="Back">
        <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden>
          <path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Back</span>
      </button>
      <h3>{typeof title === "string" ? title.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, "") : title}</h3>
      <span className="app-head-right">{right}</span>
    </header>
  );
}

export function Avatar({ p, size = 36, online }: { p?: Profile; size?: number; online?: boolean }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.55, background: p?.color ?? "#555" }}>
      {p?.avatar ?? "🙂"}
      {online && <span className="avatar-dot" aria-label="online" />}
    </span>
  );
}

export function useIsOnline() {
  const s = useOnline();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (p?: Profile) => isOnline(p, s.presence, now);
}

/** Wraps apps that need the server: connects, and asks new players for a name first. */
export function OnlineGate({ title, children, inline = false }: { title: string; children: ReactNode; inline?: boolean }) {
  const s = useOnline();
  useEffect(() => {
    void connect();
  }, []);

  if (s.status.kind === "ready") return <>{children}</>;
  const body = (
    <div className="app-body center-col">
        {s.status.kind === "connecting" && <p className="muted">Connecting to London…</p>}
        {s.status.kind === "off" && <p className="muted">{s.status.reason}</p>}
        {s.status.kind === "error" && (
          <>
            <p className="muted">{s.status.reason}</p>
            <button className="pbtn" onClick={() => void retry()}>
              Try again
            </button>
          </>
        )}
        {s.status.kind === "needs-profile" && <ProfileForm intro="Pick a name so other players can find and text you." />}
    </div>
  );
  if (inline) return body;
  return (
    <div className="app">
      <AppHeader title={title} />
      {body}
    </div>
  );
}

export function ProfileForm({ intro, done }: { intro?: string; done?: () => void }) {
  const { me } = useOnline();
  const [name, setName] = useState(me?.name ?? "");
  const [avatar, setAvatar] = useState(me?.avatar ?? AVATARS[1]);
  const [color, setColor] = useState(me?.color ?? COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const err = await saveProfile({ name, avatar, color });
    setBusy(false);
    if (err) setError(err);
    else done?.();
  };

  return (
    <form
      className="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {intro && <p className="muted small">{intro}</p>}
      <div className="profile-preview">
        <span className="avatar" style={{ width: 64, height: 64, fontSize: 36, background: color }}>
          {avatar}
        </span>
      </div>
      <label className="field">
        <span>Name</span>
        <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ayo from Peckham" autoComplete="nickname" />
      </label>
      <div className="field">
        <span>Avatar</span>
        <div className="picker">
          {AVATARS.map((a) => (
            <button type="button" key={a} className={a === avatar ? "on" : ""} onClick={() => setAvatar(a)} aria-label={`Avatar ${a}`}>
              {a}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Colour</span>
        <div className="picker">
          {COLORS.map((c) => (
            <button type="button" key={c} className={`swatch ${c === color ? "on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Colour ${c}`} />
          ))}
        </div>
      </div>
      {error && <p className="perror">{error}</p>}
      <button className="pbtn" disabled={busy || !name.trim()}>
        {busy ? "Saving…" : me ? "Save" : "Start texting"}
      </button>
    </form>
  );
}
