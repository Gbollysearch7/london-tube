import { useState } from "react";
import { STATION } from "../game/network";
import { useOnline } from "../online/store";
import { AVATARS } from "../phone/ui";
import { AREAS, JOBS } from "./data";
import { newLife, welcomeBack } from "./engine";
import { emit, setLife } from "./store";

/** A gentle first life: the Victoria line runs straight from Brixton to Oxford Circus. */
const RECOMMENDED = { home: "brixton", job: "retail" };

export default function LifeSetup({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { me } = useOnline();
  const [name, setName] = useState(me?.name ?? "");
  const [avatar, setAvatar] = useState(me?.avatar ?? AVATARS[1]);
  const [home, setHome] = useState("brixton");
  const [job, setJob] = useState("retail");

  const start = () => {
    const life = newLife({ name: name.trim() || "New Londoner", avatar, home, job });
    const { state, events } = welcomeBack(life, Date.now());
    setLife(state, [`🏙️ Welcome to London, ${state.name}!`, ...events]);
    emit({ type: "open", now: Date.now() });
    onDone();
  };

  return (
    <div className="screen life-setup">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          ← Menu
        </button>
        <h2>New life in London</h2>
        <span />
      </header>

      <section className="setup-step">
        <h3>1. Who are you?</h3>
        <div className="row gap-s wrap">
          <input className="setup-name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" />
          <div className="picker">
            {AVATARS.map((a) => (
              <button key={a} className={a === avatar ? "on" : ""} onClick={() => setAvatar(a)} aria-label={`Avatar ${a}`}>
                {a}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="setup-step">
        <h3>2. Where will you live?</h3>
        <p className="muted small">
          Cheaper areas mean longer commutes. First time? Brixton and the shop job are one straight Victoria line ride apart. You can
          move or switch jobs later from the phone.
        </p>
        <div className="choice-grid">
          {AREAS.map((a) => (
            <button key={a.id} className={`choice-card ${home === a.id ? "on" : ""}`} onClick={() => setHome(a.id)}>
              <span className="row between">
                <strong>
                  {a.name} {a.id === RECOMMENDED.home && <span className="tag rec">Recommended</span>}
                </strong>
                <span className="price">£{a.rent}/wk</span>
              </span>
              <span className="muted small">
                Zone {STATION[a.id].zone} · {a.blurb}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="setup-step">
        <h3>3. Where will you work?</h3>
        <p className="muted small">Shifts are 09:00–17:00 on weekdays. Get promoted by turning up on time and in a good mood.</p>
        <div className="choice-grid">
          {JOBS.map((j) => (
            <button key={j.id} className={`choice-card ${job === j.id ? "on" : ""}`} onClick={() => setJob(j.id)}>
              <span className="row between">
                <strong>
                  {j.titles[0]} {j.id === RECOMMENDED.job && <span className="tag rec">Recommended</span>}
                </strong>
                <span className="price">£{j.pay[0]}/day</span>
              </span>
              <span className="muted small">
                {STATION[j.station].name} · {j.place}. Top job: {j.titles[4]} (£{j.pay[4]}/day)
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="setup-go">
        <button className="primary big" onClick={start}>
          Start my London life ▶
        </button>
      </div>
    </div>
  );
}
