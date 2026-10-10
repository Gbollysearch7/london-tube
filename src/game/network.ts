import type { Line, Link, Mode, Station } from "./types";

// A simplified, game-scale London. Station positions are real; the lines are
// trimmed to a handful of key stops each, so journey times are approximate.

export const STATIONS: Station[] = [
  { id: "paddington", name: "Paddington", zone: 1, lat: 51.5154, lon: -0.1755, label: { dx: -9, dy: -6, anchor: "end" } },
  { id: "baker", name: "Baker Street", zone: 1, lat: 51.5226, lon: -0.1571, label: { dx: -9, dy: -8, anchor: "end" } },
  { id: "nhg", name: "Notting Hill Gate", zone: 1, lat: 51.5094, lon: -0.1967, label: { dx: -2, dy: 18, anchor: "middle" } },
  { id: "shepherds", name: "Shepherd's Bush", zone: 2, lat: 51.5046, lon: -0.2187, label: { dx: -6, dy: 20 } },
  { id: "oxford", name: "Oxford Circus", zone: 1, lat: 51.5152, lon: -0.1415, label: { dx: -9, dy: -8, anchor: "end" } },
  { id: "greenpark", name: "Green Park", zone: 1, lat: 51.5067, lon: -0.1428, label: { dx: -10, dy: 4, anchor: "end" } },
  { id: "victoria", name: "Victoria", zone: 1, lat: 51.4965, lon: -0.1447, label: { dx: -10, dy: 4, anchor: "end" } },
  { id: "westminster", name: "Westminster", zone: 1, lat: 51.501, lon: -0.1254, label: { dx: -10, dy: 14, anchor: "end" } },
  { id: "waterloo", name: "Waterloo", zone: 1, lat: 51.5031, lon: -0.1132, label: { dx: 10, dy: 5 } },
  { id: "leicester", name: "Leicester Sq", zone: 1, lat: 51.5113, lon: -0.1281, label: { dx: 8, dy: 14 } },
  { id: "tcr", name: "Tottenham Ct Rd", zone: 1, lat: 51.5165, lon: -0.131, label: { dx: 9, dy: -6 } },
  { id: "euston", name: "Euston", zone: 1, lat: 51.5282, lon: -0.1337, label: { dx: -9, dy: -6, anchor: "end" } },
  { id: "kingscross", name: "King's Cross", zone: 1, lat: 51.5308, lon: -0.1238, label: { dx: 9, dy: -6 } },
  { id: "camden", name: "Camden Town", zone: 2, lat: 51.5392, lon: -0.1426, label: { dx: -9, dy: -6, anchor: "end" } },
  { id: "highbury", name: "Highbury & Islington", zone: 2, lat: 51.546, lon: -0.104, label: { dx: 0, dy: -12, anchor: "middle" } },
  { id: "farringdon", name: "Farringdon", zone: 1, lat: 51.5203, lon: -0.1053, label: { dx: -9, dy: -7, anchor: "end" } },
  { id: "bank", name: "Bank", zone: 1, lat: 51.5133, lon: -0.0886, label: { dx: -9, dy: 15, anchor: "end" } },
  { id: "liverpool", name: "Liverpool Street", zone: 1, lat: 51.5178, lon: -0.0823, label: { dx: 9, dy: 16 } },
  { id: "shoreditch", name: "Shoreditch High St", zone: 1, lat: 51.5233, lon: -0.0752, label: { dx: 9, dy: -6 } },
  { id: "whitechapel", name: "Whitechapel", zone: 2, lat: 51.5194, lon: -0.0612, label: { dx: 9, dy: 4 } },
  { id: "londonbridge", name: "London Bridge", zone: 1, lat: 51.5052, lon: -0.0864, label: { dx: 4, dy: 20 } },
  { id: "canadawater", name: "Canada Water", zone: 2, lat: 51.4982, lon: -0.0502, label: { dx: 0, dy: 20, anchor: "middle" } },
  { id: "canarywharf", name: "Canary Wharf", zone: 2, lat: 51.5036, lon: -0.0195, label: { dx: 9, dy: 16 } },
  { id: "stratford", name: "Stratford", zone: 3, lat: 51.5416, lon: -0.0033, label: { dx: -9, dy: -8, anchor: "end" } },
  { id: "hackney", name: "Hackney Central", zone: 2, lat: 51.547, lon: -0.056, label: { dx: 0, dy: -12, anchor: "middle" } },
  { id: "vauxhall", name: "Vauxhall", zone: 1, lat: 51.4861, lon: -0.1253, label: { dx: 9, dy: 4 } },
  { id: "stockwell", name: "Stockwell", zone: 2, lat: 51.4723, lon: -0.1229, label: { dx: 9, dy: 4 } },
  { id: "brixton", name: "Brixton", zone: 2, lat: 51.4627, lon: -0.1145, label: { dx: 9, dy: 8 } },
  { id: "claphamcommon", name: "Clapham Common", zone: 2, lat: 51.4618, lon: -0.1384, label: { dx: -2, dy: 20, anchor: "middle" } },
  { id: "claphamjn", name: "Clapham Junction", zone: 2, lat: 51.4643, lon: -0.1704, label: { dx: 0, dy: 20, anchor: "middle" } },
  { id: "peckham", name: "Peckham Rye", zone: 2, lat: 51.47, lon: -0.069, label: { dx: 9, dy: 8 } },
];

