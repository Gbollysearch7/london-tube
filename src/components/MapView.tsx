import { useMemo } from "react";
import { LINE, LINKS, MAP_H, MAP_W, STATION, STATIONS, THAMES, isRail, project } from "../game/network";
import type { Link, Mission } from "../game/types";

interface Props {
  mission: Mission;
  route: Link[];
  current?: string;
  targets?: Set<string>;
  selected?: string | null;
  onStationClick?: (id: string) => void;
  rider?: { x: number; y: number; mode: string } | null;
  showBuses?: boolean;
}

const pos = (id: string) => project(STATION[id].lat, STATION[id].lon);

interface Segment {
  key: string;
  a: string;
  b: string;
  line: string;
  offset: number;
}

// One drawn segment per (line, station pair), spread side by side where lines share a corridor.
const SEGMENTS: Segment[] = (() => {
  const seen = new Set<string>();
  const pairs = new Map<string, string[]>();
  const out: Segment[] = [];
  for (const l of LINKS) {
    if (l.mode === "bike") continue;
    const [a, b] = [l.from, l.to].sort();
    const key = `${l.line}|${a}|${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pairKey = `${a}|${b}|${isRail(l.mode) || l.mode === "boat" ? "rail" : l.mode}`;
    const lines = pairs.get(pairKey) ?? [];
    lines.push(l.line);
    pairs.set(pairKey, lines);
    out.push({ key, a, b, line: l.line, offset: 0 });
  }
  for (const s of out) {
    const mode = LINE[s.line].mode;
    const lines = pairs.get(`${s.a}|${s.b}|${isRail(mode) || mode === "boat" ? "rail" : mode}`)!;
    const i = lines.indexOf(s.line);
    s.offset = (i - (lines.length - 1) / 2) * (mode === "bus" ? 3 : 4.5);
  }
  return out;
})();

const INTERCHANGES = new Set(
  STATIONS.filter((s) => new Set(LINKS.filter((l) => l.from === s.id && isRail(l.mode)).map((l) => l.line)).size > 1).map((s) => s.id),
);

function offsetLine(a: string, b: string, offset: number) {
  const p = pos(a);
  const q = pos(b);
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const nx = -(q.y - p.y) / len;
  const ny = (q.x - p.x) / len;
  return { x1: p.x + nx * offset, y1: p.y + ny * offset, x2: q.x + nx * offset, y2: q.y + ny * offset };
}

const thamesPath = (() => {
  const pts = THAMES.map(([lon, lat]) => project(lat, lon));
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q${pts[i].x},${pts[i].y} ${mx},${my}`;
  }
  const last = pts[pts.length - 1];
  return `${d} T${last.x},${last.y}`;
})();

export default function MapView({ mission, route, current, targets, selected, onStationClick, rider, showBuses = true }: Props) {
  const closed = useMemo(() => new Set(mission.closedLines), [mission.closedLines]);
  const routeKeys = useMemo(() => new Set(route.map((l) => `${l.line}|${[l.from, l.to].sort().join("|")}`)), [route]);
  const onRoute = useMemo(() => new Set([mission.from, ...route.map((l) => l.to)]), [mission.from, route]);
  const nearbyStreets = useMemo(
    () => new Set(LINKS.filter((l) => l.mode === "walk" && l.from === current).map((l) => `walk|${[l.from, l.to].sort().join("|")}`)),
    [current],
  );

  return (
    <svg className="map" viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="Map of the game network">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width={MAP_W} height={MAP_H} className="map-bg" />
      <path d={thamesPath} className="thames" />
      <text x={70} y={478} className="map-water-label">
        River Thames
      </text>

      {/* Base network */}
      <g>
        {SEGMENTS.map((s) => {
          const line = LINE[s.line];
          const isClosed = closed.has(s.line);
          if (line.mode === "bus" && !showBuses) return null;
          if (line.mode === "walk" && !nearbyStreets.has(s.key)) return null;
          const c = offsetLine(s.a, s.b, s.offset);
          const cls = ["seg", `seg-${line.mode}`, isClosed ? "seg-closed" : "", routeKeys.has(s.key) ? "seg-faded" : ""].join(" ");
          return <line key={s.key} {...c} className={cls} stroke={line.color} />;
        })}
      </g>

      {/* Closure markers */}
      <g>
        {SEGMENTS.filter((s) => closed.has(s.line)).map((s) => {
          const c = offsetLine(s.a, s.b, s.offset);
          return (
            <text key={`x-${s.key}`} x={(c.x1 + c.x2) / 2} y={(c.y1 + c.y2) / 2 + 4} className="closed-mark" textAnchor="middle">
              ⛔
            </text>
          );
        })}
      </g>

      {/* Planned route */}
      <g filter="url(#glow)">
        {route.map((l) => {
          const [a, b] = [l.from, l.to].sort();
          const seg = SEGMENTS.find((s) => s.key === `${l.line}|${a}|${b}`);
          const c = offsetLine(a, b, seg?.offset ?? 0);
          return <line key={l.id} {...c} className={`route-seg route-${l.mode}`} stroke={LINE[l.line].color} />;
        })}
      </g>

      {/* Stations */}
      <g>
        {STATIONS.map((s) => {
          const p = pos(s.id);
          const isTarget = targets?.has(s.id);
          const isFrom = s.id === mission.from;
          const isTo = s.id === mission.to;
          const cls = [
            "stn",
            INTERCHANGES.has(s.id) ? "stn-ix" : "",
            isTarget ? "stn-target" : "",
            s.id === current ? "stn-current" : "",
            onRoute.has(s.id) ? "stn-onroute" : "",
            selected === s.id ? "stn-selected" : "",
            isTo ? "stn-dest" : "",
          ].join(" ");
          const label = s.label ?? { dx: 9, dy: 4 };
          return (
            <g
              key={s.id}
              className={cls}
              onClick={onStationClick ? () => onStationClick(s.id) : undefined}
              style={{ cursor: onStationClick && isTarget ? "pointer" : "default" }}
            >
              {isTarget && <circle cx={p.x} cy={p.y} r={13} className="stn-pulse" />}
              {isTo && <circle cx={p.x} cy={p.y} r={15} className="stn-dest-ring" />}
              {isFrom && <circle cx={p.x} cy={p.y} r={11} className="stn-from-ring" />}
              <circle cx={p.x} cy={p.y} r={INTERCHANGES.has(s.id) ? 6.5 : 5} className="stn-dot" />
              <circle cx={p.x} cy={p.y} r={16} fill="transparent" />
              <text x={p.x + label.dx} y={p.y + label.dy} textAnchor={label.anchor ?? "start"} className="stn-label">
                {s.name}
              </text>
            </g>
          );
        })}
      </g>

      {rider && (
        <g className="rider" transform={`translate(${rider.x},${rider.y})`}>
          <circle r={14} className="rider-halo" />
          <circle r={8} className="rider-dot" />
        </g>
      )}
    </svg>
  );
}
