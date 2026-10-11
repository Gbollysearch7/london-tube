import type { ReactElement } from "react";
import type { AppId } from "./nav";

// iOS-style app icons: a white (or coloured) glyph on a tile. The tile background is set by the
// caller via `ICON_BG`; Calendar and Clock render live, like the real thing.

const W = "#fff";
const stroke = { fill: "none", stroke: W, strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Svg({ children, size = 34 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      {children}
    </svg>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function CalendarIcon({ now }: { now: Date }) {
  return (
    <span className="ico-cal">
      <span className="ico-cal-day">{DAYS[now.getDay()]}</span>
      <span className="ico-cal-num">{now.getDate()}</span>
    </span>
  );
}

function ClockIcon({ now }: { now: Date }) {
  const m = now.getMinutes();
  const h = (now.getHours() % 12) + m / 60;
  const ticks = Array.from({ length: 12 }, (_, i) => i);
  return (
    <svg viewBox="0 0 60 60" width="100%" height="100%" aria-hidden>
      <circle cx="30" cy="30" r="25" fill="#fff" />
      {ticks.map((i) => {
        const a = (i / 12) * Math.PI * 2;
        return <line key={i} x1={30 + Math.sin(a) * 21} y1={30 - Math.cos(a) * 21} x2={30 + Math.sin(a) * 23.5} y2={30 - Math.cos(a) * 23.5} stroke="#111" strokeWidth="1.4" />;
      })}
      <line x1="30" y1="30" x2={30 + Math.sin((h / 12) * Math.PI * 2) * 12} y2={30 - Math.cos((h / 12) * Math.PI * 2) * 12} stroke="#111" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="30" y1="30" x2={30 + Math.sin((m / 60) * Math.PI * 2) * 18} y2={30 - Math.cos((m / 60) * Math.PI * 2) * 18} stroke="#111" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="30" cy="30" r="2" fill="#ff9f0a" />
    </svg>
  );
}

/** Tile backgrounds, matching the feel of the real iOS apps where there's an equivalent. */
export const ICON_BG: Partial<Record<AppId, string>> = {
  messages: "linear-gradient(180deg,#67ff82,#0bc33a)",
  contacts: "linear-gradient(180deg,#a8abb4,#6d717c)",
  go: "linear-gradient(180deg,#5fe0a0,#1a9e62)",
  status: "#ffffff",
  arrivals: "linear-gradient(180deg,#2b2b2e,#0c0c0d)",
  wallet: "#000000",
  clock: "#000000",
  weather: "linear-gradient(180deg,#4fb0ff,#1360e2)",
  fares: "#1c1c1e",
  feed: "linear-gradient(180deg,#ff5b6b,#e1213c)",
  league: "linear-gradient(180deg,#ffd75e,#f2a20c)",
  postcards: "#ffffff",
  tunes: "linear-gradient(180deg,#ff6584,#f5254a)",
  tips: "linear-gradient(180deg,#fff 0%,#fff 72%,#ffd60a 72%)",
  invite: "linear-gradient(180deg,#5ac8fa,#0a84ff)",
  help: "linear-gradient(180deg,#ffe066,#ffb800)",
  settings: "linear-gradient(180deg,#a2a5ad,#5e626c)",
  today: "#ffffff",
  goals: "linear-gradient(180deg,#ff9f45,#ff5e1a)",
  shop: "linear-gradient(180deg,#ff6fb5,#d6206f)",
  bank: "linear-gradient(180deg,#a98bff,#6a3fe0)",
  jobs: "linear-gradient(180deg,#59d6a4,#138a5c)",
  homes: "linear-gradient(180deg,#ffb067,#e8670f)",
  badges: "linear-gradient(180deg,#5b6cff,#2c35c9)",
};

export function AppIcon({ id, now }: { id: AppId; now: Date }): ReactElement {
  switch (id) {
    case "today":
      return <CalendarIcon now={now} />;
    case "clock":
      return <ClockIcon now={now} />;
    case "messages":
      return (
        <Svg size={36}>
          <path fill={W} d="M12 3.5c-5.2 0-9.4 3.4-9.4 7.7 0 2.4 1.3 4.5 3.3 5.9-.2 1.4-.9 2.7-1.9 3.6 2.1-.1 3.9-.8 5.3-2 .9.2 1.8.3 2.7.3 5.2 0 9.4-3.4 9.4-7.8S17.2 3.5 12 3.5z" />
        </Svg>
      );
    case "contacts":
      return (
        <Svg size={38}>
          <circle cx="12" cy="9" r="3.6" fill={W} />
          <path fill={W} d="M5 19.3c.8-3.4 3.6-5.5 7-5.5s6.2 2.1 7 5.5c-1.9 1.4-4.3 2.1-7 2.1s-5.1-.7-7-2.1z" />
        </Svg>
      );
    case "go":
      return (
        <Svg size={34}>
          <path fill={W} d="M12 2.8a6.6 6.6 0 0 0-6.6 6.6c0 4.8 6.6 11.8 6.6 11.8s6.6-7 6.6-11.8A6.6 6.6 0 0 0 12 2.8z" />
          <circle cx="12" cy="9.4" r="2.5" fill="#1a9e62" />
        </Svg>
      );
    case "status":
      // The roundel.
      return (
        <Svg size={40}>
          <circle cx="12" cy="12" r="7" fill="none" stroke="#dc241f" strokeWidth="3.2" />
          <rect x="2.2" y="10" width="19.6" height="4" rx="0.4" fill="#0019a8" />
        </Svg>
      );
    case "arrivals":
      return (
        <span className="ico-board">
          <span>1 Brixton</span>
          <span>2 min</span>
        </span>
      );
    case "wallet":
      return (
        <span className="ico-wallet">
          <i style={{ background: "#00a9e0" }} />
          <i style={{ background: "#ffd60a" }} />
          <i style={{ background: "#30d158" }} />
          <i style={{ background: "#ff453a" }} />
        </span>
      );
    case "weather":
      return (
        <Svg size={38}>
          <circle cx="9" cy="9" r="3.6" fill="#ffd60a" />
          <path fill={W} d="M8.5 19.5h9.2a3.5 3.5 0 0 0 .3-7 4.6 4.6 0 0 0-8.8.9 3.1 3.1 0 0 0-.7 6.1z" />
        </Svg>
      );
    case "fares":
      return (
        <span className="ico-calc">
          {["#a5a5a5", "#a5a5a5", "#ff9f0a", "#333", "#333", "#ff9f0a", "#333", "#333", "#ff9f0a"].map((c, i) => (
            <i key={i} style={{ background: c }} />
          ))}
        </span>
      );
    case "feed":
      return (
        <Svg size={34}>
          <rect x="4" y="4.5" width="16" height="15" rx="2.2" fill={W} />
          <rect x="6.5" y="7" width="11" height="2.4" rx="0.6" fill="#e1213c" />
          <rect x="6.5" y="11" width="5" height="5.8" rx="0.6" fill="#e1213c" opacity="0.55" />
          <path d="M13.5 11.5h4M13.5 14h4M13.5 16.5h3" stroke="#e1213c" strokeWidth="1.2" strokeLinecap="round" />
        </Svg>
      );
    case "league":
      return (
        <Svg size={34}>
          <path fill={W} d="M7 3.5h10v4.3a5 5 0 0 1-10 0z" />
          <path {...stroke} d="M7 5.5H4.5a3 3 0 0 0 3.2 4M17 5.5h2.5a3 3 0 0 1-3.2 4" />
          <path fill={W} d="M10.6 12.6h2.8v3.3h-2.8zM8 16.5h8l.6 3.5H7.4z" />
        </Svg>
      );
    case "postcards":
      return (
        <Svg size={40}>
          {["#ff9f0a", "#ffd60a", "#30d158", "#64d2ff", "#0a84ff", "#bf5af2", "#ff375f", "#ff453a"].map((c, i) => (
            <ellipse key={c} cx="12" cy="7.2" rx="2.4" ry="4.4" fill={c} opacity="0.88" transform={`rotate(${i * 45} 12 12)`} />
          ))}
        </Svg>
      );
    case "tunes":
      return (
        <Svg size={34}>
          <path fill={W} d="M9 17.2V6.6l10-2.1v10.4" />
          <path {...stroke} strokeWidth={1.6} d="M9 17.2V6.6l10-2.1v10.4" />
          <ellipse cx="7" cy="17.6" rx="2.6" ry="2.1" fill={W} />
          <ellipse cx="17" cy="15.3" rx="2.6" ry="2.1" fill={W} />
        </Svg>
      );
    case "tips":
      return (
        <Svg size={38}>
          <path d="M5 8h14M5 11.5h14M5 15h9" stroke="#c7c7cc" strokeWidth="1.1" strokeLinecap="round" />
        </Svg>
      );
    case "invite":
      return (
        <Svg size={34}>
          <path {...stroke} strokeWidth={2.2} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </Svg>
      );
    case "help":
      return (
        <Svg size={34}>
          <path fill={W} d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
          <rect x="9.5" y="18.2" width="5" height="1.6" rx="0.8" fill={W} />
          <rect x="10.3" y="20.6" width="3.4" height="1.4" rx="0.7" fill={W} />
        </Svg>
      );
    case "settings":
      return (
        <Svg size={40}>
          <g fill={W}>
            {Array.from({ length: 8 }, (_, i) => (
              <rect key={i} x="10.6" y="2.6" width="2.8" height="4.4" rx="1" transform={`rotate(${i * 45} 12 12)`} />
            ))}
            <circle cx="12" cy="12" r="6.8" />
          </g>
          <circle cx="12" cy="12" r="3" fill="#6d717c" />
        </Svg>
      );
    case "goals":
      return (
        <Svg size={38}>
          <circle cx="12" cy="12" r="8" {...stroke} strokeWidth={2} />
          <circle cx="12" cy="12" r="4.6" {...stroke} strokeWidth={2} />
          <circle cx="12" cy="12" r="1.6" fill={W} />
        </Svg>
      );
    case "shop":
      return (
        <Svg size={34}>
          <path fill={W} d="M5.5 8h13l-.9 11.2a1.6 1.6 0 0 1-1.6 1.5H8a1.6 1.6 0 0 1-1.6-1.5z" />
          <path {...stroke} d="M9 10V7a3 3 0 0 1 6 0v3" />
        </Svg>
      );
    case "bank":
      return (
        <Svg size={36}>
          <path fill={W} d="M12 3.2 3.5 7.6v1.6h17V7.6z" />
          <path d="M6 10.5v6.5M10 10.5v6.5M14 10.5v6.5M18 10.5v6.5" stroke={W} strokeWidth="2" strokeLinecap="round" />
          <rect x="3.5" y="18.3" width="17" height="2.2" rx="0.6" fill={W} />
        </Svg>
      );
    case "jobs":
      return (
        <Svg size={34}>
          <rect x="3.5" y="7.5" width="17" height="11.5" rx="2.2" fill={W} />
          <path {...stroke} strokeWidth={1.8} d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5" />
          <path d="M3.5 12.5h17" stroke="#138a5c" strokeWidth="1.2" />
        </Svg>
      );
    case "homes":
      return (
        <Svg size={36}>
          <path fill={W} d="M12 3.6 3 11.2h2.3v8.3h4.9v-5.2h3.6v5.2h4.9v-8.3H21z" />
        </Svg>
      );
    case "badges":
      return (
        <Svg size={36}>
          <path fill="#ffd60a" d="M8 2.8h3.2l1.5 5.4-3.1.9zM16 2.8h-3.2l-1.5 5.4 3.1.9z" opacity="0.9" />
          <circle cx="12" cy="14.2" r="6.2" fill="#ffd60a" />
          <path fill="#c98a00" d="m12 10.6 1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.3 1.2.5-2.5-1.8-1.7 2.5-.3z" />
        </Svg>
      );
    default:
      return <span style={{ fontSize: 28 }}>📱</span>;
  }
}
