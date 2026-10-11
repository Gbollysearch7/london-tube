import { useEffect, useState } from "react";
import { fmtMoney, fmtTime } from "../../game/format";
import { STATION } from "../../game/network";
import { AREAS, BADGES, JOB, JOBS } from "../../life/data";
import { changeJob, dayOfWeek, fmtClock, moveHome, perfToPromote, wage, type LifeState } from "../../life/engine";
import { challengeNumber, fmtChallengeDate, fmtCountdown, msUntilNextChallenge } from "../../life/daily";
import { getTodayChallenge, myDailyStreak, streakCopy, useDailyBoard, useNow, type TodayChallenge } from "../../life/DailyScreens";
import { act, loadDailyRecords, useLife } from "../../life/store";
import { navigateGame } from "../gameBridge";
import { closePhone } from "../nav";
import { AppHeader } from "../ui";

function NoLife({ title }: { title: string }) {
  return (
    <div className="app">
      <AppHeader title={title} />
      <div className="app-body center-col">
        <span className="weather-big">🏙️</span>
        <p>Start your Tube Life to use this app.</p>
        <button
          className="pbtn"
          onClick={() => {
            closePhone();
            navigateGame("life");
          }}
        >
          Start your life
        </button>
      </div>
    </div>
  );
}

function useLifeOr(title: string): LifeState | JSX.Element {
  const { life } = useLife();
  return life ?? <NoLife title={title} />;
}

export function BankApp() {
  const life = useLifeOr("🏦 Bank");
  if (!("version" in life)) return life;
  const s = life;
  const daysToRent = (6 - dayOfWeek(s.day) + 7) % 7;
  return (
    <div className="app">
      <AppHeader title="🏦 Bank" />
      <div className="app-body">
        <div className={`oyster bank ${s.money < 0 ? "overdrawn" : ""}`}>
          <span className="oyster-brand">CURRENT ACCOUNT · {s.name.toUpperCase()}</span>
          <strong>{fmtMoney(s.money)}</strong>
          <span className="small">{s.money < 0 ? "Overdrawn: £5 fee each night" : "Available balance"}</span>
        </div>
        <div className="pcard">
          <span>
            🏠 Rent <strong>£{AREAS.find((a) => a.id === s.home)!.rent}</strong> due {daysToRent === 0 ? "tonight" : `in ${daysToRent} day${daysToRent > 1 ? "s" : ""}`} (Sunday night)
          </span>
          <span>
            💼 Wages <strong>£{wage(s)}</strong> per full workday
          </span>
        </div>
        <h4>Transactions</h4>
        <ul className="taps">
          {s.ledger.slice(0, 40).map((l, i) => (
            <li key={i}>
              <span className="muted small">
                D{l.day} {fmtClock(l.clock)}
              </span>
              <span>{l.label}</span>
              <span className={l.amount < 0 ? "neg" : "pos"}>
                {l.amount < 0 ? "−" : "+"}£{Math.abs(l.amount).toFixed(2)}
              </span>
            </li>
          ))}
          {!s.ledger.length && <li className="muted small">No transactions yet.</li>}
        </ul>
      </div>
    </div>
  );
}

