import { useCallback, useEffect, useRef, useState } from "react";

// Live data from the TfL Unified API (api.tfl.gov.uk). Works without a key at low volume;
// set VITE_TFL_APP_KEY (free from api-portal.tfl.gov.uk) for higher limits.
// Used for the phone's live apps only: missions stay on the game's own, solvable network.
// Attribution required by TfL: "Powered by TfL Open Data".

const BASE = "https://api.tfl.gov.uk";
const APP_KEY = import.meta.env.VITE_TFL_APP_KEY as string | undefined;

/** TfL station ids (tube 940G…, rail/Overground/Elizabeth 910G…, DLR 940GZZDL…) for each game station. */
export const STATION_NAPTAN: Record<string, string[]> = {
  paddington: ["940GZZLUPAH", "940GZZLUPAC", "910GPADTLL"],
  baker: ["940GZZLUBST"],
  nhg: ["940GZZLUNHG"],
  shepherds: ["940GZZLUSBC", "910GSHPDSB"],
  oxford: ["940GZZLUOXC"],
  greenpark: ["940GZZLUGPK"],
  victoria: ["940GZZLUVIC"],
  westminster: ["940GZZLUWSM"],
  waterloo: ["940GZZLUWLO"],
  leicester: ["940GZZLULSQ"],
  tcr: ["940GZZLUTCR", "910GTOTCTRD"],
  euston: ["940GZZLUEUS", "910GEUSTON"],
  kingscross: ["940GZZLUKSX"],
  camden: ["940GZZLUCTN"],
  highbury: ["940GZZLUHAI", "910GHGHI"],
  farringdon: ["940GZZLUFCN", "910GFRNDXR"],
  bank: ["940GZZLUBNK", "940GZZDLBNK"],
  liverpool: ["940GZZLULVT", "910GLIVSTLL", "910GLIVST"],
  shoreditch: ["910GSHRDHST"],
  whitechapel: ["940GZZLUWPL", "910GWCHAPEL", "910GWCHAPXR"],
  londonbridge: ["940GZZLULNB"],
  canadawater: ["940GZZLUCWR", "910GCNDAW"],
  canarywharf: ["940GZZLUCYF", "910GCANWHRF", "940GZZDLCAN"],
  stratford: ["940GZZLUSTD", "910GSTFD", "940GZZDLSTD"],
  hackney: ["910GHACKNYC"],
  vauxhall: ["940GZZLUVXL"],
  stockwell: ["940GZZLUSKW"],
  brixton: ["940GZZLUBXN"],
  claphamcommon: ["940GZZLUCPC"],
  claphamjn: ["910GCLPHMJ1", "910GCLPHMJC"],
  peckham: ["910GPCKHMRY"],
};

/** Official-ish line colours for lines the game network doesn't draw. */
export const TFL_LINE_COLORS: Record<string, string> = {
  bakerloo: "#a0522d",
  central: "#e1251b",
  circle: "#ffd329",
  district: "#00782a",
  "hammersmith-city": "#f4a9be",
  jubilee: "#8b959e",
  metropolitan: "#9b0058",
  northern: "#8f8f8f",
  piccadilly: "#2546a8",
  victoria: "#0a9cda",
  "waterloo-city": "#93ceba",
  elizabeth: "#7d4fb8",
  dlr: "#00afad",
  liberty: "#676767",
  lioness: "#f1b41c",
  mildmay: "#2f8fd8",
  suffragette: "#59c274",
  weaver: "#9b2e5e",
  windrush: "#ee7c0e",
};

const MODES = new Set(["tube", "overground", "elizabeth-line", "dlr"]);

export type StatusLevel = "good" | "warn" | "bad";

/**
 * TfL severity codes are not ordered by badness (20 = Service Closed, 10 = Good Service),
 * so map them explicitly. Codes from /Line/Meta/Severity.
 */
export function severityLevel(code: number): StatusLevel {
  if (code === 10 || code === 18) return "good"; // Good Service, No Issues
  if ([0, 1, 2, 3, 4, 5, 6, 11, 16, 20].includes(code)) return "bad"; // closures, suspensions, severe delays, not running
  return "warn"; // minor delays, reduced service, info, diversions…
}

const LEVEL_ORDER: Record<StatusLevel, number> = { bad: 0, warn: 1, good: 2 };

