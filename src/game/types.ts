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
  /** Travel passes the player owns, which change fares (London Life purchases). */
  passes?: Passes;
  /** Lines running slower than usual: multiplier on in-vehicle time, e.g. { victoria: 1.3 }. */
  delayedLines?: Record<string, number>;
}

export interface Passes {
  /** Weekly travelcard covering zones 1..n: rail and bus trips inside it cost nothing extra. */
  travelcardZones?: number;
  /** Bus & tram pass: buses are free. */
  busPass?: boolean;
  /** Railcard: a third off off-peak rail fares. */
  railcard?: boolean;
  /** Own bike: cycling is free (no hire-bike charge). */
  ownBike?: boolean;
}

export interface Charge {
  label: string;
  amount: number;
  time: number;
}
