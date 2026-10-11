import { describe, expect, test } from "vitest";
import { FareMeter, isPeak, railFare, railcardFare } from "./fares";
import { Journey, estimate, mulberry32 } from "./engine";
import { LINKS } from "./network";
import { MISSIONS } from "./missions";
import { solve } from "./solver";
import type { Link } from "./types";

const link = (id: string): Link => {
  const l = LINKS.find((x) => x.id === id);
  if (!l) throw new Error(`no link ${id}`);
  return l;
};

describe("fares", () => {
  test("peak windows only apply on weekdays", () => {
    expect(isPeak(8 * 60, true)).toBe(true);
    expect(isPeak(10 * 60, true)).toBe(false);
    expect(isPeak(17 * 60, true)).toBe(true);
    expect(isPeak(8 * 60, false)).toBe(false);
  });

  test("rail fare depends on zones and peak", () => {
    expect(railFare([1, 2], true)).toBe(3.5);
    expect(railFare([2], false)).toBe(2.0);
    expect(railFare([1, 3], false)).toBe(3.1);
  });

  test("bus Hopper makes a second bus within the hour free", () => {
    const m = new FareMeter(true);
    m.busTap(480, "Bus A");
    m.busTap(530, "Bus B");
    m.busTap(545, "Bus C");
    expect(m.total).toBe(3.5);
  });

  test("consecutive rail legs are charged as one journey", () => {
    const mission = MISSIONS[0];
    const route = [link("victoria:brixton>stockwell"), link("victoria:stockwell>vauxhall"), link("victoria:vauxhall>victoria")];
    expect(estimate(mission, route).cost).toBe(3.5);
  });

  test("leaving the barriers starts a new rail fare", () => {
    const mission = { ...MISSIONS[0], start: 11 * 60 };
    const route = [link("victoria:brixton>stockwell"), link("walk:stockwell>vauxhall"), link("victoria:vauxhall>victoria")];
    expect(estimate(mission, route).cost).toBe(2.0 + 2.8);
  });

  test("hire bike charges per started 30 minutes", () => {
    const m = new FareMeter(true);
    const a = link("bike:brixton>stockwell");
    m.board(a, 0);
    m.alight(a, 31, undefined);
    expect(m.total).toBe(3.3);
  });
});

describe("one fare per vehicle", () => {
  const mission = (id: string) => MISSIONS.find((m) => m.id === id)!;

  test("staying on the river bus is one flat fare", () => {
    const route = [link("river:waterloo>londonbridge"), link("river:londonbridge>canarywharf")];
    expect(estimate(mission("river"), route).cost).toBe(5.2);
  });

  test("one long bus ride is a single tap", () => {
    const route = ["paddington>baker", "baker>euston", "euston>kingscross", "kingscross>liverpool"].map((h) => link(`bus-205:${h}`));
    for (let seed = 1; seed <= 100; seed++) {
      const j = new Journey(mission("skint"), route, mulberry32(seed));
      const rng = mulberry32(seed * 3);
      while (!j.done) {
        // Always pick the option with no extra fare: "stay on" / "wait for the next one".
        if (j.pending) j.resolve(0);
        else j.advance(rng() * 0.6);
      }
      const busTaps = j.meter.charges.filter((c) => c.label.startsWith("Bus 205"));
      expect(busTaps).toHaveLength(1);
      expect(busTaps[0].amount).toBe(1.75);
    }
  });

  test("fractional frame steps don't add an extra hire-bike block", () => {
    // A ride that the planner prices at exactly one 30-minute block.
    const m = mission("strike");
    const route = ["stockwell>vauxhall", "vauxhall>westminster", "westminster>leicester", "leicester>tcr"].map((h) => link(`bike:${h}`));
    const planned = estimate(m, route).cost;
    expect(planned).toBe(1.65);
    const j = new Journey(m, route, null);
    while (!j.done) j.advance(0.37);
    expect(j.meter.total).toBe(planned);
  });
});

describe("mission tips hold up", () => {
  const mission = (id: string) => MISSIONS.find((m) => m.id === id)!;
  const check = (id: string, ids: string[]) => {
    const m = mission(id);
    const est = estimate(m, ids.map(link));
    expect(est.arrival).toBeLessThanOrEqual(m.deadline);
    expect(est.cost).toBeLessThanOrEqual(m.budget);
    return est;
  };

  test("Strike Day: two buses on one Hopper fare", () => {
    const est = check("strike", ["bus-159:brixton>westminster", "bus-159:westminster>oxford", "bus-73:oxford>euston", "bus-73:euston>kingscross"]);
    expect(est.cost).toBe(1.75);
  });
  test("Interview: Mildmay and Jubilee stay out of zone 1", () => {
    const est = check("interview", ["mildmay:highbury>hackney", "mildmay:hackney>stratford", "jubilee:stratford>canarywharf"]);
    expect(est.cost).toBe(2.2);
  });
  test("Sunday on the River: the river bus fits the budget", () => {
    check("river", ["river:waterloo>londonbridge", "river:londonbridge>canarywharf"]);
  });
  test("Skint: bus 205 all the way", () => {
    check("skint", ["paddington>baker", "baker>euston", "euston>kingscross", "kingscross>liverpool"].map((h) => `bus-205:${h}`));
  });
  test("Rainy Monday: the direct bus", () => {
    check("rainy-monday", ["bus-12:peckham>westminster"]);
  });
});

describe("missions", () => {
  for (const mission of MISSIONS) {
    test(`${mission.title} can be completed on time and on budget`, () => {
      const { cheapestOnTime } = solve(mission);
      expect(cheapestOnTime).not.toBeNull();
      expect(cheapestOnTime!.est.cost).toBeLessThanOrEqual(mission.budget);
    });
  }
});

