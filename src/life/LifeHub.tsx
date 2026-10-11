import { useEffect, useMemo, useState } from "react";
import MapView from "../components/MapView";
import { STATION } from "../game/network";
import type { Mission } from "../game/types";
import { isOnline } from "../online/logic";
import { getOnline, send, startDm, useOnline } from "../online/store";
import { setGameView } from "../phone/gameBridge";
import { AREA, BADGE, JOB, SHIFT_CUTOFF, SHIFT_START, VENUES, type Needs } from "./data";
import {
  NEED_LABEL,
  SHIFT_STYLES,
  activitiesHere,
  canSleep,
  canStartShift,
  closedAt,
  dayName,
  dayDisruption,
  dayStrike,
  dayWeather,
  describeDisruption,
  doActivity,
  fmtClock,
  hangOut,
  isWorkday,
  jobTitle,
  lifeLevel,
  mood,
  mustSleep,
  perfToPromote,
  sleep,
  tripMission,
  venuesAt,
  wage,
  week,
  workShift,
  xpForLevel,
  type DaySummary,
  type LifeState,
  type ShiftStyle,
} from "./engine";
import { act, dismissToast, emit, getLife, useLife } from "./store";
import StoryInbox from "./story/StoryInbox";
import SeasonCard from "./economy/SeasonCard";
import QuickTrips from "./routes/QuickTrips";
import type { Link } from "../game/types";
import { celebrate, sfx } from "../juice";

/** Where you are, in words other players will see. */
export function placeName(s: LifeState): string {
  if (s.location === s.home) return `Home in ${AREA[s.home].name}`;
  if (s.location === JOB[s.job].station && s.work !== "off") return `Work at ${STATION[s.location].name}`;
  return venuesAt(s.location)[0]?.name ?? STATION[s.location].name;
}

export const lifeStatusText = (s: LifeState) => `At ${placeName(s)} · Tube Life`;

function effectsText(e: Partial<Needs>): string {
  return (Object.keys(e) as (keyof Needs)[])
    .map((k) => `${NEED_LABEL[k].emoji}${(e[k] ?? 0) > 0 ? "+" : ""}${e[k]}`)
    .join(" ");
}

function duration(m: number) {
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
}

export default function LifeHub({
  onTravel,
  onRide,
  onMenu,
}: {
  onTravel: (mission: Mission, to: string) => void;
  onRide: (mission: Mission, route: Link[]) => void;
  onMenu: () => void;
}) {
  const { life, toasts } = useLife();
  const [selected, setSelected] = useState<string | null>(null);
  const [summary, setSummary] = useState<DaySummary | null>(null);

  useEffect(() => {
    if (life) setGameView({ screen: "life", lifeStatus: lifeStatusText(life), mission: null, route: [], journey: null, outcome: null });
  }, [life]);

  useEffect(() => {
    if (!toasts.length) return;
    const t = window.setTimeout(() => dismissToast(toasts[0].id), 4200);
    return () => window.clearTimeout(t);
  }, [toasts]);

  if (!life) return null;
  const s = life;
  const lvl = lifeLevel(s.xp);

  const goSleep = () => {
    // Through act(), so it works on the latest saved state (not this render's snapshot).
    let daySummary: DaySummary | null = null;
    let bedtime = 0;
    act((st) => {
      bedtime = st.clock;
      const r = sleep(st);
      daySummary = r.summary;
      return { state: r.state, events: r.events };
    });
    if (!daySummary) return;
    emit({ type: "sleep", summary: daySummary, bedtime });
    setSummary(daySummary);
    setSelected(null);
  };

  return (
    <div className="screen life">
      <header className="life-top">
        <button className="ghost small" onClick={onMenu}>
          ← Menu
        </button>
        <div className="life-clock">
          <span className="life-time">{fmtClock(s.clock)}</span>
          <span className="muted small">
            {dayName(s.day)} · Day {s.day} · Week {week(s.day)}
          </span>
        </div>
        <div className="life-stat">
          <span className="muted small">Bank</span>
          <strong className={s.money < 0 ? "neg" : ""}>£{s.money.toFixed(0)}</strong>
        </div>
        <div className="life-stat">
          <span className="muted small">Life level {lvl}</span>
          <div className="xpbar" title={`${s.xp} XP`}>
            <div style={{ width: `${Math.min(100, ((s.xp - xpForLevel(lvl)) / (xpForLevel(lvl + 1) - xpForLevel(lvl))) * 100)}%` }} />
          </div>
        </div>
        <div className="life-who">
          <span className="life-avatar">{s.avatar}</span>
          <span className="small">
            <strong>{s.name}</strong>
            <br />
            <span className="muted">{jobTitle(s)}</span>
          </span>
        </div>
      </header>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <button key={t.id} className="toast" onClick={() => dismissToast(t.id)}>
            {t.text}
          </button>
        ))}
      </div>

      <div className="layout">
        <section className="map-wrap">
          <LifeMap s={s} selected={selected} onSelect={setSelected} />
          <DayBanner s={s} />
        </section>

        <aside className="panel">
          <StoryInbox />
          <NeedsCard needs={s.needs} />
          <SeasonCard />
          <NowCard s={s} onTravel={(to) => onTravel(tripMission(s, to), to)} />
          {canStartShift(s) && <ShiftCard s={s} />}
          <ThingsToDo s={s} />
          <HangOut s={s} />
          <QuickTrips onRide={onRide} onPlan={(m) => onTravel(m, m.to)} />
          <GoCard s={s} selected={selected} onSelect={setSelected} onTravel={(to) => onTravel(tripMission(s, to), to)} />
          {canSleep(s) && (
            <div className="card">
              <button className="primary big wide" onClick={goSleep}>
                😴 Go to bed {s.clock < 21 * 60 ? "(early night)" : ""}
              </button>
              <p className="fineprint">Sleep until 07:00. Rent is due on Sunday night.</p>
            </div>
          )}
        </aside>
      </div>

      {mustSleep(s) && !summary && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-emoji">😵</div>
            <h3>You can't keep your eyes open</h3>
            <p>It's time for bed. Tomorrow is another day.</p>
            <button className="primary big" onClick={goSleep}>
              Sleep
            </button>
          </div>
        </div>
      )}

      {summary && <SummaryModal summary={summary} life={s} onClose={() => setSummary(null)} />}
    </div>
  );
}

