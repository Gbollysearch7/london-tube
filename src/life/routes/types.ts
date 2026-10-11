// Owned by the routines module: remembered routes (one-tap trips) and today's fare-cap tally.

export interface RememberedRoute {
  from: string;
  to: string;
  /** Link ids of the last route ridden between these stops. */
  links: string[];
  count: number;
  /** Game day it was last used. */
  lastDay: number;
}

/** What you've paid today towards the daily cap. */
export interface DayCap {
  day: number;
  rail: number;
  bus: number;
  /** Lowest and highest rail zone touched today (0 = no rail yet). */
  zlo: number;
  zhi: number;
  refunded: number;
  /** Refund paid on the most recent trip, so later hooks can see the net fare. */
  lastRefund?: number;
}

export interface RouteMemory {
  /** Keyed "from>to". */
  trips?: Record<string, RememberedRoute>;
  cap?: DayCap;
}
