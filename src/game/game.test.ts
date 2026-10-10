import { describe, expect, test } from "vitest";
import { FareMeter, isPeak, railFare } from "./fares";
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
