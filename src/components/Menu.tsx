import { fmtMoney, fmtTime } from "../game/format";
import { MISSIONS } from "../game/missions";
import { STATION } from "../game/network";
import type { Progress } from "../game/progress";
import type { Mission } from "../game/types";
import { AREA } from "../life/data";
import { dayName, isoDay, jobTitle } from "../life/engine";
import { loadDailyRecords, useLife } from "../life/store";

interface Props {
  progress: Progress;
  onPlay: (m: Mission) => void;
  onReset: () => void;
  onLife: () => void;
  onDaily: () => void;
}

export function isUnlocked(progress: Progress, index: number): boolean {
  return index === 0 || (progress[MISSIONS[index - 1].id]?.stars ?? 0) > 0;
}

export default function Menu({ progress, onPlay, onReset, onLife, onDaily }: Props) {
  const { life } = useLife();
  const playedToday = loadDailyRecords()[isoDay(Date.now())];
  const totalStars = MISSIONS.reduce((s, m) => s + (progress[m.id]?.stars ?? 0), 0);

  return (
    <div className="screen menu">
      <section className="hero">
        <div className="platform-edge" aria-hidden>
          <span>MIND THE GAP</span>
        </div>
        <h1>Tube Life</h1>
        <p className="lede">
          Your London life, one commute at a time. Rent a room, land a job, make friends and master the network: Tube, buses,
          bikes and boats. Beat the clock, the budget and today's real disruptions.
        </p>
        {!life && totalStars === 0 && (
        <ol className="how">
          <li>
            <strong>Plan</strong>: chain together lines, buses, walks and hire bikes. Every hop shows the time and money it adds.
          </li>
          <li>
            <strong>Ride</strong>: watch the journey unfold, or speed it up to 2×, 4× or skip ahead. Delays and surprises will
            make you decide.
          </li>
          <li>
            <strong>Score</strong>: ★ on time, ★ under budget, ★ low stress. Learn the fare tricks real Londoners use.
          </li>
        </ol>
        )}
      </section>

      <section className="modes">
        <button className="mode-card life-card" onClick={onLife}>
          <span className="mode-emoji">🏙️</span>
          <span className="mode-main">
            <strong>Your Tube Life</strong>
            {life ? (
              <span className="small">
                {life.avatar} {life.name} · {jobTitle(life)} · {AREA[life.home].name} · Day {life.day} ({dayName(life.day)}) · £{life.money.toFixed(0)}
                {life.meta.streak > 1 && ` · 🔥 ${life.meta.streak}-day streak`}
              </span>
            ) : (
              <span className="small">Rent a room, get a job, make friends, climb the ladder. Every trip is a real commute.</span>
            )}
          </span>
          <span className="mode-go">{life ? "Continue ▶" : "Start ▶"}</span>
        </button>
        <button className="mode-card daily-card" onClick={onDaily}>
          <span className="mode-emoji">📅</span>
          <span className="mode-main">
            <strong>Today in London</strong>
            <span className="small">
              {playedToday ? `Played today: ${"★".repeat(playedToday.stars) || "late"} · ${playedToday.points.toLocaleString()} pts. New one tomorrow!` : "A new commute every day, built from live TfL. One shot at the leaderboard."}
            </span>
          </span>
          <span className="mode-go">{playedToday ? "Leaderboard" : "Play ▶"}</span>
        </button>
      </section>

      <section>
        <div className="row between">
          <h2>Commute Challenges</h2>
          <span className="muted">
            ★ {totalStars} / {MISSIONS.length * 3}
          </span>
        </div>
        <div className="missions">
          {MISSIONS.map((m, i) => {
            const unlocked = isUnlocked(progress, i);
            const rec = progress[m.id];
            return (
              <button key={m.id} className={`mission ${unlocked ? "" : "locked"}`} disabled={!unlocked} onClick={() => onPlay(m)}>
                <span className="mission-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="mission-title">{m.title}</span>
                <span className="mission-route">
                  {STATION[m.from].name} → {STATION[m.to].name}
                </span>
                <span className="mission-meta">
                  {fmtTime(m.start)}–{fmtTime(m.deadline)} · {fmtMoney(m.budget)}
                  {m.weather === "rain" && " · 🌧"}
                  {m.closedLines.length > 0 && " · ⛔"}
                </span>
                <span className="mission-stars">
                  {unlocked ? (
                    [0, 1, 2].map((s) => (
                      <span key={s} className={s < (rec?.stars ?? 0) ? "star on" : "star"}>
                        ★
                      </span>
                    ))
                  ) : (
                    <span className="muted">🔒 Earn a star on the previous mission</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {totalStars > 0 && (
          <button className="ghost small reset" onClick={onReset}>
            Reset progress
          </button>
        )}
      </section>

      <footer className="footer muted small">
        A fan-made game. Fares, times and routes are simplified and inspired by London. They are not live data.
      </footer>
    </div>
  );
}
