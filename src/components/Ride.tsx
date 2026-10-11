import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "./MapView";
import ModeBadge, { MODE_ICON } from "./ModeBadge";
import { Journey, continues, mulberry32 } from "../game/engine";
import { fmtMoney, fmtTime } from "../game/format";
import { LINE, STATION, isRail, project } from "../game/network";
import { CALM_THRESHOLD } from "../game/scoring";
import { setGameView } from "../phone/gameBridge";
import { usePrefs } from "../phone/prefs";
import { announce, buzz, celebrate, hush, say, sfx, startRumble, stopRumble } from "../juice";
import "../juice/juice.css";
import type { Link, Mission } from "../game/types";

interface Props {
  mission: Mission;
  route: Link[];
  onFinish: (j: Journey) => void;
  onAbandon: () => void;
  /** Fixed RNG seed (e.g. the daily challenge, so everyone gets the same events). Random if omitted. */
  seed?: number;
  /** Starting playback speed, e.g. 4 for one-tap routine trips. */
  initialSpeed?: 1 | 2 | 4;
}

const SPEEDS = [1, 2, 4] as const;
/** Game minutes per real second at 1×. */
const MINUTES_PER_SECOND = 1;
const SKIP_SPEED = 20;

const ANNOUNCEMENTS: Record<string, string[]> = {
  rail: [
    "Please mind the gap between the train and the platform.",
    "Please move right down inside the carriage.",
    "Please keep your belongings with you at all times.",
    "Stand on the right on the escalators, please.",
    "Please let passengers off the train first.",
  ],
  bus: ["Bus stopping.", "Please hold on, the bus is about to move.", "Press the bell in good time for your stop."],
  boat: ["Welcome aboard. Refreshments are available at the bar.", "Look left for the best view of the city."],
  walk: ["Pavement shuffle engaged.", "Dodging a tourist with a wheelie case…", "Waiting at the crossing…"],
  bike: ["Pedalling hard up a slight incline.", "A bus is squeezing past. Hold your line.", "Bell, bell!"],
};

/** Modes you ride in (and so arrive at a stop in), as opposed to walking or cycling. */
const isVehicle = (mode: string) => mode !== "walk" && mode !== "bike";

/** Where this run on the current line ends, for "This is a … train to …". */
function runEnd(route: Link[], i: number): string {
  let j = i;
  while (j + 1 < route.length && continues(route[j], route[j + 1])) j++;
  return route[j].to;
}

function announcementsFor(mode: string) {
  if (mode === "bus" || mode === "boat" || mode === "walk" || mode === "bike") return ANNOUNCEMENTS[mode];
  return ANNOUNCEMENTS.rail;
}

