import { describe, expect, test } from "vitest";
import { solve } from "../game/solver";
import type { Link } from "../game/types";
import {
  addDays,
  challengeDay,
  challengeNumber,
  dailyStreak,
  fmtChallengeDate,
  fmtCountdown,
  generateDaily,
  liveWindow,
  msUntilNextChallenge,
  routeEmoji,
  shareText,
} from "./daily";

const utc = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);

describe("Today in London (daily challenge)", () => {
  const days = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9, 1 + i));
    return d.toISOString().slice(0, 10);
  });

  test("every day for two months is finishable on time and on budget", () => {
    for (const day of days) {
      const { mission } = generateDaily(day, []);
      const { cheapestOnTime } = solve(mission);
      expect(cheapestOnTime, day).not.toBeNull();
      expect(cheapestOnTime!.est.cost, day).toBeLessThanOrEqual(mission.budget);
    }
  });

  test("everyone gets the same challenge on the same day", () => {
    expect(generateDaily("2026-10-11", [])).toEqual(generateDaily("2026-10-11", []));
    expect(generateDaily("2026-10-11", []).mission.id).toBe("daily-2026-10-11");
  });

  test("live TfL disruptions become closures, and lines not on the game map are ignored", () => {
    const d = generateDaily("2026-10-11", ["circle", "victoria"]);
    expect(d.source).toBe("live");
    expect(d.mission.closedLines).toEqual(["victoria"]);
    expect(d.mission.brief).toContain("Live from TfL");
  });

  test("a closure that would make the trip impossible is dropped", () => {
    for (const day of days.slice(0, 20)) {
      const { mission } = generateDaily(day, ["victoria", "northern"]);
      expect(solve(mission).fastest, day).not.toBeNull();
    }
  });
});

describe("challenge day rolls over at 07:00 London time", () => {
  test("in BST (07:00 BST is 06:00 UTC)", () => {
    expect(challengeDay(utc(2026, 10, 12, 5, 59))).toBe("2026-10-11");
    expect(challengeDay(utc(2026, 10, 12, 6, 0))).toBe("2026-10-12");
  });

  test("in GMT (07:00 GMT is 07:00 UTC)", () => {
    expect(challengeDay(utc(2026, 11, 15, 6, 59))).toBe("2026-11-14");
    expect(challengeDay(utc(2026, 11, 15, 7, 0))).toBe("2026-11-15");
  });

  test("late at night still counts as the same challenge day", () => {
    expect(challengeDay(utc(2026, 11, 15, 23, 30))).toBe("2026-11-15");
    expect(challengeDay(utc(2026, 11, 16, 2, 0))).toBe("2026-11-15");
  });

  test("on the mornings the clocks change", () => {
    // Clocks go back on 25 Oct 2026: 07:00 local is GMT.
    expect(challengeDay(utc(2026, 10, 25, 6, 59))).toBe("2026-10-24");
    expect(challengeDay(utc(2026, 10, 25, 7, 0))).toBe("2026-10-25");
    // Clocks go forward on 28 Mar 2027: 07:00 local is BST.
    expect(challengeDay(utc(2027, 3, 28, 5, 59))).toBe("2027-03-27");
    expect(challengeDay(utc(2027, 3, 28, 6, 0))).toBe("2027-03-28");
  });

  test("live closures only between 07:00 and 22:00 London", () => {
    expect(liveWindow(utc(2026, 10, 12, 5, 59))).toBe(false); // 06:59 BST
    expect(liveWindow(utc(2026, 10, 12, 6, 0))).toBe(true); // 07:00 BST
    expect(liveWindow(utc(2026, 10, 12, 20, 59))).toBe(true); // 21:59 BST
    expect(liveWindow(utc(2026, 10, 12, 21, 0))).toBe(false); // 22:00 BST
    expect(liveWindow(utc(2026, 11, 15, 6, 30))).toBe(false); // 06:30 GMT
    expect(liveWindow(utc(2026, 11, 15, 7, 0))).toBe(true); // 07:00 GMT
  });

  test("countdown to the next challenge", () => {
    expect(fmtCountdown(msUntilNextChallenge(utc(2026, 10, 12, 0, 48)))).toBe("5h 12m"); // 01:48 BST
    expect(msUntilNextChallenge(utc(2026, 10, 12, 6, 0))).toBe(24 * 3600_000);
    // The night the clocks go back is an hour longer.
    expect(msUntilNextChallenge(utc(2026, 10, 24, 6, 0))).toBe(25 * 3600_000);
    expect(fmtCountdown(9 * 60_000)).toBe("9m");
    expect(fmtCountdown(20_000)).toBe("under a minute");
  });
});

describe("numbering, streaks and sharing", () => {
  test("2026-10-10 is #1, across months and clock changes", () => {
    expect(challengeNumber("2026-10-10")).toBe(1);
    expect(challengeNumber("2026-10-11")).toBe(2);
    expect(challengeNumber("2026-10-22")).toBe(13);
    expect(challengeNumber("2026-11-01")).toBe(23);
    expect(challengeNumber("2027-10-10")).toBe(366);
    expect(fmtChallengeDate("2026-10-11")).toBe("Sunday 11 October");
  });

  test("addDays crosses month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  test("streaks count consecutive challenge days, and gaps break them", () => {
    const played = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-15", "2026-10-16"];
    expect(dailyStreak(played, "2026-10-16")).toEqual({ current: 2, best: 3, playedToday: true, atRisk: false });
    // Not played yet today, but played yesterday: still alive, at risk.
    expect(dailyStreak(played, "2026-10-17")).toEqual({ current: 2, best: 3, playedToday: false, atRisk: true });
    // Missed a whole day: broken.
    expect(dailyStreak(played, "2026-10-18")).toEqual({ current: 0, best: 3, playedToday: false, atRisk: false });
    expect(dailyStreak([], "2026-10-18")).toEqual({ current: 0, best: 0, playedToday: false, atRisk: false });
    expect(dailyStreak(["2026-10-31", "2026-11-01"], "2026-11-01").current).toBe(2);
  });

  const leg = (line: string, mode: Link["mode"]) => ({ line, mode });

  test("one emoji per leg, merging hops on the same line", () => {
    const route = [leg("victoria", "tube"), leg("victoria", "tube"), leg("northern", "tube"), leg("walk", "walk"), leg("bus-37", "bus"), leg("bus-37", "bus")];
    expect(routeEmoji(route)).toBe("🚇🚇🚶🚌");
  });

  test("the share card matches the spec and holds no personal info", () => {
    const text = shareText({
      day: "2026-10-22",
      stars: 2,
      arrival: 647,
      cost: 1.75,
      route: [leg("victoria", "tube"), leg("victoria", "tube"), leg("northern", "tube"), leg("walk", "walk"), leg("bus-37", "bus")],
      streak: 3,
      link: "https://example.com/",
    });
    expect(text).toBe("Tube Life #13 📅 ★★☆\n🚇🚇🚶🚌 10:47 · £1.75\n🔥 3-day streak\nhttps://example.com/");
  });

  test("a late run with no route or streak still makes a tidy card", () => {
    expect(shareText({ day: "2026-10-11", stars: 0, arrival: 1442.4, cost: 0, streak: 0, link: "x" })).toBe("Tube Life #2 📅 ☆☆☆\n00:02 · £0.00\nx");
  });
});