export const STATION: Record<string, Station> = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

export const LINES: Line[] = [
  { id: "victoria", name: "Victoria line", mode: "tube", color: "#0a9cda" },
  { id: "northern", name: "Northern line", mode: "tube", color: "#8f8f8f" },
  { id: "central", name: "Central line", mode: "tube", color: "#e1251b" },
  { id: "jubilee", name: "Jubilee line", mode: "tube", color: "#8b959e" },
  { id: "bakerloo", name: "Bakerloo line", mode: "tube", color: "#a0522d" },
  { id: "piccadilly", name: "Piccadilly line", mode: "tube", color: "#2546a8" },
  { id: "elizabeth", name: "Elizabeth line", mode: "elizabeth", color: "#7d4fb8" },
  { id: "windrush", name: "Overground (Windrush)", mode: "overground", color: "#ee7c0e" },
  { id: "mildmay", name: "Overground (Mildmay)", mode: "overground", color: "#2f8fd8" },
  { id: "dlr", name: "DLR", mode: "dlr", color: "#00afad" },
  { id: "rail-waterloo", name: "Rail to Waterloo", mode: "rail", color: "#3b6e8f" },
  { id: "rail-victoria", name: "Rail to Victoria", mode: "rail", color: "#3b6e8f" },
  { id: "rail-crosscity", name: "Cross-City rail", mode: "rail", color: "#d0579b" },
  { id: "river", name: "River bus", mode: "boat", color: "#1f7fc4" },
  { id: "bus-2", name: "Bus 2", mode: "bus", color: "#d93a2b" },
  { id: "bus-12", name: "Bus 12", mode: "bus", color: "#d93a2b" },
  { id: "bus-25", name: "Bus 25", mode: "bus", color: "#d93a2b" },
  { id: "bus-35", name: "Bus 35", mode: "bus", color: "#d93a2b" },
  { id: "bus-37", name: "Bus 37", mode: "bus", color: "#d93a2b" },
  { id: "bus-38", name: "Bus 38", mode: "bus", color: "#d93a2b" },
  { id: "bus-47", name: "Bus 47", mode: "bus", color: "#d93a2b" },
  { id: "bus-55", name: "Bus 55", mode: "bus", color: "#d93a2b" },
  { id: "bus-73", name: "Bus 73", mode: "bus", color: "#d93a2b" },
  { id: "bus-88", name: "Bus 88", mode: "bus", color: "#d93a2b" },
  { id: "bus-94", name: "Bus 94", mode: "bus", color: "#d93a2b" },
  { id: "bus-135", name: "Bus 135", mode: "bus", color: "#d93a2b" },
  { id: "bus-148", name: "Bus 148", mode: "bus", color: "#d93a2b" },
  { id: "bus-159", name: "Bus 159", mode: "bus", color: "#d93a2b" },
  { id: "bus-205", name: "Bus 205", mode: "bus", color: "#d93a2b" },
  { id: "bus-214", name: "Bus 214", mode: "bus", color: "#d93a2b" },
  { id: "walk", name: "Walk", mode: "walk", color: "#6b7280" },
  { id: "bike", name: "Hire bike", mode: "bike", color: "#c0392b" },
];

