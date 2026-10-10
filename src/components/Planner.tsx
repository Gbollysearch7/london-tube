import { useMemo, useState } from "react";
import MapView from "./MapView";
import ModeBadge from "./ModeBadge";
import Brief from "./Brief";
import { continues, estimate, routeEndsAt } from "../game/engine";
import { fmtDelta, fmtMoney, fmtTime } from "../game/format";
import { LINE, STATION } from "../game/network";
import { availableLinks, solve } from "../game/solver";
import { CALM_THRESHOLD } from "../game/scoring";
import type { Link, Mission, Mode } from "../game/types";

interface Props {
  mission: Mission;
  initialRoute?: Link[];
  onStart: (route: Link[]) => void;
  onBack: () => void;
}

const MODE_ORDER: Mode[] = ["tube", "elizabeth", "overground", "dlr", "rail", "boat", "bus", "bike", "walk"];

/** Groups consecutive hops on the same line into one ride for display. */
export function groupRoute(route: Link[]): { line: string; from: string; to: string; hops: number }[] {
  const out: { line: string; from: string; to: string; hops: number }[] = [];
  route.forEach((l, i) => {
    const last = out[out.length - 1];
    if (last && continues(route[i - 1], l)) {
      last.to = l.to;
      last.hops++;
    } else out.push({ line: l.line, from: l.from, to: l.to, hops: 1 });
  });
  return out;
}

export default function Planner({ mission, initialRoute = [], onStart, onBack }: Props) {
  const [route, setRoute] = useState<Link[]>(initialRoute);
  const [filter, setFilter] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showBuses, setShowBuses] = useState(true);

  const at = routeEndsAt(mission, route);
  const arrived = at === mission.to;
  const visited = useMemo(() => new Set([mission.from, ...route.map((l) => l.to)]), [mission.from, route]);
  const est = useMemo(() => estimate(mission, route), [mission, route]);
  const hint = useMemo(() => (showHint ? solve(mission) : null), [showHint, mission]);

  const options = useMemo(() => {
    if (arrived) return [];
    return availableLinks(mission, at, visited)
      .map((link) => {
        const next = estimate(mission, [...route, link]);
        return { link, arrival: next.arrival, dTime: next.arrival - est.arrival, dCost: next.cost - est.cost };
      })
      .sort((a, b) => MODE_ORDER.indexOf(a.link.mode) - MODE_ORDER.indexOf(b.link.mode) || a.dTime - b.dTime);
  }, [arrived, mission, at, visited, route, est]);

  const targets = useMemo(() => new Set(options.map((o) => o.link.to)), [options]);
  const shown = filter ? options.filter((o) => o.link.to === filter) : options;

  const add = (link: Link) => {
    setRoute((r) => [...r, link]);
    setFilter(null);
  };
  const undo = () => {
    setRoute((r) => r.slice(0, -1));
    setFilter(null);
  };

  const late = est.arrival > mission.deadline;
  const over = est.cost > mission.budget;
  const stressed = est.stress > CALM_THRESHOLD;

  return (
    <div className="screen planner">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          ← Missions
        </button>
        <h2>{mission.title}</h2>
        <span />
      </header>

      <div className="layout">
        <section className="map-wrap">
          <MapView
            mission={mission}
            route={route}
            current={at}
            targets={targets}
            selected={filter}
            showBuses={showBuses}
            onStationClick={(id) => targets.has(id) && setFilter((f) => (f === id ? null : id))}
          />
          <div className="map-legend">
            <label>
              <input type="checkbox" checked={showBuses} onChange={(e) => setShowBuses(e.target.checked)} /> Show bus routes
            </label>
            <span className="muted">Tap a pulsing station to filter your options</span>
          </div>
        </section>

        <aside className="panel">
          <Brief mission={mission} />

          <div className="card">
            <div className="card-head">
              <h3>Your route</h3>
              <div className="row gap-s">
                <button className="ghost small" onClick={undo} disabled={!route.length}>
                  Undo
                </button>
                <button className="ghost small" onClick={() => setRoute([])} disabled={!route.length}>
                  Clear
                </button>
              </div>
            </div>
            {route.length === 0 ? (
              <p className="muted">Start at {STATION[mission.from].name}. Pick your first move below.</p>
            ) : (
              <ol className="legs">
                {groupRoute(route).map((g, i) => (
                  <li key={i}>
                    <ModeBadge lineId={g.line} short />
                    <span>
                      <strong>{LINE[g.line].name}</strong> {STATION[g.from].name} → {STATION[g.to].name}
                      {g.hops > 1 && <span className="muted"> · {g.hops} stops</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <div className="stats">
              <Stat label="Arrive" value={fmtTime(est.arrival)} sub={`due ${fmtTime(mission.deadline)}`} bad={late} />
              <Stat label="Cost" value={fmtMoney(est.cost)} sub={`budget ${fmtMoney(mission.budget)}`} bad={over} />
              <Stat label="Stress" value={`${est.stress}`} sub={`calm ≤ ${CALM_THRESHOLD}`} bad={stressed} />
            </div>
            <p className="fineprint">Estimates only. Delays, crowds and surprises happen on the day.</p>
          </div>

          {arrived ? (
            <div className="card ready">
              <h3>🎯 You've planned a route to {STATION[mission.to].name}</h3>
              <button className="primary big" onClick={() => onStart(route)}>
                Start journey ▶
              </button>
            </div>
          ) : (
            <div className="card">
              <div className="card-head">
                <h3>
                  From {STATION[at].name}
                  {filter && <span className="muted"> to {STATION[filter].name}</span>}
                </h3>
                {filter && (
                  <button className="ghost small" onClick={() => setFilter(null)}>
                    Show all
                  </button>
                )}
              </div>
              {shown.length === 0 && <p className="muted">Dead end. Undo a step and try another way.</p>}
              <ul className="options">
                {shown.map(({ link, arrival, dTime, dCost }) => (
                  <li key={link.id}>
                    <button className="option" onClick={() => add(link)}>
                      <ModeBadge lineId={link.line} short />
                      <span className="option-main">
                        <span className="option-title">
                          {link.mode === "walk" ? "Walk" : link.mode === "bike" ? "Hire bike" : LINE[link.line].name} →{" "}
                          {STATION[link.to].name}
                          {link.to === mission.to && " 🎯"}
                        </span>
                        <span className="option-sub">
                          {fmtDelta(dTime, "min")} · {Math.abs(dCost) < 0.005 ? "no extra cost" : fmtDelta(dCost, "£")} · arr{" "}
                          {fmtTime(arrival)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card hint">
            {!showHint ? (
              <button className="ghost" onClick={() => setShowHint(true)}>
                💡 Ask a local what's possible
              </button>
            ) : (
              hint && (
                <p>
                  A local reckons you could arrive by <strong>{hint.fastest ? fmtTime(hint.fastest.est.arrival) : "?"}</strong>
                  {hint.cheapestOnTime && (
                    <>
                      , or make it on time for as little as <strong>{fmtMoney(hint.cheapestOnTime.est.cost)}</strong>
                    </>
                  )}
                  . How you get there is up to you.
                </p>
              )
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, bad }: { label: string; value: string; sub: string; bad: boolean }) {
  return (
    <div className={`stat ${bad ? "bad" : "good"}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-sub">{sub}</span>
    </div>
  );
}
