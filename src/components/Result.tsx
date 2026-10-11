import { useEffect, useMemo } from "react";
import type { Journey } from "../game/engine";
import { fmtMoney, fmtTime } from "../game/format";
import { STATION } from "../game/network";
import { CALM_THRESHOLD, type Outcome } from "../game/scoring";
import { solve } from "../game/solver";
import type { Mission } from "../game/types";
import { Confetti, buzz, sfx } from "../juice";
import "../juice/juice.css";

interface Props {
  mission: Mission;
  journey: Journey;
  outcome: Outcome;
  best: number;
  hasNext: boolean;
  onRetry: () => void;
  onNext: () => void;
  onMenu: () => void;
}

export default function Result({ mission, journey, outcome, best, hasNext, onRetry, onNext, onMenu }: Props) {
  const ref = useMemo(() => solve(mission), [mission]);
  const finale = !hasNext && outcome.stars > 0;
  const headline = !outcome.onTime
    ? "Late! The doors closed without you."
    : outcome.stars === 3
      ? "Perfect commute. A true Londoner."
      : outcome.stars === 2
        ? "Made it. Not bad at all."
        : "Made it… just about.";

  // 3 stars get confetti + fanfare via <Confetti />; late gets the sting; anything else a modest coin.
  useEffect(() => {
    if (!outcome.onTime) {
      sfx("late");
      buzz("late");
    } else if (outcome.stars > 0 && outcome.stars < 3) {
      sfx("coin");
    }
  }, [outcome]);

  return (
    <div className="screen result">
      <div className="result-card">
        <p className="eyebrow">{mission.title}</p>
        <h2>{headline}</h2>
        {outcome.onTime && outcome.stars === 3 && <Confetti kind="big" fire={outcome} />}
        <div className="stars juice-stars" aria-label={`${outcome.stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < outcome.stars ? "star on" : "star"}>
              ★
            </span>
          ))}
        </div>

        <ul className="checks">
          <li className={outcome.onTime ? "ok" : "no"}>
            {outcome.onTime ? "✓" : "✗"} Arrived {fmtTime(outcome.arrival)} (due {fmtTime(mission.deadline)})
          </li>
          <li className={outcome.underBudget ? "ok" : "no"}>
            {outcome.underBudget ? "✓" : "✗"} Spent {fmtMoney(outcome.cost)} (budget {fmtMoney(mission.budget)})
          </li>
          <li className={outcome.calm ? "ok" : "no"}>
            {outcome.calm ? "✓" : "✗"} Stress {outcome.stress} (calm is {CALM_THRESHOLD} or under)
          </li>
        </ul>

        <div className="score">
          <span className="score-val">{outcome.points.toLocaleString()}</span>
          <span className="muted">points · best {Math.max(best, outcome.points).toLocaleString()}</span>
        </div>

        <details className="receipt">
          <summary>Your receipt</summary>
          <ul>
            {journey.meter.charges.map((c, i) => (
              <li key={i}>
                <span>
                  {fmtTime(c.time)} {c.label}
                </span>
                <span>{fmtMoney(c.amount)}</span>
              </li>
            ))}
            <li className="total">
              <span>Total</span>
              <span>{fmtMoney(journey.meter.total)}</span>
            </li>
          </ul>
          {journey.log.length > 0 && (
            <>
              <h4>What happened</h4>
              <ul className="events">
                {journey.log.map((l, i) => (
                  <li key={i}>
                    {fmtTime(l.time)} {l.text}
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>

        <div className="benchmarks">
          {ref.fastest && (
            <div>
              <span className="muted small">Fastest possible</span>
              <strong>{fmtTime(ref.fastest.est.arrival)}</strong>
            </div>
          )}
          {ref.cheapestOnTime && (
            <div>
              <span className="muted small">Cheapest on time</span>
              <strong>{fmtMoney(ref.cheapestOnTime.est.cost)}</strong>
            </div>
          )}
          <div>
            <span className="muted small">Destination</span>
            <strong>{STATION[mission.to].name}</strong>
          </div>
        </div>

        {finale && (
          <p className="tip finale">
            <strong>🏁 That's every mission done.</strong> You've crossed London end to end. Go back for any stars you missed.
          </p>
        )}

        <p className="tip">
          <strong>Local tip:</strong> {mission.tip}
        </p>

        <div className="row gap-s wrap center">
          <button className="ghost" onClick={onMenu}>
            Missions
          </button>
          <button className={hasNext && outcome.stars > 0 ? "ghost" : "primary"} onClick={onRetry}>
            Try again
          </button>
          {hasNext && outcome.stars > 0 && (
            <button className="primary" onClick={onNext}>
              Next mission →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
