export type Mode =
  | "tube"
  | "elizabeth"
  | "overground"
  | "dlr"
  | "rail"
  | "bus"
  | "boat"
  | "walk"
  | "bike";

export type Weather = "clear" | "rain";

export interface Station {
  id: string;
  name: string;
  zone: number;
  lat: number;
  lon: number;
  /** Label placement on the map, relative to the station dot. */
  label?: { dx: number; dy: number; anchor?: "start" | "middle" | "end" };
}

export interface Line {
  id: string;
  name: string;
  mode: Mode;
  color: string;
}

/** A directed hop between two adjacent stops on one line (or on foot / by bike). */
export interface Link {
  id: string;
  from: string;
  to: string;
  line: string;
  mode: Mode;
  /** Base in-vehicle minutes, before traffic, weather or delays. */
  minutes: number;
}

export interface Mission {
  id: string;
  title: string;
  brief: string;
  from: string;
  to: string;
  /** Minutes after midnight. */
  start: number;
  deadline: number;
  budget: number;
  weekday: boolean;
  weather: Weather;
  closedLines: string[];
  tip: string;
}

export interface Charge {
  label: string;
  amount: number;
  time: number;
}
