import { useCallback, useEffect, useState } from "react";
import Brief from "../components/Brief";
import { fmtMoney, fmtTime } from "../game/format";
import type { Outcome } from "../game/scoring";
import type { Link, Mission } from "../game/types";
import { fetchLineStatus } from "../live/tfl";
import { connect, loadDailyBoard, loadDailyRank, loadSharedDaily, submitDailyRun, useOnline, type DailyBoardRow, type DailyRank } from "../online/store";
import { challengeDay, challengeNumber, dailyStreak, fmtChallengeDate, fmtCountdown, generateDaily, liveWindow, msUntilNextChallenge, shareText, type DailyStreak } from "./daily";
import { dailyReward } from "./engine";
import { act, dailyStarted, emit, getLife, loadDailyRecords, markDailyStarted, saveDailyRecord, toast } from "./store";
import "./daily.css";

export interface TodayChallenge {
  day: string;
  mission: Mission;
  source: string;
}

let today: Promise<TodayChallenge> | null = null;
let todayKey = "";

/** Today's shared challenge. Built by whoever plays first (live TfL closures 07:00–22:00); cached per day. */
export function getTodayChallenge(): Promise<TodayChallenge> {
  const now = Date.now();
  const day = challengeDay(now);
  if (today && todayKey === day) return today;
  todayKey = day;
  const make = async () => {
    let live: string[] = [];
    if (liveWindow(now)) {
      try {
        live = (await fetchLineStatus()).filter((l) => l.level === "bad" && l.status !== "Service Closed").map((l) => l.id);
      } catch {
        // TfL unreachable: fall back to the date's seeded closures.
      }
    }
    const d = generateDaily(day, live);
    return { mission: d.mission, source: d.source };
  };
  today = (async () => {
    await connect().catch(() => {});
    const shared = await loadSharedDaily<Mission>(day, make).catch(() => null);
    const got = shared ?? (await make());
    return { day, mission: got.mission, source: got.source };
  })();
  today.catch(() => {
    today = null;
  });
  return today;
}

/** The streak over this browser's scored daily runs. */
export function myDailyStreak(day: string = challengeDay(Date.now())): DailyStreak {
  return dailyStreak(Object.keys(loadDailyRecords()), day);
}

/** Re-renders every 30s so countdowns tick and a rollover is noticed. */
export function useNow(every = 30_000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

/** Top 25 plus your own rank (even outside the top 25), with a refresh. */
export function useDailyBoard(day: string | undefined) {
  const online = useOnline();
  const [rows, setRows] = useState<DailyBoardRow[] | null>(null);
  const [rank, setRank] = useState<DailyRank | null>(null);
  const [loading, setLoading] = useState(false);
  const meId = online.me?.id;
  // meId is a dependency so the rank appears once the player's identity is known.
  const refresh = useCallback(async () => {
    if (!day) return;
    setLoading(true);
    try {
      const [r, me] = await Promise.all([loadDailyBoard(day), meId ? loadDailyRank(day).catch(() => null) : Promise.resolve(null)]);
      setRows(r);
      setRank(me);
    } finally {
      setLoading(false);
    }
  }, [day, meId]);
  useEffect(() => {
    refresh().catch(() => setRows([]));
  }, [refresh]);
  return { rows, rank, loading, refresh, meId };
}

// --- share card (kept per browser, so it can be re-shared from the daily screen later) ---

const slot = typeof location !== "undefined" ? new URLSearchParams(location.search).get("player")?.replace(/\W/g, "").slice(0, 12) : "";
const SHARE_KEY = `mind-the-gap:daily-share:v1${slot ? `-${slot}` : ""}`;

interface ShareRun {
  stars: number;
  arrival: number;
  cost: number;
  route: { line: string; mode: Link["mode"] }[];
}

function loadShareRun(day: string): ShareRun | undefined {
  try {
    return (JSON.parse(localStorage.getItem(SHARE_KEY) ?? "{}") as Record<string, ShareRun>)[day];
  } catch {
    return undefined;
  }
}

function saveShareRun(day: string, run: ShareRun) {
  try {
    // Only the last fortnight is worth keeping.
    const all = JSON.parse(localStorage.getItem(SHARE_KEY) ?? "{}") as Record<string, ShareRun>;
    const keep = Object.keys(all).sort().slice(-13);
    localStorage.setItem(SHARE_KEY, JSON.stringify({ ...Object.fromEntries(keep.map((k) => [k, all[k]])), [day]: run }));
  } catch {
    // ignore
  }
}

const shareLink = () => (typeof location !== "undefined" ? `${location.origin}${location.pathname}` : "");

function ShareCard({ day, run, streak }: { day: string; run: ShareRun; streak: number }) {
  const [copied, setCopied] = useState(false);
  const text = shareText({ day, ...run, streak, link: shareLink() });
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the text is on screen to copy by hand.
    }
  };
  return (
    <div className="daily-share">
      <pre className="daily-share-text">{text}</pre>
      <div className="row gap-s wrap center">
        <button className={copied ? "primary" : "ghost"} onClick={copy}>
          {copied ? "Copied!" : "📋 Copy result"}
        </button>
        {canShare && (
          <button className="ghost" onClick={() => navigator.share({ text }).catch(() => {})}>
            📤 Share
          </button>
        )}
      </div>
    </div>
  );
}

