import { estimate, type Estimate } from "./engine";
import { LINKS, LINKS_FROM, isRail } from "./network";
import type { Link, Mission } from "./types";

export function availableLinks(mission: Mission, from: string, visited: Set<string>): Link[] {
  return (LINKS_FROM[from] ?? []).filter((l) => !mission.closedLines.includes(l.line) && !visited.has(l.to));
}

export interface Solution {
  route: Link[];
  est: Estimate;
}

export interface SolverResult {
  fastest: Solution | null;
  cheapestOnTime: Solution | null;
}

/** Optimistic minutes from every station to `to` (no waits, no traffic). */
function lowerBounds(mission: Mission): Map<string, number> {
  const dist = new Map<string, number>([[mission.to, 0]]);
  const queue = [mission.to];
  // Bellman-Ford style relaxation; the graph is tiny.
  while (queue.length) {
    const at = queue.shift()!;
    for (const l of LINKS) {
      if (l.to !== at || mission.closedLines.includes(l.line)) continue;
      const d = dist.get(at)! + l.minutes;
      if (d < (dist.get(l.from) ?? Infinity)) {
        dist.set(l.from, d);
        queue.push(l.from);
      }
    }
  }
  return dist;
}

/**
 * Depth-first search over simple routes, pruned by an optimistic time bound
 * and by dominance (an earlier, cheaper arrival at the same stop in the same
 * fare state makes the current branch pointless).
 */
export function solve(mission: Mission, maxLegs = 10): SolverResult {
  let fastest: Solution | null = null;
  let cheapest: Solution | null = null;
  const bound = lowerBounds(mission);
  const labels = new Map<string, { arrival: number; cost: number }[]>();
  const route: Link[] = [];
  const visited = new Set<string>([mission.from]);

  const dominated = (key: string, arrival: number, cost: number) => {
    const list = labels.get(key) ?? [];
    if (list.some((l) => l.arrival <= arrival && l.cost <= cost)) return true;
    labels.set(key, [...list.filter((l) => !(arrival <= l.arrival && cost <= l.cost)), { arrival, cost }]);
    return false;
  };

  const walk = (at: string) => {
    if (route.length >= maxLegs) return;
    for (const link of availableLinks(mission, at, visited)) {
      route.push(link);
      const est = estimate(mission, route);
      const limit = fastest ? Math.max(mission.deadline, fastest.est.arrival) : mission.deadline + 30;
      if (est.arrival + (bound.get(link.to) ?? Infinity) <= limit) {
        if (link.to === mission.to) {
          if (!fastest || est.arrival < fastest.est.arrival || (est.arrival === fastest.est.arrival && est.cost < fastest.est.cost))
            fastest = { route: [...route], est };
          if (
            est.arrival <= mission.deadline &&
            (!cheapest || est.cost < cheapest.est.cost || (est.cost === cheapest.est.cost && est.arrival < cheapest.est.arrival))
          )
            cheapest = { route: [...route], est };
        } else {
          const fareState = isRail(link.mode) ? `rail:${link.line}` : link.mode === "bus" ? "bus" : link.mode;
          if (!dominated(`${link.to}|${fareState}`, est.arrival, est.cost)) {
            visited.add(link.to);
            walk(link.to);
            visited.delete(link.to);
          }
        }
      }
      route.pop();
    }
  };
  walk(mission.from);
  return { fastest, cheapestOnTime: cheapest };
}
