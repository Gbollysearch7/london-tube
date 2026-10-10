export interface MissionRecord {
  stars: number;
  best: number;
}

export type Progress = Record<string, MissionRecord>;

const KEY = "mind-the-gap:progress:v1";

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Progress) : {};
  } catch {
    return {};
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable (private mode etc.); progress just won't persist.
  }
}

export function recordRun(p: Progress, missionId: string, stars: number, points: number): Progress {
  const prev = p[missionId] ?? { stars: 0, best: 0 };
  const next = { ...p, [missionId]: { stars: Math.max(prev.stars, stars), best: Math.max(prev.best, points) } };
  saveProgress(next);
  return next;
}