function LifeMap({ s, selected, onSelect }: { s: LifeState; selected: string | null; onSelect: (id: string) => void }) {
  const targets = useMemo(() => {
    const set = new Set<string>([s.home, JOB[s.job].station, ...VENUES.map((v) => v.station)]);
    set.delete(s.location);
    return set;
  }, [s.home, s.job, s.location]);
  const mission: Mission = {
    id: "life-map",
    title: "",
    brief: "",
    from: s.location,
    to: selected ?? s.home,
    start: s.clock,
    deadline: s.clock,
    budget: 0,
    weekday: isWorkday(s.day),
    weather: dayWeather(s),
    closedLines: closedAt(s, s.clock),
    tip: "",
    delayedLines: dayDisruption(s).delayed,
  };
  return <MapView mission={mission} route={[]} current={s.location} targets={targets} selected={selected} onStationClick={(id) => targets.has(id) && onSelect(id)} showBuses={false} />;
}

function DayBanner({ s }: { s: LifeState }) {
  const strike = dayStrike(s);
  const d = dayDisruption(s);
  const disruption = describeDisruption(d);
  const rain = dayWeather(s) === "rain";
  const closed = closedAt(s, s.clock).filter((l) => l !== "river" && l !== strike);
  return (
    <div className="map-legend">
      <span>{rain ? "🌧 Rainy day: walking and cycling are slow" : "☀️ Dry day"}</span>
      {disruption && <span className={`chip ${d.kind === "strike" || d.kind === "closure" ? "danger" : "warn"}`}>⛔ {disruption}</span>}
      {closed.length > 0 && <span className="chip warn">🌙 Night: most lines closed</span>}
      <span className="muted">Tap a pulsing station to go there</span>
    </div>
  );
}

