import { isPeak } from "../game/fares";
import { fmtMoney, fmtTime } from "../game/format";
import { LINE, STATION } from "../game/network";
import type { Mission } from "../game/types";

export default function Brief({ mission }: { mission: Mission }) {
  const peak = isPeak(mission.start, mission.weekday);
  return (
    <div className="card brief">
      <p className="brief-text">{mission.brief}</p>
      <div className="chips">
        <span className="chip">
          📍 {STATION[mission.from].name} → {STATION[mission.to].name}
        </span>
        <span className="chip">
          🕗 Leave {fmtTime(mission.start)} · due {fmtTime(mission.deadline)}
        </span>
        <span className="chip">💷 Budget {fmtMoney(mission.budget)}</span>
        <span className="chip">{mission.weekday ? "📅 Weekday" : "📅 Weekend"}</span>
        <span className={`chip ${peak ? "warn" : ""}`}>{peak ? "⏱ Peak fares" : "😌 Off-peak"}</span>
        <span className="chip">{mission.weather === "rain" ? "🌧 Rain" : "☀️ Dry"}</span>
        {mission.closedLines.map((id) => (
          <span key={id} className="chip danger">
            ⛔ {LINE[id].name} closed
          </span>
        ))}
      </div>
    </div>
  );
}
