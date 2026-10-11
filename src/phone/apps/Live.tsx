import { useState } from "react";
import { routeEndsAt } from "../../game/engine";
import { STATION, STATIONS } from "../../game/network";
import { STATION_NAPTAN, TFL_LINE_COLORS, fetchArrivals, fetchLineStatus, useLive, type LiveArrival } from "../../live/tfl";
import { useGameView } from "../gameBridge";
import { AppHeader } from "../ui";
import { MissionStatus } from "./Commute";

function Updated({ updated, loading, refresh }: { updated: Date | null; loading: boolean; refresh: () => void }) {
  return (
    <div className="live-meta">
      <span className="live-dot" aria-hidden />
      <span className="muted small">
        {loading ? "Updating…" : updated ? `Live · updated ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Live"}
      </span>
      <button className="link small" onClick={refresh} disabled={loading}>
        ↻ Refresh
      </button>
    </div>
  );
}

const Attribution = () => <p className="muted small center">Powered by TfL Open Data</p>;

/** Line Status: real-time London, or the closures in your current mission. */
export function StatusApp() {
  const [tab, setTab] = useState<"live" | "mission">("live");
  return (
    <div className="app">
      <AppHeader title="🚇 Line Status" />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "live"} className={tab === "live" ? "on" : ""} onClick={() => setTab("live")}>
          Live London
        </button>
        <button role="tab" aria-selected={tab === "mission"} className={tab === "mission" ? "on" : ""} onClick={() => setTab("mission")}>
          This mission
        </button>
      </div>
      <div className="app-body">{tab === "live" ? <LiveStatus /> : <MissionStatus />}</div>
    </div>
  );
}

function LiveStatus() {
  const { data, error, loading, updated, refresh } = useLive((force) => fetchLineStatus(force), 60_000, []);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <Updated updated={updated} loading={loading} refresh={refresh} />
      {error && <p className="perror">{error}</p>}
      {!data && !error && <p className="muted small">Asking TfL…</p>}
      {data && (
        <ul className="status-list">
          {data.map((l) => {
            const cls = l.level === "good" ? "ok" : l.level;
            return (
              <li key={l.id} className="status-live">
                <button className="status-row" onClick={() => setOpen((o) => (o === l.id ? null : l.id))} disabled={!l.reason} aria-expanded={open === l.id}>
                  <span className="status-bar" style={{ background: TFL_LINE_COLORS[l.id] ?? "#888" }} />
                  <span className="status-name">{l.name}</span>
                  <span className={`status-state ${cls}`}>
                    {l.status}
                    {l.reason && " ›"}
                  </span>
                </button>
                {open === l.id && l.reason && <p className="status-reason">{l.reason}</p>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small">This is the real network right now. Missions use the game's own timetable.</p>
      <Attribution />
    </>
  );
}

/** Where the player is in the game, so Arrivals opens on the right station. */
function useGameStation(): string {
  const g = useGameView();
  const link = g.journey?.link;
  if (g.journey && !g.journey.done && link) return g.journey.phase === "wait" ? link.from : link.to;
  if (g.mission) return g.screen === "plan" ? routeEndsAt(g.mission, g.route) : g.mission.from;
  return "oxford";
}

const STATION_OPTIONS = STATIONS.filter((s) => STATION_NAPTAN[s.id]).sort((a, b) => a.name.localeCompare(b.name));

export function ArrivalsApp() {
  const gameStation = useGameStation();
  const [picked, setPicked] = useState<string | null>(null);
  const station = picked ?? gameStation;
  const { data, error, loading, updated, refresh } = useLive((force) => fetchArrivals(station, force), 30_000, [station]);
  const boards = groupBoards(data ?? []);

  return (
    <div className="app">
      <AppHeader title="🕒 Arrivals" />
      <div className="app-body">
        <label className="field">
          <span>Station</span>
          <select value={station} onChange={(e) => setPicked(e.target.value)}>
            {STATION_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.id === gameStation ? " (you're here)" : ""}
              </option>
            ))}
          </select>
        </label>
        <Updated updated={updated} loading={loading} refresh={refresh} />
        {error && <p className="perror">{error}</p>}
        {!data && !error && <p className="muted small">Asking TfL…</p>}
        {data && boards.length === 0 && <p className="muted small">No trains due at {STATION[station].name} right now. The line may be closed for the night.</p>}
        {boards.map((b) => (
          <section key={b.key} className="board" style={{ ["--lc" as string]: TFL_LINE_COLORS[b.lineId] ?? "#888" }}>
            <header>
              <strong>{b.lineName}</strong>
              <span className="muted small">{b.platform}</span>
            </header>
            <ol>
              {b.trains.map((t, i) => (
                <li key={t.id}>
                  <span className="board-n">{i + 1}</span>
                  <span className="board-dest">{t.destination}</span>
                  <span className="board-due">{t.seconds < 60 ? "Due" : `${Math.floor(t.seconds / 60)} min`}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
        <p className="muted small">Real trains at the real station. Your game ride runs on its own clock.</p>
        <Attribution />
      </div>
    </div>
  );
}

/** One departure board per line and platform, next three trains each. */
export function groupBoards(arrivals: LiveArrival[]) {
  const boards = new Map<string, { key: string; lineId: string; lineName: string; platform: string; trains: LiveArrival[] }>();
  for (const a of arrivals) {
    const key = `${a.lineId}|${a.platform}`;
    const b = boards.get(key) ?? { key, lineId: a.lineId, lineName: a.lineName, platform: a.platform, trains: [] };
    if (b.trains.length < 3) b.trains.push(a);
    boards.set(key, b);
  }
  return [...boards.values()].sort((a, b) => a.lineName.localeCompare(b.lineName) || a.platform.localeCompare(b.platform));
}
