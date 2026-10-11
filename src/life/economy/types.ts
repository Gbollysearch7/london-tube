// Economy module state: seasons, weekly goals, purchases and station businesses.
// Everything here is plain JSON so London Life can save it to localStorage.

export type Grade = "A" | "B" | "C" | "D" | "E" | "F";

/** What happened this game week, for the three weekly goals. */
export interface WeekProgress {
  week: number;
  goals: string[];
  done: string[];
  bonus: boolean;
  /** Rail lines ridden (tube, Elizabeth, Overground, DLR, rail). */
  lines: string[];
  /** Stations arrived at. */
  stations: string[];
  trips: number;
  busTrips: number;
  walkTrips: number;
  river: number;
  bike: number;
  hopper: number;
  nightTube: number;
  elizabeth: number;
  overground: number;
  /** Fares plus travel passes bought this week (£). */
  fares: number;
  onTime: number;
  /** Calendar days with an evening out. */
  evenings: number[];
  newPlaces: number;
  dailies: number;
}

export interface SeasonProgress {
  n: number;
  startDay: number;
  startMoney: number;
  venues: string[];
  onTime: number;
  dailies: number;
}

export interface ReportRow {
  id: string;
  label: string;
  value: number;
  target: number;
  points: number;
}

export interface SeasonReport {
  season: number;
  grade: Grade;
  points: number;
  rows: ReportRow[];
  reward: number;
  title: string;
}

export interface Business {
  station: string;
  /** 0 cart, 1 kiosk, 2 café, 3 small chain. */
  tier: number;
  invested: number;
  openedDay: number;
  earned: number;
}

export interface Owned {
  id: string;
  day: number;
  /** First day it no longer works (time-limited items only). */
  expires?: number;
  station?: string;
  line?: string;
}

export interface EconomyState {
  v: 1;
  season: SeasonProgress;
  week: WeekProgress;
  owned: Owned[];
  businesses: Business[];
  advert?: { line: string; expires: number };
  /** Permanent titles from season report cards, oldest first. */
  titles: string[];
  /** Waiting to be shown; cleared by "Start Season N". */
  report?: SeasonReport;
  history: { season: number; grade: Grade; points: number }[];
  /** Length of LifeState.visited last time we looked, to spot brand-new places. */
  visitedCount: number;
}