function NeedsCard({ needs }: { needs: Needs }) {
  const m = mood(needs);
  return (
    <div className="card needs">
      <div className="card-head">
        <h3>How you feel</h3>
        <span className={`mood ${m >= 60 ? "good" : m >= 35 ? "ok" : "bad"}`}>
          {m >= 75 ? "😄" : m >= 55 ? "🙂" : m >= 35 ? "😐" : "😣"} Mood {m}
        </span>
      </div>
      {(Object.keys(NEED_LABEL) as (keyof Needs)[]).map((k) => (
        <div key={k} className="need">
          <span>
            {NEED_LABEL[k].emoji} {NEED_LABEL[k].label}
          </span>
          <div className="need-bar">
            <div className={needs[k] < 25 ? "low" : needs[k] < 50 ? "mid" : ""} style={{ width: `${needs[k]}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function NowCard({ s, onTravel }: { s: LifeState; onTravel: (to: string) => void }) {
  const job = JOB[s.job];
  const atWork = s.location === job.station;
  let work: React.ReactNode = null;
  if (s.work === "pending" && !atWork) {
    work =
      s.clock < SHIFT_CUTOFF ? (
        <div className="work-due">
          <span>
            🏢 Shift at <strong>{STATION[job.station].name}</strong> {s.clock <= SHIFT_START ? `starts ${fmtClock(SHIFT_START)}` : "has started. You're late!"}
          </span>
          <button className="primary" onClick={() => onTravel(job.station)}>
            Go to work
          </button>
        </div>
      ) : (
        <p className="muted small">📉 It's after 11:00, so today counts as a missed workday.</p>
      )
  } else if (s.work === "done") work = <p className="muted small">✅ Work done for today. The evening is yours.</p>;
  else if (s.work === "off") work = <p className="muted small">🎉 Day off! Explore London.</p>;
  else if (s.work === "missed") work = <p className="muted small">📉 You missed work today.</p>;

  return (
    <div className="card">
      <h3>📍 {placeName(s)}</h3>
      {work}
      <p className="muted small">
        {jobTitle(s)} · £{wage(s)}/day · performance {Math.max(0, s.performance)}/{perfToPromote(s.level)}
        {s.level < 5 ? " to promotion" : ""}
      </p>
    </div>
  );
}

/** Work a shift and tell the other systems how it went. */
function runShift(style: ShiftStyle) {
  const before = getLife();
  if (!before) return;
  const r = act((st) => workShift(st, style));
  if (!r || r.state === before) return;
  const wages = r.state.ledger.find((l) => l.label.startsWith("Wages"));
  if (r.state.level > before.level) celebrate("promotion");
  else if (wages && wages.amount > 0) sfx("coin");
  emit({
    type: "shift",
    style,
    lateBy: Math.max(0, before.clock - SHIFT_START),
    earned: wages?.amount ?? 0,
    promoted: r.state.level > before.level,
  });
}

function ShiftCard({ s }: { s: LifeState }) {
  const late = Math.max(0, s.clock - SHIFT_START);
  return (
    <div className="card shift">
      <h3>🏢 You're at work{late ? `, ${late} min late` : " on time"}</h3>
      <p className="muted small">How will you spend the day? Your mood ({mood(s.needs)}) affects your performance.</p>
      <div className="shift-styles">
        {(Object.keys(SHIFT_STYLES) as ShiftStyle[]).map((k) => (
          <button key={k} className="choice" onClick={() => runShift(k)}>
            <strong>
              {SHIFT_STYLES[k].emoji} {SHIFT_STYLES[k].label}
            </strong>
            <span>{SHIFT_STYLES[k].hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ThingsToDo({ s }: { s: LifeState }) {
  const opts = activitiesHere(s);
  if (!opts.length) return null;
  return (
    <div className="card">
      <h3>Things to do here</h3>
      <ul className="options">
        {opts.map(({ activity: a, venue, blocked }) => (
          <li key={a.id}>
            <button
              className="option"
              disabled={!!blocked}
              onClick={() => {
                const r = act((st) => doActivity(st, a, venue));
                if (r && r.state !== s) emit({ type: "activity", activityId: a.id, venueId: venue?.id, cost: a.cost });
              }}
            >
              <span className="act-emoji">{a.emoji}</span>
              <span className="option-main">
                <span className="option-title">{a.label}</span>
                <span className="option-sub">
                  {blocked ?? `${a.cost ? `£${a.cost.toFixed(a.cost % 1 ? 2 : 0)}` : "Free"} · ${duration(a.minutes)} · ${effectsText(a.effects)}`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Real players who are at the same place right now. */
function HangOut({ s }: { s: LifeState }) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const mine = lifeStatusText(s);
  const here = Object.values(online.players).filter(
    (p) => p.id !== online.me?.id && p.status === mine && isOnline(p, online.presence) && s.location !== s.home && !s.hungOutToday?.includes(p.id),
  );
  if (!here.length) return null;
  const hang = async (id: string, name: string) => {
    setBusy(true);
    const r = act((st) => hangOut(st, id, name));
    if (r && r.state !== s) emit({ type: "hangout", playerId: id });
    try {
      const conv = await startDm(id);
      await send(conv, `👋 Hanging out with you at ${placeName(s)}!`, { silent: true });
    } catch {
      // The hang-out still counts if the text fails.
    }
    setBusy(false);
  };
  return (
    <div className="card hangout">
      <h3>🤝 Also here right now</h3>
      <ul className="plist">
        {here.map((p) => (
          <li key={p.id} className="row between">
            <span>
              {p.avatar} <strong>{p.name}</strong>
            </span>
            <button className="primary small" disabled={busy || !getOnline().me} onClick={() => void hang(p.id, p.name)}>
              Hang out (+💬35)
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GoCard({ s, selected, onSelect, onTravel }: { s: LifeState; selected: string | null; onSelect: (id: string | null) => void; onTravel: (to: string) => void }) {
  const dests = useMemo(() => {
    const list: { id: string; label: string; emoji: string; sub: string }[] = [];
    if (s.location !== s.home) list.push({ id: s.home, label: "Home", emoji: "🏠", sub: AREA[s.home].name });
    const ws = JOB[s.job].station;
    if (s.location !== ws && s.work === "pending" && s.clock < SHIFT_CUTOFF) list.push({ id: ws, label: "Work", emoji: "🏢", sub: STATION[ws].name });
    for (const v of VENUES) {
      if (v.station === s.location || list.some((d) => d.id === v.station)) continue;
      const open = v.activities.filter((a) => (a.opens ?? 0) <= s.clock + 60 && (a.closes ?? 9999) > s.clock + 30).length;
      list.push({ id: v.station, label: v.name, emoji: v.emoji, sub: open ? `${open} open soon` : "Closed now" });
    }
    return list;
  }, [s]);
  const sel = selected ? dests.find((d) => d.id === selected) : null;

  return (
    <div className="card">
      <h3>Go somewhere</h3>
      {sel && (
        <div className="go-selected">
          <span>
            {sel.emoji} <strong>{sel.label}</strong> <span className="muted small">{STATION[sel.id].name}</span>
          </span>
          <div className="row gap-s">
            <button className="primary" onClick={() => onTravel(sel.id)}>
              Plan trip ▶
            </button>
            <button className="ghost small" onClick={() => onSelect(null)}>
              ✕
            </button>
          </div>
        </div>
      )}
      <div className="dest-grid">
        {dests.map((d) => (
          <button key={d.id} className={`dest ${selected === d.id ? "on" : ""}`} onClick={() => onSelect(d.id)}>
            <span className="dest-emoji">{d.emoji}</span>
            <span className="dest-name">{d.label}</span>
            <span className="muted small">{d.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryModal({ summary, life, onClose }: { summary: DaySummary; life: LifeState; onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal summary">
        <div className="modal-emoji">🌙</div>
        <h3>{dayName(summary.day)} is done</h3>
        <div className="summary-grid">
          <div>
            <span className="muted small">Earned</span>
            <strong className="pos">+£{summary.earned}</strong>
          </div>
          <div>
            <span className="muted small">Spent</span>
            <strong className="neg">−£{summary.spent}</strong>
          </div>
          <div>
            <span className="muted small">XP</span>
            <strong>+{summary.xp}</strong>
          </div>
          <div>
            <span className="muted small">Mood</span>
            <strong>{summary.mood}</strong>
          </div>
        </div>
        {summary.promoted && <p className="highlight">📈 Promoted to {jobTitle(life)}!</p>}
        {summary.newBadges.length > 0 && (
          <p className="highlight">
            🏅 {summary.newBadges.map((b) => `${BADGE[b].emoji} ${BADGE[b].name}`).join(", ")}
          </p>
        )}
        {summary.notes.map((n) => (
          <p key={n} className="small">
            {n}
          </p>
        ))}
        <p className="muted small">Balance: £{life.money.toFixed(0)}</p>
        <button className="primary big" onClick={onClose}>
          Start {dayName(life.day)} ☀️
        </button>
      </div>
    </div>
  );
}