export function JobsApp() {
  const life = useLifeOr("💼 Jobs");
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!("version" in life)) return life;
  const s = life;
  const job = JOB[s.job];
  const need = perfToPromote(s.level);
  return (
    <div className="app">
      <AppHeader title="💼 Jobs" />
      <div className="app-body">
        <div className="pcard">
          <strong>{job.titles[s.level - 1]}</strong>
          <span className="muted small">
            {job.place} · {STATION[job.station].name}
          </span>
          {s.level < 5 ? (
            <>
              <span className="small">
                Promotion progress {Math.max(0, s.performance)}/{need}
              </span>
              <div className="xpbar">
                <div style={{ width: `${Math.max(0, Math.min(100, (s.performance / need) * 100))}%` }} />
              </div>
            </>
          ) : (
            <span className="small">👑 Top of the ladder!</span>
          )}
          <span className="muted small">On-time streak: {s.onTimeStreak} day{s.onTimeStreak === 1 ? "" : "s"}</span>
        </div>
        <h4>Your ladder</h4>
        <ol className="ladder">
          {job.titles.map((t, i) => (
            <li key={t} className={i + 1 === s.level ? "now" : i + 1 < s.level ? "done" : ""}>
              <span>{t}</span>
              <span className="muted small">£{job.pay[i]}/day</span>
            </li>
          ))}
        </ol>
        <h4>Other jobs</h4>
        <ul className="plist">
          {JOBS.filter((j) => j.id !== s.job).map((j) => {
            const lvl = Math.max(1, s.level - 1);
            return (
              <li key={j.id} className="job-row">
                <span>
                  <strong>{j.titles[lvl - 1]}</strong>
                  <span className="muted small">
                    {" "}
                    · {STATION[j.station].name} · £{j.pay[lvl - 1]}/day
                  </span>
                </span>
                {confirm === j.id ? (
                  <button
                    className="pbtn small"
                    onClick={() => {
                      act((st) => changeJob(st, j.id));
                      setConfirm(null);
                    }}
                  >
                    Confirm switch
                  </button>
                ) : (
                  <button className="pbtn small ghosty" onClick={() => setConfirm(j.id)}>
                    Switch
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="muted small">Switching starts you one level lower than you are now, with your progress reset.</p>
      </div>
    </div>
  );
}

export function HomesApp() {
  const life = useLifeOr("🔑 Homes");
  if (!("version" in life)) return life;
  const s = life;
  return (
    <div className="app">
      <AppHeader title="🔑 Homes" />
      <div className="app-body">
        <p className="muted small">Moving costs one week's rent as a deposit. Your commute and weekly rent change straight away.</p>
        <ul className="plist">
          {AREAS.map((a) => (
            <li key={a.id} className={`home-row ${a.id === s.home ? "current" : ""}`}>
              <span className="prow-main">
                <span className="prow-title">
                  {a.name} <span className="muted small">zone {STATION[a.id].zone}</span>
                </span>
                <span className="prow-sub">{a.blurb}</span>
              </span>
              <span className="prow-meta">
                <strong>£{a.rent}/wk</strong>
                {a.id === s.home ? (
                  <span className="tag">You live here</span>
                ) : (
                  <button className="pbtn small" disabled={s.money < a.rent} onClick={() => act((st) => moveHome(st, a.id))}>
                    Move
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function BadgesApp() {
  const { life } = useLife();
  const got = new Set(life?.badges ?? []);
  return (
    <div className="app">
      <AppHeader title="🏅 Badges" right={<span className="muted small">{got.size}/{BADGES.length}</span>} />
      <div className="app-body">
        <div className="badges">
          {BADGES.map((b) => (
            <div key={b.id} className={`badge-tile ${got.has(b.id) ? "on" : ""}`}>
              <span className="badge-emoji">{got.has(b.id) ? b.emoji : "🔒"}</span>
              <strong className="small">{b.name}</strong>
              <span className="muted small">{b.description}</span>
            </div>
          ))}
        </div>
        {!life && <p className="muted small">Badges are earned in your Tube Life.</p>}
      </div>
    </div>
  );
}

export function TodayApp() {
  const [c, setC] = useState<TodayChallenge | null>(null);
  const [error, setError] = useState(false);
  const now = useNow();
  const { rows, rank } = useDailyBoard(c?.day);
  useEffect(() => {
    getTodayChallenge()
      .then(setC)
      .catch(() => setError(true));
  }, []);
  const rec = c ? loadDailyRecords()[c.day] : undefined;
  const streak = myDailyStreak(c?.day);
  const sc = streakCopy(streak);
  const board = rows ?? [];
  return (
    <div className="app">
      <AppHeader title="📅 Today" />
      <div className="app-body">
        <div className={`pcard daily-streak ${streak.atRisk ? "at-risk" : ""}`}>
          <strong>{sc.headline}</strong>
          <span className="muted small">{sc.sub}</span>
        </div>
        {error && <p className="perror">Couldn't load today's challenge.</p>}
        {!c && !error && <p className="muted small">Checking TfL…</p>}
        {c && (
          <div className="pcard">
            <div className="today-head">
              <span className="daily-num">#{challengeNumber(c.day)}</span>
              <span className="small">{fmtChallengeDate(c.day)}</span>
            </div>
            <strong>
              {STATION[c.mission.from].name} → {STATION[c.mission.to].name}
            </strong>
            <span className="small">
              Leave {fmtTime(c.mission.start)} · due {fmtTime(c.mission.deadline)} · budget {fmtMoney(c.mission.budget)}
            </span>
            {c.source === "live" && <span className="small">🔴 Closures live from TfL</span>}
            <span className="muted small">
              {rec ? `You scored ${rec.points.toLocaleString()} today${rank ? `: #${rank.rank} of ${rank.total}` : ""}.` : "One shot: your first run today is scored."}
            </span>
            <button
              className="pbtn"
              onClick={() => {
                closePhone();
                navigateGame("daily");
              }}
            >
              {rec ? "See leaderboard" : "Play today's challenge"}
            </button>
            <span className="muted small">⏳ Next challenge in {fmtCountdown(msUntilNextChallenge(now))}</span>
          </div>
        )}
        <h4>Top today</h4>
        <ol className="league">
          {board.slice(0, 10).map((r, i) => (
            <li key={r.user_id} className="row between small">
              <span>
                {i + 1}. {r.profiles?.avatar} {r.profiles?.name}
              </span>
              <strong>{r.points.toLocaleString()}</strong>
            </li>
          ))}
          {!board.length && c && <li className="muted small">No runs yet. Be first!</li>}
          {rank && rank.rank > 10 && (
            <li className="row between small">
              <span>You're #{rank.rank} of {rank.total}</span>
              <strong>{rank.row.points.toLocaleString()}</strong>
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}