describe("live journey", () => {
  test("a random ride always finishes when every event is resolved", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const mission = MISSIONS[seed % MISSIONS.length];
      const { fastest } = solve(mission);
      const j = new Journey(mission, fastest!.route, mulberry32(seed));
      const rng = mulberry32(seed * 7);
      let steps = 0;
      while (!j.done && steps++ < 5000) {
        if (j.pending) j.resolve(Math.floor(rng() * j.pending.choices.length));
        else j.advance(0.5);
      }
      expect(j.done).toBe(true);
      expect(j.clock).toBeGreaterThan(mission.start);
    }
  });
});

describe("travel passes", () => {
  const brixtonToVictoria = ["victoria:brixton>stockwell", "victoria:stockwell>vauxhall", "victoria:vauxhall>victoria"];
  const peakRun = MISSIONS[0]; // weekday, 08:20
  const offPeak = { ...MISSIONS[0], start: 11 * 60, deadline: 13 * 60 };
  const fare = (m: typeof peakRun, ids: string[]) => {
    const j = new Journey(m, ids.map(link), null);
    j.runToEnd();
    return j.meter;
  };

  test("a travelcard covering every zone makes rail free, still on the receipt", () => {
    const meter = fare({ ...peakRun, passes: { travelcardZones: 2 } }, brixtonToVictoria);
    expect(meter.total).toBe(0);
    expect(meter.charges).toHaveLength(1);
    expect(meter.charges[0].label).toContain("(travelcard)");
    expect(meter.charges[0].amount).toBe(0);
  });

  test("outside the travelcard you pay an extension for the uncovered zones", () => {
    const meter = fare({ ...peakRun, passes: { travelcardZones: 1 } }, brixtonToVictoria);
    expect(meter.total).toBe(railFare([2], true));
    expect(meter.charges[0].label).toContain("extension");
  });

  test("any travelcard covers buses; so does a bus pass", () => {
    const bus = ["bus-12:peckham>westminster"];
    expect(fare(peakRun, bus).total).toBe(1.75);
    const card = fare({ ...peakRun, passes: { travelcardZones: 1 } }, bus);
    expect(card.total).toBe(0);
    expect(card.charges[0].label).toContain("(travelcard)");
    const pass = fare({ ...peakRun, passes: { busPass: true } }, bus);
    expect(pass.total).toBe(0);
    expect(pass.charges[0].label).toContain("(bus pass)");
  });

  test("a railcard takes a third off off-peak rail, rounded to 5p", () => {
    expect(railcardFare(2.9)).toBe(1.95);
    expect(railcardFare(3.1)).toBe(2.05);
    expect(railcardFare(2.0)).toBe(1.35);
    const off = fare({ ...offPeak, passes: { railcard: true } }, brixtonToVictoria);
    expect(off.total).toBe(railcardFare(railFare([1, 2], false)));
    expect(off.charges[0].label).toContain("(railcard)");
    // Peak fares are full price.
    expect(fare({ ...peakRun, passes: { railcard: true } }, brixtonToVictoria).total).toBe(3.5);
  });

  test("your own bike makes cycling free", () => {
    const ride = ["bike:brixton>stockwell", "bike:stockwell>vauxhall"];
    expect(fare(offPeak, ride).total).toBe(1.65);
    const own = fare({ ...offPeak, passes: { ownBike: true } }, ride);
    expect(own.total).toBe(0);
    expect(own.charges[0].label).toContain("own bike");
  });
});

describe("delayed lines", () => {
  const route = ["victoria:brixton>stockwell", "victoria:stockwell>vauxhall", "victoria:vauxhall>victoria", "victoria:victoria>greenpark", "victoria:greenpark>oxford"].map(link);

  test("a delay multiplier slows the estimate on that line only", () => {
    const normal = estimate(MISSIONS[0], route);
    const slow = estimate({ ...MISSIONS[0], delayedLines: { victoria: 1.6 } }, route);
    const other = estimate({ ...MISSIONS[0], delayedLines: { central: 1.6 } }, route);
    expect(slow.arrival).toBeGreaterThan(normal.arrival);
    expect(other.arrival).toBe(normal.arrival);
    expect(slow.cost).toBe(normal.cost);
  });

  test("the live ride is slowed too", () => {
    const m = { ...MISSIONS[0], delayedLines: { victoria: 1.6 } };
    let slower = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const a = new Journey(MISSIONS[0], route, mulberry32(seed));
      const b = new Journey(m, route, mulberry32(seed));
      // Compare the planned in-vehicle time of the first leg, which events don't touch.
      if (b.legs[0].arrive - b.legs[0].board > a.legs[0].arrive - a.legs[0].board) slower++;
    }
    expect(slower).toBeGreaterThan(20);
  });

  test("the solver still finds the true fastest route under delays", () => {
    const m = { ...MISSIONS[0], delayedLines: { victoria: 1.8 } };
    const { fastest } = solve(m);
    expect(fastest).not.toBeNull();
    expect(estimate(m, fastest!.route).arrival).toBe(fastest!.est.arrival);
    // Exhaustive check against every simple route of up to 6 legs.
    let best = Infinity;
    const walk = (at: string, path: Link[], seen: Set<string>) => {
      if (at === m.to) {
        best = Math.min(best, estimate(m, path).arrival);
        return;
      }
      if (path.length >= 6) return;
      for (const l of LINKS) {
        if (l.from !== at || seen.has(l.to) || m.closedLines.includes(l.line)) continue;
        seen.add(l.to);
        walk(l.to, [...path, l], seen);
        seen.delete(l.to);
      }
    };
    walk(m.from, [], new Set([m.from]));
    expect(fastest!.est.arrival).toBeLessThanOrEqual(best);
  });
});
