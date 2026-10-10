import { fmtMoney, fmtTime } from "../game/format";
import { MISSIONS } from "../game/missions";
import { STATION } from "../game/network";
import type { Progress } from "../game/progress";
import type { Mission } from "../game/types";

interface Props {
  progress: Progress;
  onPlay: (m: Mission) => void;
  onReset: () => void;
}

export function isUnlocked(progress: Progress, index: number): boolean {
  return index === 0 || (progress[MISSIONS[index - 1].id]?.stars ?? 0) > 0;
}

export default function Menu({ progress, onPlay, onReset }: Props) {
  const totalStars = MISSIONS.reduce((s, m) => s + (progress[m.id]?.stars ?? 0), 0);

  return (
    <div className="screen menu">
      <section className="hero">
        <div className="platform-edge" aria-hidden>
          <span>MIND THE GAP</span>
        </div>
        <h1>Mind the Gap</h1>
        <p className="lede">
          The London commute game. Plan your route across Tube, buses, bikes and boats. Arrive on time, stay on budget and keep
          your cool.
        </p>
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
      </section>

      <section>
        <div className="row between">
          <h2>Missions</h2>
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