export const LINE: Record<string, Line> = Object.fromEntries(LINES.map((l) => [l.id, l]));

const ROUTES: Record<string, string[][]> = {
  victoria: [["brixton", "stockwell", "vauxhall", "victoria", "greenpark", "oxford", "euston", "kingscross", "highbury"]],
  northern: [
    ["claphamcommon", "stockwell", "waterloo", "leicester", "tcr", "euston", "camden"],
    ["stockwell", "londonbridge", "bank", "kingscross", "camden"],
  ],
  central: [["shepherds", "nhg", "oxford", "tcr", "bank", "liverpool", "stratford"]],
  jubilee: [["baker", "greenpark", "westminster", "waterloo", "londonbridge", "canadawater", "canarywharf", "stratford"]],
  bakerloo: [["paddington", "baker", "oxford", "waterloo"]],
  piccadilly: [["kingscross", "leicester", "greenpark"]],
  elizabeth: [["paddington", "tcr", "farringdon", "liverpool", "whitechapel", "canarywharf"]],
  windrush: [["highbury", "shoreditch", "whitechapel", "canadawater", "peckham", "claphamjn"]],
  mildmay: [["highbury", "hackney", "stratford"]],
  dlr: [["bank", "canarywharf"], ["stratford", "canarywharf"]],
  "rail-waterloo": [["claphamjn", "vauxhall", "waterloo"]],
  "rail-victoria": [["claphamjn", "victoria"], ["brixton", "victoria"]],
  "rail-crosscity": [["farringdon", "londonbridge"]],
  river: [["waterloo", "londonbridge", "canarywharf"]],
  "bus-2": [["brixton", "stockwell", "vauxhall", "victoria", "baker"]],
  "bus-12": [["peckham", "westminster", "oxford"]],
  "bus-25": [["whitechapel", "stratford"]],
  "bus-35": [["claphamjn", "claphamcommon", "brixton", "londonbridge", "shoreditch"]],
  "bus-37": [["peckham", "brixton", "claphamcommon", "claphamjn"]],
  "bus-38": [["victoria", "greenpark", "leicester", "highbury", "hackney"]],
  "bus-47": [["shoreditch", "londonbridge", "canadawater"]],
  "bus-55": [["oxford", "tcr", "shoreditch", "hackney"]],
  "bus-73": [["oxford", "euston", "kingscross", "highbury"]],
  "bus-88": [["camden", "oxford", "westminster", "vauxhall", "claphamcommon"]],
  "bus-94": [["shepherds", "nhg", "oxford"]],
  "bus-135": [["liverpool", "canarywharf"]],
  "bus-148": [["shepherds", "nhg", "victoria", "westminster"]],
  "bus-159": [["brixton", "westminster", "oxford"]],
  "bus-205": [["paddington", "baker", "euston", "kingscross", "liverpool", "whitechapel"]],
  "bus-214": [["camden", "kingscross", "bank"]],
};

// Pairs close enough to walk (or cycle on a hire bike).
const STREETS: [string, string][] = [
  ["brixton", "stockwell"], ["stockwell", "vauxhall"], ["stockwell", "claphamcommon"],
  ["claphamcommon", "claphamjn"], ["vauxhall", "westminster"], ["vauxhall", "victoria"],
  ["victoria", "greenpark"], ["victoria", "westminster"], ["greenpark", "oxford"],
  ["greenpark", "leicester"], ["westminster", "waterloo"], ["westminster", "leicester"],
  ["waterloo", "leicester"], ["waterloo", "londonbridge"], ["leicester", "tcr"],
  ["oxford", "tcr"], ["oxford", "baker"], ["baker", "paddington"], ["paddington", "nhg"],
  ["nhg", "shepherds"], ["tcr", "euston"], ["euston", "kingscross"], ["euston", "camden"],
  ["kingscross", "farringdon"], ["kingscross", "highbury"], ["farringdon", "bank"],
  ["farringdon", "liverpool"], ["bank", "liverpool"], ["bank", "londonbridge"],
  ["liverpool", "shoreditch"], ["liverpool", "whitechapel"], ["shoreditch", "whitechapel"],
  ["shoreditch", "hackney"], ["highbury", "hackney"], ["hackney", "stratford"],
  ["londonbridge", "canadawater"], ["canadawater", "peckham"], ["peckham", "brixton"],
  ["canarywharf", "canadawater"],
];

