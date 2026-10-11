import { useState } from "react";
import { estimate } from "../../game/engine";
import { BIKE_FARE, BOAT_FARE, BUS_FARE, HOPPER_MINUTES, isPeak, railFare } from "../../game/fares";
import { fmtMoney, fmtTime } from "../../game/format";
import { LINE, LINES, STATION, isRail } from "../../game/network";
import { groupRoute } from "../../components/Planner";
import { MODE_ICON } from "../../components/ModeBadge";
import { useGameView, useTicker } from "../gameBridge";
import { AppHeader } from "../ui";

function NoMission({ what }: { what: string }) {
  return <p className="muted center pad">Pick a mission from the menu to see {what}.</p>;
}

/** Go: your journey, live while you ride. */
export function GoApp() {
  useTicker();
  const g = useGameView();
  const m = g.mission;
  const j = g.journey;
  const route = j?.route ?? g.route;
  const est = m && route.length ? estimate(m, route) : null;
  const groups = groupRoute(route);
  const legsDone = j ? j.legIdx : 0;
  let hops = 0;

  return (
    <div className="app">
      <AppHeader title="🗺️ Go" />
      <div className="app-body">
        {!m ? (
          <NoMission what="your journey" />
        ) : (
          <>
            <div className="pcard go-head">
              <span className="muted small">
                {STATION[m.from].name} → {STATION[m.to].name}
              </span>
              <strong className="go-eta">
                {j ? (j.done ? `Arrived ${fmtTime(j.clock)}` : `Now ${fmtTime(j.clock)}`) : est ? `Arrive ~${fmtTime(est.arrival)}` : "Plan a route"}
              </strong>
              <span className="muted small">
                Due {fmtTime(m.deadline)}
                {j && !j.done && ` · ${Math.max(0, Math.floor(m.deadline - j.clock))} min left`}
              </span>
            </div>
            {groups.length === 0 && <p className="muted small">No route yet. Build one in the planner.</p>}
            <ol className="go-legs">
              {groups.map((grp, i) => {
                const first = hops;
                hops += grp.hops;
                const state = !j ? "" : legsDone >= hops ? "done" : legsDone >= first ? "now" : "";
                return (
                  <li key={i} className={state} style={{ ["--lc" as string]: LINE[grp.line].color }}>
                    <span className="go-icon">{MODE_ICON[LINE[grp.line].mode]}</span>
                    <span>
                      <strong>{LINE[grp.line].name}</strong>
                      <span className="muted small">
                        {" "}
                        {STATION[grp.from].name} → {STATION[grp.to].name}
                        {grp.hops > 1 && ` · ${grp.hops} stops`}
                      </span>
                    </span>
                    {state === "now" && <span className="tag live">now</span>}
                    {state === "done" && <span className="muted">✓</span>}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

/** Line Status: closures for the mission, plus live delays from your own ride. */
/** Line status inside the current mission: its closures plus delays from your own ride. */
export function MissionStatus() {
  useTicker(1000);
  const g = useGameView();
  const closed = new Set(g.mission?.closedLines ?? []);
  const delayed = new Set(
    (g.journey?.log ?? []).filter((l) => /signal|terminates|gridlock/i.test(l.text)).map((l) => {
      const leg = g.journey!.legs.find((x) => x.start <= l.time && x.arrive >= l.time);
      return leg?.link.line;
    }),
  );
  const lines = LINES.filter((l) => isRail(l.mode) || l.mode === "boat");

  return (
    <>
        <p className="muted small">{g.mission ? `${g.mission.title} · ${g.mission.weekday ? "weekday" : "weekend"}` : "No mission yet: everything runs normally in the game."}</p>
        <ul className="status-list">
          {lines.map((l) => {
            const state = closed.has(l.id) ? "Suspended" : delayed.has(l.id) ? "Minor delays" : "Good service";
            return (
              <li key={l.id}>
                <span className="status-bar" style={{ background: l.color }} />
                <span className="status-name">{l.name}</span>
                <span className={`status-state ${state === "Good service" ? "ok" : state === "Suspended" ? "bad" : "warn"}`}>{state}</span>
              </li>
            );
          })}
        </ul>
        <p className="muted small">Buses: {g.mission?.closedLines.length ? "extra demand on routes near closures" : "good service on all routes"}.</p>
    </>
  );
}

export function WeatherApp() {
  const g = useGameView();
  const m = g.mission;
  const rain = m?.weather === "rain";
  const t = m?.start ?? 9 * 60;
  const hours = [0, 60, 120, 180].map((d) => t + d);
  return (
    <div className={`app weather ${rain ? "rain" : "sun"}`}>
      <AppHeader title="🌦️ Weather" />
      <div className="app-body center-col">
        <span className="weather-big">{rain ? "🌧️" : "⛅"}</span>
        <h3>London</h3>
        <p>{rain ? "Heavy rain · 11°C" : "Dry, bright spells · 17°C"}</p>
        <div className="forecast">
          {hours.map((h, i) => (
            <div key={h}>
              <span className="muted small">{fmtTime(h)}</span>
              <span>{rain ? (i < 3 ? "🌧️" : "🌦️") : i === 2 ? "☀️" : "⛅"}</span>
            </div>
          ))}
        </div>
        <p className="muted small">
          {rain ? "Walking and cycling are slower and more stressful in the rain. Buses and trains keep you dry." : "Good day to walk or grab a hire bike."}
        </p>
      </div>
    </div>
  );
}

/** Oyster: today's spend, budget left, the bus Hopper timer and every tap. */
export function WalletApp() {
  useTicker(500);
  const g = useGameView();
  const m = g.mission;
  const j = g.journey;
  const spent = j?.meter.total ?? (m && g.route.length ? estimate(m, g.route).cost : 0);
  const hopperLeft = j ? j.meter.hopperRemaining(j.clock) : 0;

  return (
    <div className="app">
      <AppHeader title="💳 Oyster" />
      <div className="app-body">
        <div className="oyster">
          <span className="oyster-brand">OYSTER · pay as you go</span>
          <strong>{fmtMoney(spent)}</strong>
          <span className="small">{j ? "spent on this journey" : m ? "estimated for your plan" : "no journey yet"}</span>
          {m && (
            <span className={`small ${spent > m.budget ? "neg" : ""}`}>
              {spent > m.budget ? `${fmtMoney(spent - m.budget)} over budget` : `${fmtMoney(m.budget - spent)} left of ${fmtMoney(m.budget)}`}
            </span>
          )}
        </div>
        {hopperLeft > 0 && <p className="pcard hopper">🚌 Hopper active: more buses free for {Math.ceil(hopperLeft)} min</p>}
        <h4>Taps</h4>
        <ul className="taps">
          {(j?.meter.charges ?? []).map((c, i) => (
            <li key={i}>
              <span className="muted small">{fmtTime(c.time)}</span>
              <span>{c.label}</span>
              <span>{fmtMoney(c.amount)}</span>
            </li>
          ))}
          {!j?.meter.charges.length && <li className="muted small">No taps yet. Charges appear here as you ride.</li>}
        </ul>
      </div>
    </div>
  );
}

export function ClockApp() {
  useTicker(250);
  const g = useGameView();
  const m = g.mission;
  const game = g.journey?.clock ?? m?.start;
  const now = new Date();
  const left = m && game !== undefined ? m.deadline - game : null;
  return (
    <div className="app">
      <AppHeader title="⏰ Clock" />
      <div className="app-body center-col">
        <span className="muted small">Game time</span>
        <span className="clock-big">{game !== undefined ? fmtTime(game) : "--:--"}</span>
        {m && left !== null && (
          <span className={`clock-left ${left < 0 ? "bad" : left < 8 ? "warn" : ""}`}>
            {left >= 0 ? `${Math.floor(left)} min until ${fmtTime(m.deadline)}` : `${Math.ceil(-left)} min late`}
          </span>
        )}
        {m && <span className="muted small">{isPeak(game ?? m.start, m.weekday) ? "⏱ Peak fares now" : "😌 Off-peak now"}</span>}
        <hr />
        <span className="muted small">Real time</span>
        <span className="clock-mid">
          {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

/** Fare Finder: the game's fare rules, as a calculator. */
export function FaresApp() {
  const [a, setA] = useState(1);
  const [b, setB] = useState(2);
  const [peak, setPeak] = useState(true);
  const fare = railFare([a, b], peak);
  return (
    <div className="app">
      <AppHeader title="🧮 Fare Finder" />
      <div className="app-body">
        <section className="pcard">
          <h4>Tube, rail, Overground, DLR, Elizabeth</h4>
          <div className="row gap-s wrap">
            <label className="field inline">
              <span>From zone</span>
              <select value={a} onChange={(e) => setA(Number(e.target.value))}>
                {[1, 2, 3].map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </label>
            <label className="field inline">
              <span>To zone</span>
              <select value={b} onChange={(e) => setB(Number(e.target.value))}>
                {[1, 2, 3].map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="toggle">
            <span>Peak (weekdays 06:30–09:30, 16:00–19:00)</span>
            <input type="checkbox" checked={peak} onChange={(e) => setPeak(e.target.checked)} />
          </label>
          <p className="fare-big">{fmtMoney(fare)}</p>
          <p className="muted small">Changing lines inside the barriers is one journey. Walking out between trains starts a new fare.</p>
        </section>
        <ul className="fare-list">
          <li>
            🚌 Bus <strong>{fmtMoney(BUS_FARE)}</strong>
            <span className="muted small">Hopper: unlimited buses within {HOPPER_MINUTES} min of your first tap</span>
          </li>
          <li>
            🚲 Hire bike <strong>{fmtMoney(BIKE_FARE)}</strong>
            <span className="muted small">per 30 minutes</span>
          </li>
          <li>
            ⛴️ River bus <strong>{fmtMoney(BOAT_FARE)}</strong>
            <span className="muted small">flat fare, any distance</span>
          </li>
          <li>
            🚶 Walking <strong>free</strong>
            <span className="muted small">calming when it's dry</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
