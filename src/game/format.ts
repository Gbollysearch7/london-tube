export function fmtTime(minutes: number): string {
  const m = Math.floor(minutes);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function fmtMoney(n: number): string {
  return `£${n.toFixed(2)}`;
}

export function fmtDelta(n: number, unit: "min" | "£"): string {
  if (unit === "£") return `${n >= 0 ? "+" : "−"}£${Math.abs(n).toFixed(2)}`;
  return `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))} min`;
}