/** Average door-to-door speeds (km/h), route detour factor and per-stop dwell (min). */
const SPEED: Record<Mode, { kmh: number; detour: number; dwell: number }> = {
  tube: { kmh: 30, detour: 1.1, dwell: 0.5 },
  elizabeth: { kmh: 45, detour: 1.1, dwell: 0.5 },
  overground: { kmh: 30, detour: 1.15, dwell: 0.5 },
  dlr: { kmh: 28, detour: 1.2, dwell: 0.5 },
  rail: { kmh: 40, detour: 1.1, dwell: 0.5 },
  bus: { kmh: 12, detour: 1.3, dwell: 0 },
  boat: { kmh: 24, detour: 1.4, dwell: 0 },
  walk: { kmh: 4.8, detour: 1.25, dwell: 0 },
  bike: { kmh: 13, detour: 1.25, dwell: 0 },
};

export function distanceKm(a: Station, b: Station): number {
  const dLat = (a.lat - b.lat) * 111.2;
  const dLon = (a.lon - b.lon) * 69.4;
  return Math.hypot(dLat, dLon);
}

function minutesFor(mode: Mode, a: Station, b: Station): number {
  const s = SPEED[mode];
  return Math.max(1, Math.round((distanceKm(a, b) * s.detour * 60) / s.kmh + s.dwell));
}

function buildLinks(): Link[] {
  const links: Link[] = [];
  const add = (from: string, to: string, line: string, mode: Mode) => {
    const minutes = minutesFor(mode, STATION[from], STATION[to]);
    links.push({ id: `${line}:${from}>${to}`, from, to, line, mode, minutes });
    links.push({ id: `${line}:${to}>${from}`, from: to, to: from, line, mode, minutes });
  };
  for (const [lineId, branches] of Object.entries(ROUTES)) {
    const mode = LINE[lineId].mode;
    for (const stops of branches) {
      for (let i = 0; i < stops.length - 1; i++) add(stops[i], stops[i + 1], lineId, mode);
    }
  }
  for (const [a, b] of STREETS) {
    add(a, b, "walk", "walk");
    add(a, b, "bike", "bike");
  }
  return links;
}

export const LINKS: Link[] = buildLinks();

export const LINKS_FROM: Record<string, Link[]> = (() => {
  const out: Record<string, Link[]> = {};
  for (const l of LINKS) (out[l.from] ??= []).push(l);
  return out;
})();

export const RAIL_MODES: Mode[] = ["tube", "elizabeth", "overground", "dlr", "rail"];
export const isRail = (mode: Mode) => RAIL_MODES.includes(mode);

// Map projection: real lat/lon onto a 1000-wide SVG.
const MIN_LON = -0.2187;
const MAX_LAT = 51.547;
const PX_PER_KM = 60;
export const MAP_W = 1000;
export const MAP_H = 650;

export function project(lat: number, lon: number): { x: number; y: number } {
  return {
    x: 40 + (lon - MIN_LON) * 69.4 * PX_PER_KM,
    y: 42 + (MAX_LAT - lat) * 111.2 * PX_PER_KM,
  };
}

// Rough course of the Thames through the map, as [lon, lat].
export const THAMES: [number, number][] = [
  [-0.24, 51.472], [-0.205, 51.469], [-0.185, 51.476], [-0.165, 51.482], [-0.145, 51.4845],
  [-0.128, 51.488], [-0.1225, 51.495], [-0.1222, 51.5008], [-0.1195, 51.507], [-0.11, 51.5095],
  [-0.098, 51.5098], [-0.087, 51.5085], [-0.075, 51.5055], [-0.06, 51.5045], [-0.047, 51.5075],
  [-0.033, 51.509], [-0.026, 51.502], [-0.022, 51.49], [-0.01, 51.4855], [0.0, 51.4875],
  [0.004, 51.495], [0.006, 51.51], [0.02, 51.512],
];