// --- shared pieces ---

function BoardRow({ r, rank, me }: { r: DailyBoardRow; rank: number; me: boolean }) {
  return (
    <li className={me ? "me" : ""}>
      <span className="rank">{rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : rank}</span>
      <span>
        {r.profiles?.avatar ?? "🙂"} {r.profiles?.name ?? "Player"}
      </span>
      <span className="muted small">
        {"★".repeat(r.stars)} · {fmtTime(r.arrival)} · {fmtMoney(Number(r.cost))}
      </span>
      <strong>{r.points.toLocaleString()}</strong>
    </li>
  );
}

function Board({ rows, meId, rank }: { rows: DailyBoardRow[]; meId?: string; rank: DailyRank | null }) {
  if (!rows.length) return <p className="muted small">No runs yet today. Be the first on the board!</p>;
  const inTop = !!meId && rows.some((r) => r.user_id === meId);
  return (
    <>
      <ol className="daily-board">
        {rows.map((r, i) => (
          <BoardRow key={r.user_id} r={r} rank={i + 1} me={r.user_id === meId} />
        ))}
        {rank && !inTop && (
          <>
            <li className="daily-board-gap" aria-hidden>
              ⋮
            </li>
            <BoardRow r={rank.row} rank={rank.rank} me />
          </>
        )}
      </ol>
      {rank && (
        <p className="daily-rank">
          You're <strong>#{rank.rank}</strong> of {rank.total.toLocaleString()}
        </p>
      )}
    </>
  );
}

function BoardCard({ day, title = "Today's leaderboard" }: { day: string; title?: string }) {
  const online = useOnline();
  const { rows, rank, loading, refresh, meId } = useDailyBoard(day);
  return (
    <div className="card daily-board-card">
      <div className="row between">
        <h3>{title}</h3>
        <button className="ghost small" onClick={() => refresh().catch(() => {})} disabled={loading}>
          {loading ? "…" : "↻ Refresh"}
        </button>
      </div>
      {online.status.kind !== "ready" && <p className="muted small">Open the phone and pick a name in Messages to join the leaderboard.</p>}
      {rows ? <Board rows={rows} meId={meId} rank={rank} /> : <p className="muted small">Loading…</p>}
    </div>
  );
}

/** "🔥 4-day streak" with don't-break-it copy. */
export function streakCopy(s: DailyStreak): { headline: string; sub: string } {
  if (s.playedToday) return { headline: `🔥 ${s.current}-day streak`, sub: `Come back tomorrow to make it ${s.current + 1}.` };
  if (s.atRisk) return { headline: `🔥 ${s.current}-day streak`, sub: "Play today so you don't break your streak!" };
  return { headline: "🔥 Start a streak", sub: s.best ? `Your best is ${s.best} days. Play today to start again.` : "Play every day to build a streak." };
}

function StreakBanner({ streak }: { streak: DailyStreak }) {
  const c = streakCopy(streak);
  return (
    <div className={`daily-streak ${streak.atRisk ? "at-risk" : ""}`}>
      <strong>{c.headline}</strong>
      <span className="muted small">{c.sub}</span>
    </div>
  );
}

function Countdown({ now }: { now: number }) {
  return <p className="daily-countdown">⏳ Next challenge in {fmtCountdown(msUntilNextChallenge(now))}</p>;
}

function Masthead({ day, source }: { day: string; source?: string }) {
  return (
    <div className="daily-masthead">
      <span className="daily-num">#{challengeNumber(day)}</span>
      <span className="daily-date">{fmtChallengeDate(day)}</span>
      {source === "live" ? <span className="chip live-chip">🔴 Live from TfL</span> : source ? <span className="chip">🎲 Seeded closures</span> : null}
    </div>
  );
}

// --- screens ---

