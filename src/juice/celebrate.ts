import { buzz } from "./haptics";
import { sfx } from "./sound";
import { createThrottle, nowMs, prefersReducedMotion } from "./throttle";

export type CelebrationKind = "small" | "big" | "promotion";

/** Tube line colours, so the confetti looks like London. */
const COLOURS = ["#DC241F", "#0019A8", "#FFD300", "#00782A", "#9B0056", "#00A4A7", "#EE7C0E", "#6950A1"];
const COUNT: Record<CelebrationKind, number> = { small: 36, big: 140, promotion: 170 };

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  w: number;
  h: number;
  c: string;
  life: number;
}

let canvas: HTMLCanvasElement | null = null;
let bits: Bit[] = [];
let raf = 0;
const allow = createThrottle({ small: 800, big: 1200, promotion: 1200 });

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    // Inline styles so celebrate() works even where juice.css was never imported.
    canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999";
    document.body.appendChild(canvas);
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const g = canvas.getContext("2d");
  g?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}

function burst(kind: CelebrationKind) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const n = COUNT[kind];
  // Small bursts pop from the top centre; big ones rain from two side cannons.
  for (let i = 0; i < n; i++) {
    const side = kind === "small" ? 0.5 : i % 2 ? 0.1 : 0.9;
    const dir = kind === "small" ? Math.random() * 2 - 1 : side < 0.5 ? 1 : -1;
    bits.push({
      x: W * side,
      y: kind === "small" ? H * 0.25 : H * 0.85,
      vx: dir * (2 + Math.random() * (kind === "small" ? 3 : 6)),
      vy: kind === "small" ? -2 - Math.random() * 4 : -9 - Math.random() * 8,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 5,
      h: 3 + Math.random() * 4,
      c: COLOURS[i % COLOURS.length],
      life: 1,
    });
  }
}

function frame() {
  const g = canvas?.getContext("2d");
  if (!canvas || !g) return;
  const H = window.innerHeight;
  g.clearRect(0, 0, window.innerWidth, H);
  bits = bits.filter((b) => b.life > 0 && b.y < H + 20);
  for (const b of bits) {
    b.vy += 0.25;
    b.vx *= 0.985;
    b.x += b.vx;
    b.y += b.vy;
    b.r += b.vr;
    b.life -= 0.006;
    g.save();
    g.globalAlpha = Math.max(0, Math.min(1, b.life * 2));
    g.translate(b.x, b.y);
    g.rotate(b.r);
    g.fillStyle = b.c;
    g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)));
    g.restore();
  }
  if (bits.length) {
    raf = requestAnimationFrame(frame);
  } else {
    raf = 0;
    canvas.remove();
    canvas = null;
  }
}

/**
 * Celebrate: confetti (skipped for reduced motion) plus a matching sound and buzz.
 * "small" = quiet visual pop (no sound), "big" = fanfare, "promotion" = jingle. Never throws.
 */
export function celebrate(kind: CelebrationKind = "big"): void {
  try {
    if (!allow(kind, nowMs())) return;
    if (kind === "big") sfx("fanfare");
    if (kind === "promotion") sfx("promotion");
    if (kind !== "small") buzz("success");
    if (typeof window === "undefined" || prefersReducedMotion()) return;
    if (!ensureCanvas()) return;
    burst(kind);
    if (!raf) raf = requestAnimationFrame(frame);
  } catch {
    // Decoration only.
  }
}
