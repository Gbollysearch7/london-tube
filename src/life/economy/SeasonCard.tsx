import { useState } from "react";
import { act, useLife } from "../store";
import { currentTitle, dismissReport, economyOf, seasonStatus, weeklyGoals, type GoalStatus } from "./core";
import { ALL_THREE_BONUS, FARE_MIN_TRIPS, SEASON_WEEKS, type SeasonGoal } from "./goals";
import type { SeasonReport } from "./types";
import "./economy.css";

// Season and weekly goals in the London Life hub: compact by default, tap to see the season.

const pct = (v: number, t: number) => Math.max(0, Math.min(100, (v / t) * 100));

export function GoalBar({ g }: { g: GoalStatus }) {
  const { goal, value, done } = g;
  const shown = goal.under ? `£${value.toFixed(0)} / £${goal.target}` : `${Math.min(value, goal.target)}/${goal.target}`;
  return (
    <div className={`eco-goal ${done ? "done" : ""}`}>
      <div className="eco-goal-row">
        <span>
          {done ? "✅" : goal.emoji} {goal.label}
        </span>
        <span className="muted small">{done ? `+£${goal.reward}` : shown}</span>
      </div>
      <div className={`eco-bar ${goal.under ? "under" : ""}`}>
        <div style={{ width: `${done ? 100 : pct(value, goal.target)}%` }} />
      </div>
      {goal.under && !done && <span className="muted small">Judged on Sunday night. Needs {FARE_MIN_TRIPS}+ trips.</span>}
    </div>
  );
}

export function SeasonBar({ g }: { g: SeasonGoal }) {
  const fmt = (n: number) => (g.money ? `£${Math.round(n).toLocaleString()}` : n.toLocaleString());
  return (
    <div className="eco-goal">
      <div className="eco-goal-row">
        <span>
          {g.emoji} {g.label}
        </span>
        <span className="muted small">
          {fmt(Math.max(0, g.value))} / {fmt(g.target)}
        </span>
      </div>
      <div className="eco-bar season">
        <div style={{ width: `${pct(g.value, g.target)}%` }} />
      </div>
    </div>
  );
}

export function ReportModal({ r, onClose }: { r: SeasonReport; onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal eco-report">
        <span className="eyebrow">Season {r.season} report card</span>
        <div className={`eco-grade g-${r.grade}`}>{r.grade}</div>
        <p>{r.points}/100 points</p>
        <ul className="eco-rows">
          {r.rows.map((row) => (
            <li key={row.id}>
              <span>{row.label}</span>
              <span className="muted small">
                {row.id === "savings" ? `£${Math.max(0, row.value).toLocaleString()} / £${row.target.toLocaleString()}` : `${row.value}/${row.target}`}
              </span>
              <strong>{row.points}</strong>
            </li>
          ))}
        </ul>
        <p>
          {r.reward > 0 ? `+£${r.reward} and a new title: ` : "New title: "}
          <strong className="eco-title">{r.title}</strong>
        </p>
        <p className="small">Next season's goals are harder.</p>
        <button className="primary big" onClick={onClose}>
          Start Season {r.season + 1}
        </button>
      </div>
    </div>
  );
}

export default function SeasonCard() {
  const { life } = useLife();
  const [open, setOpen] = useState(false);
  if (!life) return null;
  const season = seasonStatus(life);
  const goals = weeklyGoals(life);
  const report = economyOf(life).report;
  const title = currentTitle(life);
  const doneCount = goals.filter((g) => g.done).length;
  return (
    <div className="card eco-card">
      <button className="card-head eco-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h3>
          🏆 Season {season.season} · Week {season.week}/{SEASON_WEEKS}
        </h3>
        <span className="muted small">
          {doneCount}/3 this week {open ? "▴" : "▾"}
        </span>
      </button>
      {title && <span className="chip eco-chip">🎖️ {title}</span>}
      <div className="eco-weeks" aria-hidden>
        {Array.from({ length: SEASON_WEEKS }, (_, i) => (
          <span key={i} className={i + 1 < season.week ? "past" : i + 1 === season.week ? "now" : ""} />
        ))}
      </div>
      {goals.map((g) => (
        <GoalBar key={g.goal.id} g={g} />
      ))}
      {!season.bonus && <p className="muted small">All three: +£{ALL_THREE_BONUS.reward} bonus.</p>}
      {open && (
        <div className="eco-season">
          <h4>Season goals</h4>
          {season.goals.map((g) => (
            <SeasonBar key={g.id} g={g} />
          ))}
          <p className="muted small">Graded A–F when week {SEASON_WEEKS} ends. Every goal is worth 20 points.</p>
        </div>
      )}
      {report && <ReportModal r={report} onClose={() => act(dismissReport)} />}
    </div>
  );
}
