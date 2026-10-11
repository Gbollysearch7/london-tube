import { describe, expect, test } from "vitest";
import { STATIONS } from "../game/network";
import { groupBoards } from "../phone/apps/Live";
import { STATION_NAPTAN, cleanStationName, parseArrivals, parseLineStatus } from "./tfl";

const row = (id: string, line: string, mode: string, platform: string, dest: string, secs: number) => ({
  id,
  lineId: line,
  lineName: line,
  modeName: mode,
  platformName: platform,
  destinationName: dest,
  timeToStation: secs,
});

describe("live TfL data", () => {
  test("every game station has at least one TfL stop id", () => {
    for (const s of STATIONS) expect(STATION_NAPTAN[s.id]?.length, s.id).toBeGreaterThan(0);
  });

  test("station names are tidied", () => {
    expect(cleanStationName("Elephant & Castle Underground Station")).toBe("Elephant & Castle");
    expect(cleanStationName("Highbury & Islington Rail Station")).toBe("Highbury & Islington");
    expect(cleanStationName(undefined)).toBe("Check front of train");
  });

  test("line status shows the worst status and sorts problems first", () => {
    const lines = parseLineStatus([
      { id: "victoria", name: "Victoria", lineStatuses: [{ statusSeverity: 10, statusSeverityDescription: "Good Service" }] },
      {
        id: "district",
        name: "District",
        lineStatuses: [
          { statusSeverity: 9, statusSeverityDescription: "Minor Delays", reason: "Signal fault" },
          { statusSeverity: 3, statusSeverityDescription: "Part Closure", reason: "Engineering works" },
        ],
      },
    ]);
    expect(lines.map((l) => [l.id, l.status])).toEqual([
      ["district", "Part Closure"],
      ["victoria", "Good Service"],
    ]);
    expect(lines[0].reason).toContain("Engineering works");
  });

  test("closed lines count as problems even though TfL codes them 20", () => {
    const lines = parseLineStatus([
      { id: "victoria", name: "Victoria", lineStatuses: [{ statusSeverity: 10, statusSeverityDescription: "Good Service" }] },
      { id: "bakerloo", name: "Bakerloo", lineStatuses: [{ statusSeverity: 20, statusSeverityDescription: "Service Closed" }] },
    ]);
    expect(lines[0]).toMatchObject({ id: "bakerloo", level: "bad" });
    expect(lines[1]).toMatchObject({ id: "victoria", level: "good" });
  });

  test("arrivals drop buses and duplicates, and sort soonest first", () => {
    const a = parseArrivals([
      row("1", "victoria", "tube", "Southbound - Platform 2", "Brixton Underground Station", 300),
      row("2", "victoria", "tube", "Southbound - Platform 2", "Brixton Underground Station", 60),
      row("2", "victoria", "tube", "Southbound - Platform 2", "Brixton Underground Station", 60),
      row("3", "55", "bus", "", "Oxford Circus", 30),
    ]);
    expect(a.map((x) => x.id)).toEqual(["2", "1"]);
    expect(a[0].destination).toBe("Brixton");
  });

  test("departure boards group by line and platform, three trains each", () => {
    const a = parseArrivals([1, 2, 3, 4].map((n) => row(String(n), "central", "tube", "Eastbound", "Epping Underground Station", n * 60)));
    const boards = groupBoards(a);
    expect(boards).toHaveLength(1);
    expect(boards[0].trains).toHaveLength(3);
  });
});
