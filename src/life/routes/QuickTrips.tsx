import { useMemo } from "react";
import type { Link, Mission } from "../../game/types";
import { fmtClock } from "../engine";
import { useLife } from "../store";
import { quickTrips } from "./routes";
import "./QuickTrips.css";

/** Hub card: one tap to ride your usual routes, or straight to the planner when they're disrupted. */
export default function QuickTrips({ onRide, onPlan }: { onRide: (mission: Mission, route: Link[]) => void; onPlan: (mission: Mission) => void }) {
  const { life } = useLife();
  // Every action produces a new state, so this recomputes after each move; the solver itself is cached.
  const trips = useMemo(() => (life ? quickTrips(life) : []), [life]);
  if (!trips.length) return null;

  return (
    <div className="card quick-trips">
      <div className="card-head">
        <h3>Quick trips</h3>
        <span className="muted small">One tap, no planning</span>
      </div>
      <div className="qt-list">
        {trips.map((t) => (
          <div key={t.to} className={`qt-row${t.warning ? " hit" : ""}`}>
            <span className="qt-emoji" aria-hidden>
              {t.emoji}
            </span>
            <div className="qt-main">
              <span className="qt-title">
                {t.label}
                {t.source === "suggested" && <span className="chip">Suggested</span>}
              </span>
              {t.warning ? (
                <span className="qt-warn">⚠️ {t.warning}</span>
              ) : (
                <span className="qt-detail">
                  arr {fmtClock(t.arrival!)} · £{t.cost!.toFixed(2)}
                  {t.note && <span className="qt-warn"> · ⌛ {t.note}</span>}
                </span>
              )}
              {t.better && !t.warning && (
                <button className="qt-better" onClick={() => onRide(t.mission, t.better!.links)}>
                  💡 Better today: {t.better.why} (arr {fmtClock(t.better.arrival)} · £{t.better.cost.toFixed(2)}) · Go
                </button>
              )}
            </div>
            {t.warning ? (
              <button className="ghost small" onClick={() => onPlan(t.mission)}>
                Plan
              </button>
            ) : (
              <button className="primary small" onClick={() => onRide(t.mission, t.links)}>
                Go
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