export function DailyScreen({ onPlay, onBack }: { onPlay: (m: Mission) => void; onBack: () => void }) {
  const now = useNow();
  const [challenge, setChallenge] = useState<TodayChallenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const record = challenge ? loadDailyRecords()[challenge.day] : undefined;
  const streak = myDailyStreak(challengeDay(now));
  const share = challenge && record ? loadShareRun(challenge.day) : undefined;
  const rolledOver = !!challenge && challengeDay(now) !== challenge.day;

  useEffect(() => {
    setError(null);
    getTodayChallenge()
      .then(setChallenge)
      .catch(() => setError("Couldn't build today's challenge. Check your connection."));
  }, [nonce]);

  return (
    <div className="screen daily">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          ← Menu
        </button>
        <h2>📅 Today in London</h2>
        <span />
      </header>
      {error && <p className="perror center">{error}</p>}
      {!challenge && !error && <p className="muted center">Checking the network with TfL…</p>}
      {rolledOver && (
        <div className="card daily-new">
          <strong>A new challenge is ready.</strong>
          <button className="primary" onClick={() => setNonce((n) => n + 1)}>
            Load today's challenge
          </button>
        </div>
      )}
      {challenge && (
        <div className="daily-grid">
          <div>
            <Masthead day={challenge.day} source={challenge.source} />
            <Brief mission={challenge.mission} />
            <div className="card daily-cta">
              <StreakBanner streak={streak} />
              {record ? (
                <>
                  <p>
                    Today's scored run: <strong>{"★".repeat(record.stars) || "late"}</strong> · {record.points.toLocaleString()} pts.
                  </p>
                  {share && <ShareCard day={challenge.day} run={share} streak={streak.current} />}
                  <button className="ghost" onClick={() => onPlay({ ...challenge.mission, title: "Today in London · Practice" })}>
                    🔁 Practice run (not scored)
                  </button>
                </>
              ) : (
                <>
                  <p>One shot: your first run today goes on the leaderboard{getLife() ? " and pays into your London Life bank (£15 a star)" : ""}.</p>
                  <button className="primary big" onClick={() => onPlay(challenge.mission)}>
                    Play today's challenge ▶
                  </button>
                </>
              )}
              <Countdown now={now} />
            </div>
          </div>
          <BoardCard day={challenge.day} />
        </div>
      )}
    </div>
  );
}

interface RunResult {
  practice: boolean;
  note: string;
}

/** Each finished run is processed exactly once, even if the result screen mounts twice. */
const processed = new WeakMap<Outcome, Promise<RunResult>>();

function processRun(day: string, outcome: Outcome, route: Link[] | undefined): Promise<RunResult> {
  let p = processed.get(outcome);
  if (!p) {
    // Decided synchronously, so a second mount can't mistake the first run for a practice.
    const practice = !!loadDailyRecords()[day];
    p = (async () => {
      if (practice) return { practice, note: "Only your first run of the day is scored." };
      let reward = false;
      if (getLife()) {
        act((s) => dailyReward(s, outcome.stars));
        emit({ type: "daily", stars: outcome.stars });
        reward = true;
      }
      saveDailyRecord(day, { stars: outcome.stars, points: outcome.points, rewarded: reward });
      saveShareRun(day, { stars: outcome.stars, arrival: Math.round(outcome.arrival), cost: outcome.cost, route: (route ?? []).map((l) => ({ line: l.line, mode: l.mode })) });
      const posted = await submitDailyRun(day, { points: outcome.points, stars: outcome.stars, arrival: Math.round(outcome.arrival), cost: outcome.cost });
      return { practice, note: posted ? "Your run is on today's leaderboard." : "Pick a name in the phone's Messages app to join the leaderboard next time." };
    })();
    processed.set(outcome, p);
  }
  return p;
}

/** After a daily run: post the first run, pay the reward once, show the share card and board. */
export function DailyResult({ day, outcome, route, onAgain, onMenu }: { day: string; outcome: Outcome; route?: Link[]; onAgain: () => void; onMenu: () => void }) {
  const now = useNow();
  const [res, setRes] = useState<RunResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    processRun(day, outcome, route).then((r) => {
      if (!cancelled) setRes(r);
    });
    return () => {
      cancelled = true;
    };
  }, [day, outcome, route]);

  const streak = myDailyStreak(day);
  // The share card always shows the scored run, never a practice.
  const share = res ? loadShareRun(day) : undefined;

  return (
    <div className="screen result">
      <div className="result-card daily-result">
        <p className="eyebrow">
          Today in London #{challengeNumber(day)} · {fmtChallengeDate(day)}
        </p>
        {res?.practice && <p className="chip daily-practice">🔁 Practice run · not scored</p>}
        <h2>{outcome.onTime ? (outcome.stars === 3 ? "Perfect run!" : "Made it!") : "Late!"}</h2>
        <div className="stars">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < outcome.stars ? "star on" : "star"}>
              ★
            </span>
          ))}
        </div>
        <div className="score">
          <span className="score-val">{outcome.points.toLocaleString()}</span>
          <span className="muted">points</span>
        </div>
        {res && <p className="muted small">{res.note}</p>}
        {res && <StreakBanner streak={streak} />}
        {share && (
          <>
            {res?.practice && <p className="muted small">Your share card shows today's scored run.</p>}
            <ShareCard day={day} run={share} streak={streak.current} />
          </>
        )}
        <Countdown now={now} />
        {res && <BoardCard day={day} />}
        <div className="row gap-s wrap center">
          <button className="ghost" onClick={onMenu}>
            Menu
          </button>
          <button className="primary" onClick={onAgain}>
            🔁 Practice run
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Called when a daily ride starts. The first scored start claims today's one shot; if that run was
 * abandoned, it counts as not finished and every later run is practice.
 */
export function claimDailyAttempt(mission: Mission) {
  if (mission.title.includes("Practice")) return;
  const day = mission.id.replace("daily-", "");
  if (loadDailyRecords()[day]) return;
  if (dailyStarted(day)) {
    saveDailyRecord(day, { stars: 0, points: 0, rewarded: false });
    toast("🔁 You abandoned today's scored run, so this one is practice.");
    return;
  }
  markDailyStarted(day);
}
