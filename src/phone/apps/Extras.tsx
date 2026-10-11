import { useState, useSyncExternalStore } from "react";
import { MISSIONS } from "../../game/missions";
import { STATION } from "../../game/network";
import { useGameView } from "../gameBridge";
import { VENUES } from "../../life/data";
import { useLife } from "../../life/store";
import { AppHeader } from "../ui";

const POSTCARD_ART: Record<string, string> = {
  "first-day": "🏢",
  brunch: "🥂",
  strike: "🪧",
  interview: "🏦",
  "date-night": "🌉",
  "rainy-monday": "☔",
  river: "⛴️",
  skint: "🪙",
  "match-day": "⚽",
  gauntlet: "🏁",
};

export function PostcardsApp() {
  const { progress } = useGameView();
  const { life } = useLife();
  const visited = new Set(life?.visited ?? []);
  const [open, setOpen] = useState<string | null>(null);
  const earned = MISSIONS.filter((m) => (progress[m.id]?.stars ?? 0) > 0);
  const card = open ? MISSIONS.find((m) => m.id === open) : null;

  return (
    <div className="app">
      <AppHeader
        title="📸 Postcards"
        right={
          <span className="muted small">
            {earned.length + visited.size}/{MISSIONS.length + VENUES.length}
          </span>
        }
      />
      <div className="app-body">
        {card ? (
          <button className="postcard big" onClick={() => setOpen(null)}>
            <span className="postcard-art">{POSTCARD_ART[card.id] ?? "📮"}</span>
            <strong>{card.title}</strong>
            <span className="small">
              {STATION[card.from].name} → {STATION[card.to].name}
            </span>
            <span className="stars-s">{"★".repeat(progress[card.id]?.stars ?? 0)}</span>
            <span className="muted small">Best {progress[card.id]?.best.toLocaleString()} pts · tap to close</span>
          </button>
        ) : (
          <>
          <h4>Places in your life</h4>
          <div className="postcards">
            {VENUES.map((v) => (
              <div key={v.id} className={`postcard ${visited.has(v.id) ? "" : "locked"}`}>
                <span className="postcard-art">{visited.has(v.id) ? v.emoji : "🔒"}</span>
                <span className="small">{visited.has(v.id) ? v.name : "Visit to unlock"}</span>
              </div>
            ))}
          </div>
          <h4>Commute Challenges</h4>
          <div className="postcards">
            {MISSIONS.map((m) => {
              const got = (progress[m.id]?.stars ?? 0) > 0;
              return (
                <button key={m.id} className={`postcard ${got ? "" : "locked"}`} disabled={!got} onClick={() => setOpen(m.id)}>
                  <span className="postcard-art">{got ? POSTCARD_ART[m.id] ?? "📮" : "🔒"}</span>
                  <span className="small">{got ? m.title : "Finish to unlock"}</span>
                </button>
              );
            })}
          </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- Tunes: a tiny generative player using Web Audio, so there are no audio files to ship ---

interface Track {
  title: string;
  artist: string;
  emoji: string;
  bpm: number;
  notes: number[]; // semitones from A3
  wave: OscillatorType;
}

const TRACKS: Track[] = [
  { title: "Mind the Gap", artist: "The Platform Edge", emoji: "🚇", bpm: 104, notes: [0, 7, 12, 7, 3, 7, 10, 7], wave: "triangle" },
  { title: "Night Bus Home", artist: "N29", emoji: "🌙", bpm: 76, notes: [0, 3, 7, 10, 7, 3, 5, 3], wave: "sine" },
  { title: "Thames Drift", artist: "River Bus Collective", emoji: "⛴️", bpm: 84, notes: [0, 4, 7, 11, 12, 11, 7, 4], wave: "sine" },
  { title: "Rush Hour", artist: "Peak Fares", emoji: "⏱️", bpm: 132, notes: [0, 0, 12, 0, 10, 0, 7, 5], wave: "square" },
  { title: "Zone 2 Sunday", artist: "Off-Peak", emoji: "☕", bpm: 92, notes: [0, 4, 9, 4, 7, 4, 2, 4], wave: "triangle" },
];

const player = {
  playing: -1,
  ctx: null as AudioContext | null,
  timer: 0,
  step: 0,
  listeners: new Set<() => void>(),
};
let playerSnapshot = -1;

function emitPlayer() {
  playerSnapshot = player.playing;
  player.listeners.forEach((l) => l());
}

function stop() {
  window.clearInterval(player.timer);
  player.playing = -1;
  emitPlayer();
}

function play(i: number) {
  stop();
  try {
    player.ctx ??= new AudioContext();
    void player.ctx.resume();
  } catch {
    return; // No audio support; the button just does nothing.
  }
  const ctx = player.ctx;
  const t = TRACKS[i];
  const beat = 60 / t.bpm / 2;
  player.step = 0;
  player.playing = i;
  emitPlayer();
  player.timer = window.setInterval(() => {
    const semis = t.notes[player.step++ % t.notes.length];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = t.wave;
    osc.frequency.value = 220 * 2 ** (semis / 12);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(t.wave === "square" ? 0.03 : 0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + beat * 1.8);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + beat * 2);
  }, beat * 1000);
}

function usePlaying(): number {
  return useSyncExternalStore(
    (cb) => {
      player.listeners.add(cb);
      return () => player.listeners.delete(cb);
    },
    () => playerSnapshot,
  );
}

export function TunesApp() {
  const playing = usePlaying();
  const now = playing >= 0 ? TRACKS[playing] : null;
  return (
    <div className="app">
      <AppHeader title="🎧 Tunes" />
      <div className="app-body">
        <div className={`now-playing ${now ? "on" : ""}`}>
          <span className="np-art">{now?.emoji ?? "🎧"}</span>
          <strong>{now?.title ?? "Nothing playing"}</strong>
          <span className="muted small">{now?.artist ?? "Pick a track for the commute"}</span>
          {now && (
            <button className="pbtn" onClick={stop}>
              ⏸ Pause
            </button>
          )}
        </div>
        <ul className="plist">
          {TRACKS.map((t, i) => (
            <li key={t.title}>
              <button className={`prow ${playing === i ? "picked" : ""}`} onClick={() => (playing === i ? stop() : play(i))}>
                <span className="avatar group">{t.emoji}</span>
                <span className="prow-main">
                  <span className="prow-title">{t.title}</span>
                  <span className="prow-sub">{t.artist}</span>
                </span>
                <span>{playing === i ? "⏸" : "▶"}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">Music keeps playing when you close the phone.</p>
      </div>
    </div>
  );
}

const GENERAL_TIPS = [
  "Changing lines inside the barriers counts as one journey. Walking out and back in costs a new fare.",
  "The bus Hopper makes every bus within an hour of your first tap free.",
  "Weekends and evenings after 19:00 are off-peak.",
  "A seat on the train lowers stress. Standing by the doors saves a minute.",
  "Hire bikes charge per started 30 minutes. A slow dock can cost a second block.",
];

export function TipsApp() {
  const { progress } = useGameView();
  const learned = MISSIONS.filter((m) => (progress[m.id]?.stars ?? 0) > 0);
  return (
    <div className="app">
      <AppHeader title="📝 Tips" />
      <div className="app-body">
        <h4>Londoner basics</h4>
        <ul className="notes">
          {GENERAL_TIPS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <h4>Learned on the job</h4>
        <ul className="notes">
          {learned.map((m) => (
            <li key={m.id}>
              <strong>{m.title}:</strong> {m.tip}
            </li>
          ))}
          {learned.length === 0 && <li className="muted">Finish missions to collect local tips here.</li>}
        </ul>
      </div>
    </div>
  );
}

export function InviteApp() {
  const link = location.origin + location.pathname;
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const text = "Play Tube Life with me: live your London life one commute at a time, and text me on the in-game phone.";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Tube Life", text, url: link });
        return;
      } catch {
        // Cancelled; fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="app">
      <AppHeader title="🔗 Invite" />
      <div className="app-body center-col">
        <span className="weather-big">🚇</span>
        <p>Bring your friends. Everyone who plays shows up in Contacts and can text you.</p>
        <code className="invite-link">{link}</code>
        <button className="pbtn" onClick={() => void share()}>
          {copied ? "✓ Link copied" : "Share link"}
        </button>
      </div>
    </div>
  );
}

export function HelpApp() {
  return (
    <div className="app">
      <AppHeader title="💡 Help" />
      <div className="app-body">
        <ul className="notes">
          <li>
            Press <kbd>P</kbd> or the 📱 button to open your phone at any time, even mid-journey. The ride keeps going.
          </li>
          <li>
            <strong>Messages:</strong> everyone shares the <em>London Commuters</em> chat. Start a 1:1 chat from Contacts, or make a group.
          </li>
          <li>
            <strong>Contacts:</strong> see who is online and what they're doing right now. Tap a player to text or block them.
          </li>
          <li>
            <strong>Go, Oyster, Clock:</strong> your live journey, fares and the deadline.
          </li>
          <li>
            <strong>Line Status and Arrivals:</strong> real-time London from TfL, the actual lines and next trains right now. Missions
            still run on the game's own timetable.
          </li>
          <li>
            <strong>The Commute and League:</strong> what other players just did, and who has the most stars.
          </li>
          <li>Be kind. Blocked players can't text you, and you won't see their messages.</li>
        </ul>
      </div>
    </div>
  );
}