export default function Ride({ mission, route, onFinish, onAbandon, seed, initialSpeed = 1 }: Props) {
  const journey = useMemo(() => new Journey(mission, route, mulberry32(seed ?? Date.now() & 0xffffffff)), [mission, route, seed]);
  const [, setTick] = useState(0);
  const [speed, setSpeed] = useState<number>(initialSpeed);
  const [paused, setPaused] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const finished = useRef(false);
  const prefs = usePrefs();
  const [shake, setShake] = useState(false);

  // Let the phone apps follow this ride live.
  useEffect(() => {
    setGameView({ journey });
    return () => setGameView({ journey: null });
  }, [journey]);

  // Animation loop: advance game time by real time × speed.
  useEffect(() => {
    let raf = 0;
    let finishTimer = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (!paused && !journey.pending && !journey.done) {
        journey.advance(dt * MINUTES_PER_SECOND * (skipping ? SKIP_SPEED : speed));
        if (journey.pending) setSkipping(false);
        setTick((t) => t + 1);
      }
      if (journey.done && !finished.current) {
        finished.current = true;
        finishTimer = window.setTimeout(() => onFinish(journey), 900);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      // Leaving the ride (abandon, or a re-run of this effect) must not fire a stale finish.
      if (finishTimer) {
        window.clearTimeout(finishTimer);
        finished.current = false;
      }
    };
  }, [journey, paused, speed, skipping, onFinish]);

  // Keyboard shortcuts: 1/2/4 for speed, space to pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (journey.pending) return;
      // Typing in the phone (or any field) must not change speed or pause the ride.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.key === "1" || e.key === "2" || e.key === "4") {
        setSpeed(Number(e.key));
        setSkipping(false);
        setPaused(false);
      }
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [journey]);

  const link = journey.link ?? route[route.length - 1];
  const from = project(STATION[link.from].lat, STATION[link.from].lon);
  const to = project(STATION[link.to].lat, STATION[link.to].lon);
  const t = journey.done ? 1 : journey.phase === "move" ? journey.progress : 0;
  const rider = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, mode: link.mode };

  const minutesLeft = mission.deadline - journey.clock;
  const timeState = minutesLeft < 0 ? "bad" : minutesLeft < 8 ? "warn" : "good";
  const moving = journey.phase === "move" && !paused && !journey.pending && !journey.done;
  const effectiveSpeed = skipping ? SKIP_SPEED : speed;
  const lines = announcementsFor(link.mode);
  const announcement = lines[Math.floor(journey.clock / 3) % lines.length];
  const remainingStops = route.slice(journey.legIdx).map((l) => l.to);

  // ---- Juice: every cue below fires on a state change, never per frame. ----
  const quiet = skipping || effectiveSpeed > 2; // no speech while fast-forwarding
  const quietRef = useRef(quiet);
  quietRef.current = quiet;

  // Arrivals, boarding, next-station calls.
  const prevLeg = useRef<{ idx: number; phase: string } | null>(null);
  useEffect(() => {
    const prev = prevLeg.current;
    prevLeg.current = { idx: journey.legIdx, phase: journey.phase };
    if (!prev) return; // nothing to react to on mount
    const cur = journey.link;
    const arrivedBy = journey.legIdx > prev.idx ? route[prev.idx] : undefined;
    if (arrivedBy && isVehicle(arrivedBy.mode)) sfx("chime");
    if (!cur || journey.phase !== "move" || (prev.idx === journey.legIdx && prev.phase === "move")) {
      // Stepping off a train (end of trip or interchange).
      if (arrivedBy && isRail(arrivedBy.mode) && !quietRef.current) announce(say.mindTheGap());
      return;
    }
    const prevLink = route[journey.legIdx - 1];
    const boarding = !continues(prevLink, cur);
    if (boarding && isRail(cur.mode)) {
      sfx("doors");
      if (!quietRef.current)
        announce(`${say.thisIs(LINE[cur.line].name, STATION[runEnd(route, journey.legIdx)].name)} ${say.nextStation(STATION[cur.to].name)}`);
    } else if (!boarding && isRail(cur.mode) && !quietRef.current) {
      announce(say.nextStation(STATION[cur.to].name));
    }
  }, [journey, route, journey.legIdx, journey.phase]);

  // Oyster beep for each new charge (touch in, cap adjustments, bus taps).
  const charges = journey.meter.charges.length;
  const seenCharges = useRef(0);
  useEffect(() => {
    if (charges > seenCharges.current) {
      sfx("oyster");
      buzz("tap");
    }
    seenCharges.current = charges;
  }, [charges]);

  // Something needs a decision.
  const hasEvent = !!journey.pending;
  useEffect(() => {
    if (hasEvent) {
      sfx("alert");
      buzz("event");
    }
  }, [hasEvent]);

  // Running late: one shake, a sting and a buzz at the moment it happens.
  const late = minutesLeft < 0 && !journey.done;
  const wasLate = useRef(late);
  useEffect(() => {
    if (late && !wasLate.current) {
      wasLate.current = true;
      setShake(true);
      sfx("late");
      buzz("late");
      const t = window.setTimeout(() => setShake(false), 600);
      return () => window.clearTimeout(t);
    }
    wasLate.current = late;
  }, [late]);
  const urgent = !journey.done && minutesLeft >= 0 && minutesLeft < 5;

  // Quiet rumble while a train is moving.
  const rumbling = moving && isRail(link.mode);
  useEffect(() => {
    if (rumbling && prefs.sound) startRumble();
    else stopRumble();
    return stopRumble;
  }, [rumbling, prefs.sound, prefs.volume]);

  // A small pop for arriving on time.
  useEffect(() => {
    if (journey.done && journey.clock <= mission.deadline) {
      celebrate("small");
      buzz("success");
    }
  }, [journey, journey.done, mission.deadline]);

  // Leaving the ride silences any announcement mid-sentence.
  useEffect(() => hush, []);

  const status = journey.done
    ? `Arrived at ${STATION[mission.to].name}!`
    : journey.phase === "wait"
      ? link.mode === "bike"
        ? `Unlocking a hire bike at ${STATION[link.from].name}`
        : `Waiting for the ${LINE[link.line].name} at ${STATION[link.from].name}`
      : link.mode === "walk"
        ? `Walking to ${STATION[link.to].name}`
        : link.mode === "bike"
          ? `Cycling to ${STATION[link.to].name}`
          : `${LINE[link.line].name} to ${STATION[link.to].name}`;

  return (
    <div className="screen ride">
      <header className="hud">
        <div className={`hud-clock ${timeState} ${urgent ? "juice-pulse" : ""} ${shake ? "juice-shake" : ""}`}>
          <span className="hud-big">{fmtTime(journey.clock)}</span>
          <span className="hud-sub">
            due {fmtTime(mission.deadline)} ·{" "}
            {minutesLeft >= 0 ? `${Math.floor(minutesLeft)} min to spare` : `${Math.ceil(-minutesLeft)} min late`}
          </span>
        </div>
        <div className={`hud-item ${journey.meter.total > mission.budget ? "bad" : ""}`}>
          <span className="hud-label">Spent</span>
          <span className="hud-val">
            {fmtMoney(journey.meter.total)} <span className="muted">/ {fmtMoney(mission.budget)}</span>
          </span>
        </div>
        <div className="hud-item stress">
          <span className="hud-label">Stress</span>
          <div className="meter">
            <div
              className={`meter-fill ${journey.stress > CALM_THRESHOLD ? "bad" : ""}`}
              style={{ width: `${journey.stress}%` }}
            />
          </div>
        </div>
      </header>

      <div className="layout">
        <section className="map-wrap">
          <MapView mission={mission} route={route} rider={rider} current={link.to} />
        </section>

        <aside className="panel">
          <div className={`window window-${link.mode} ${moving ? "moving" : ""}`} style={{ ["--speed" as string]: effectiveSpeed }}>
            <div className="window-scene" />
            <div className="window-frame">
              <span className="window-icon">{MODE_ICON[link.mode]}</span>
            </div>
          </div>

          <div className="card now">
            <div className="row gap-s">
              <ModeBadge lineId={link.line} short />
              <strong>{status}</strong>
            </div>
            {!journey.done && (
              <div className="progress">
                <div className="progress-fill" style={{ width: `${Math.round(journey.progress * 100)}%` }} />
              </div>
            )}
            <p className="announce">“{announcement}”</p>
            {remainingStops.length > 1 && (
              <p className="muted small">
                Next: {remainingStops.slice(1, 5).map((s) => STATION[s].name).join(" → ")}
                {remainingStops.length > 5 && " → …"}
              </p>
            )}
          </div>

          <div className="card controls">
            <div className="speed">
              <button className={`speed-btn ${paused ? "on" : ""}`} onClick={() => setPaused((p) => !p)}>
                {paused ? "Resume" : "Pause"}
              </button>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`speed-btn ${speed === s && !skipping ? "on" : ""}`}
                  onClick={() => {
                    setSpeed(s);
                    setSkipping(false);
                    setPaused(false);
                  }}
                >
                  {s}×
                </button>
              ))}
              <button
                className={`speed-btn skip ${skipping ? "on" : ""}`}
                onClick={() => {
                  setSkipping((v) => !v);
                  setPaused(false);
                }}
                title="Fast-forward until something happens"
              >
                ⏩ Skip
              </button>
            </div>
            <p className="fineprint">Bored? Ride at 2× or 4×, or skip ahead. Anything that needs your decision will still stop you.</p>
          </div>

          <div className="card log">
            <h3>Journey log</h3>
            <ul>
              {[
                ...journey.meter.charges.map((c) => ({ time: c.time, text: `${c.label}: ${fmtMoney(c.amount)}`, kind: "charge" })),
                ...journey.log.map((l) => ({ ...l, kind: "event" })),
              ]
                .sort((a, b) => b.time - a.time)
                .map((e, i) => (
                  <li key={i} className={e.kind}>
                    <span className="log-time">{fmtTime(e.time)}</span> {e.text}
                  </li>
                ))}
              {journey.meter.charges.length + journey.log.length === 0 && <li className="muted">Nothing yet. Enjoy the ride.</li>}
            </ul>
          </div>

          <button className="ghost small" onClick={onAbandon}>
            Abandon and replan
          </button>
        </aside>
      </div>

      {journey.pending && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="event-title">
          <div className="modal">
            <div className="modal-emoji">{journey.pending.emoji}</div>
            <h3 id="event-title">{journey.pending.title}</h3>
            <p>{journey.pending.text}</p>
            <div className="choices">
              {journey.pending.choices.map((c, i) => (
                <button
                  key={i}
                  className="choice"
                  onClick={() => {
                    journey.resolve(i);
                    setTick((t) => t + 1);
                  }}
                >
                  <strong>{c.label}</strong>
                  <span>{c.hint}</span>
                </button>
              ))}
            </div>
            <p className="fineprint">
              {fmtTime(journey.clock)} · {fmtMoney(journey.meter.total)} spent
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