export interface LiveLine {
  id: string;
  name: string;
  /** e.g. "Good Service", "Minor Delays", "Part Closure", "Service Closed" */
  status: string;
  severity: number;
  level: StatusLevel;
  reason: string | null;
}

export interface LiveArrival {
  id: string;
  lineId: string;
  lineName: string;
  platform: string;
  destination: string;
  seconds: number;
}

function url(path: string): string {
  return `${BASE}${path}${APP_KEY ? `${path.includes("?") ? "&" : "?"}app_key=${encodeURIComponent(APP_KEY)}` : ""}`;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url(path), { signal });
  if (res.status === 429) throw new Error("TfL is busy right now (rate limit). Try again in a minute.");
  if (!res.ok) throw new Error(`TfL returned ${res.status}.`);
  return (await res.json()) as T;
}

/** "Elephant & Castle Underground Station" → "Elephant & Castle" */
export function cleanStationName(name: string | undefined): string {
  if (!name) return "Check front of train";
  return name.replace(/ (Underground|Rail|DLR) Station$/, "").replace(/ \(.*\)$/, "").trim();
}

interface TflLineStatusRow {
  id: string;
  name: string;
  lineStatuses: { statusSeverity: number; statusSeverityDescription: string; reason?: string }[];
}

export function parseLineStatus(rows: TflLineStatusRow[]): LiveLine[] {
  return rows
    .map((r) => {
      // A line can carry several statuses (e.g. part closure + minor delays); show the worst.
      const worst = [...r.lineStatuses].sort(
        (a, b) => LEVEL_ORDER[severityLevel(a.statusSeverity)] - LEVEL_ORDER[severityLevel(b.statusSeverity)],
      )[0];
      const severity = worst?.statusSeverity ?? 10;
      return {
        id: r.id,
        name: r.name,
        status: worst?.statusSeverityDescription ?? "Unknown",
        severity,
        level: severityLevel(severity),
        reason: r.lineStatuses.map((s) => s.reason).filter(Boolean).join("\n\n") || null,
      };
    })
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.name.localeCompare(b.name));
}

interface TflArrivalRow {
  id: string;
  lineId: string;
  lineName: string;
  modeName: string;
  platformName?: string;
  destinationName?: string;
  towards?: string;
  timeToStation: number;
}

export function parseArrivals(rows: TflArrivalRow[]): LiveArrival[] {
  const seen = new Set<string>();
  return rows
    .filter((r) => MODES.has(r.modeName))
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    .map((r) => ({
      id: r.id,
      lineId: r.lineId,
      lineName: r.lineName,
      platform: (r.platformName ?? "").replace(/^null$/, "").trim(),
      destination: r.destinationName ? cleanStationName(r.destinationName) : r.towards || "Check front of train",
      seconds: Math.max(0, r.timeToStation),
    }))
    .sort((a, b) => a.seconds - b.seconds);
}

// Small in-memory cache so reopening an app doesn't hammer the API.
const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

function cached<T>(key: string, maxAgeMs: number, load: () => Promise<T>, force = false): Promise<T> {
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < maxAgeMs) return Promise.resolve(hit.data as T);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = load()
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function fetchLineStatus(force = false): Promise<LiveLine[]> {
  return cached("status", 60_000, async () => parseLineStatus(await getJson<TflLineStatusRow[]>("/Line/Mode/tube,elizabeth-line,overground,dlr/Status")), force);
}

export function fetchArrivals(stationId: string, force = false): Promise<LiveArrival[]> {
  const ids = STATION_NAPTAN[stationId] ?? [];
  return cached(`arr:${stationId}`, 25_000, async () => {
    // TfL takes one stop per request; a game station maps to at most a few.
    const parts = await Promise.all(ids.map((id) => getJson<TflArrivalRow[]>(`/StopPoint/${id}/Arrivals`)));
    return parseArrivals(parts.flat());
  }, force);
}

/** Load + auto-refresh helper for the live apps. */
export function useLive<T>(load: (force: boolean) => Promise<T>, everyMs: number, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    try {
      setData(await loadRef.current(force));
      setError(null);
      setUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error && !/fetch/i.test(e.message) ? e.message : "Can't reach TfL. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setData(null);
    void refresh();
    const id = window.setInterval(() => void refresh(), everyMs);
    return () => window.clearInterval(id);
  }, deps);

  return { data, error, loading, updated, refresh: () => refresh(true) };
}
