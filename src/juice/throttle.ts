/**
 * Per-key rate limiter. Returns true when `key` may fire at `now` (ms) and records it.
 * Keeps juice tasteful at 4× / Skip speed, and stops React StrictMode's double effects
 * from playing every sound twice.
 */
export function createThrottle(gaps: Record<string, number>, fallbackGap = 0) {
  const last = new Map<string, number>();
  return (key: string, now: number): boolean => {
    const gap = gaps[key] ?? fallbackGap;
    const prev = last.get(key);
    if (prev !== undefined && now - prev < gap) return false;
    last.set(key, now);
    return true;
  };
}

/** Wall-clock milliseconds that work in browsers and tests alike. */
export function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** True when the player asked the OS for less motion. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
