import { LINE } from "../game/network";
import type { Mode } from "../game/types";

export const MODE_ICON: Record<Mode, string> = {
  tube: "🚇",
  elizabeth: "🚆",
  overground: "🚆",
  dlr: "🚈",
  rail: "🚆",
  bus: "🚌",
  boat: "⛴️",
  walk: "🚶",
  bike: "🚲",
};

export default function ModeBadge({ lineId, short = false }: { lineId: string; short?: boolean }) {
  const line = LINE[lineId];
  return (
    <span className="badge" style={{ ["--lc" as string]: line.color }}>
      <span aria-hidden>{MODE_ICON[line.mode]}</span>
      {!short && <span>{line.name}</span>}
    </span>
  );
}
