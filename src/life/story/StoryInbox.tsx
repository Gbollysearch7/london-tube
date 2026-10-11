import { openPhone } from "../../phone/nav";
import { dayName, fmtClock } from "../engine";
import { useLife } from "../store";
import { CAST } from "./cast";
import { activePlans, threads } from "./hook";
import { CharAvatar, Replies } from "./phone";
import "./story.css";

/** Newest unanswered text with inline replies, plus today's plans. Hidden when there's nothing. */
export default function StoryInbox() {
  const { life } = useLife();
  if (!life) return null;
  const waiting = threads(life).filter((t) => t.choices.length > 0);
  const plans = activePlans(life);
  if (!waiting.length && !plans.length) return null;
  const top = waiting[0];

  // The texts since you last replied, newest few only.
  const recent = top ? top.msgs.slice(top.msgs.map((m) => m.from).lastIndexOf("me") + 1).slice(-3) : [];

  return (
    <div className="card story-inbox">
      {top && (
        <>
          <div className="card-head">
            <button className="story-who" onClick={() => openPhone({ app: "story", id: top.id })}>
              <CharAvatar c={top.character} size={30} />
              <span>
                <strong>{top.character.name}</strong>
                <span className="muted small"> · {top.character.role}</span>
              </span>
            </button>
            {waiting.length > 1 && (
              <button className="link small" onClick={() => openPhone({ app: "messages" })}>
                +{waiting.length - 1} more
              </button>
            )}
          </div>
          <div className="story-texts">
            {recent.map((m, i) => (
              <p key={i} className="story-text">
                {m.text}
              </p>
            ))}
          </div>
          <Replies id={top.id} choices={top.choices} compact />
        </>
      )}
      {plans.length > 0 && (
        <ul className="story-plans">
          {plans.map((p, i) => (
            <li key={i}>
              <span aria-hidden>{CAST[p.characterId].emoji}</span>
              <span className="story-plan-main">
                <strong>{p.label}</strong>
                <span className="muted small">
                  {p.day === life.day ? "Today" : dayName(p.day)} {fmtClock(p.from)}–{fmtClock(p.until)} · be at {p.stationName}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
