import { useState } from "react";
import { fmtMoney } from "../../game/format";
import { LINE, STATION } from "../../game/network";
import { AppHeader } from "../../phone/ui";
import { closePhone } from "../../phone/nav";
import { navigateGame } from "../../phone/gameBridge";
import type { LifeState } from "../engine";
import { act, useLife } from "../store";
import { boosted, buy, buyAdvert, daysLeft, economyOf, openBusiness, owns, sellBusiness, seasonStatus, upgradeBusiness, weeklyGoals, weeklyTakings } from "./core";
import { ALL_THREE_BONUS, GRADE_STEPS, SEASON_WEEKS } from "./goals";
import { AD_LINES, CATEGORIES, FOOTFALL, ITEM, MAX_BUSINESSES, SHOP, STATION_IDS, TIERS, linesAt, tierCost, type ShopCategory, type ShopItem } from "./items";
import { GoalBar, SeasonBar } from "./SeasonCard";
import "./economy.css";

// Phone apps for the economy: Shop (passes, comforts, home, businesses, status) and Goals.

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

const byFootfall = [...STATION_IDS].sort((a, b) => FOOTFALL[b] - FOOTFALL[a]);
const stationName = (id: string) => STATION[id]?.name ?? id;

// --- Shop -----------------------------------------------------------------------------------

export function ShopApp() {
  const { life } = useLife();
  const [cat, setCat] = useState<ShopCategory>("travel");
  if (!life) return <NoLife title="🛍️ Shop" />;
  return (
    <div className="app">
      <AppHeader title="🛍️ Shop" right={<span className="small">{fmtMoney(life.money)}</span>} />
      <div className="tabs eco-tabs">
        {CATEGORIES.map((c) => (
          <button key={c.id} className={cat === c.id ? "on" : ""} onClick={() => setCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="app-body">
        {cat === "business" ? (
          <Businesses s={life} />
        ) : (
          <ul className="plist">
            {SHOP.filter((i) => i.cat === cat).map((i) => (
              <ItemRow key={i.id} s={life} item={i} />
            ))}
          </ul>
        )}
        {cat === "travel" && <p className="muted small">Passes change what you pay, never where you can go. Bought passes count towards this week's travel spending.</p>}
      </div>
    </div>
  );
}

function ItemRow({ s, item }: { s: LifeState; item: ShopItem }) {
  const [pick, setPick] = useState(item.needs === "station" ? s.home : item.needs === "line" ? "victoria" : "");
  const left = daysLeft(s, item.id);
  const permanent = item.days === undefined && !item.needs && owns(s, item.id);
  const mine = item.needs ? economyOf(s).owned.filter((o) => o.id === item.id) : [];
  const opts = item.needs === "station" ? { station: pick } : item.needs === "line" ? { line: pick } : {};
  return (
    <li className="eco-item">
      <span className="prow-main">
        <span className="prow-title">
          {item.emoji} {item.name}
        </span>
        <span className="prow-sub">{item.blurb}</span>
        {left !== null && <span className="tag live">Active · {left} day{left === 1 ? "" : "s"} left</span>}
        {mine.length > 0 && <span className="muted small">Yours: {mine.map((o) => (o.station ? stationName(o.station) : LINE[o.line ?? ""]?.name)).join(", ")}</span>}
        {item.needs && (
          <select className="eco-select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={item.needs === "station" ? "Station" : "Line"}>
            {(item.needs === "station" ? STATION_IDS : AD_LINES).map((id) => (
              <option key={id} value={id}>
                {item.needs === "station" ? stationName(id) : LINE[id].name}
              </option>
            ))}
          </select>
        )}
      </span>
      <span className="prow-meta">
        <strong>£{item.price}</strong>
        {permanent ? (
          <span className="tag">Owned</span>
        ) : (
          <button className="pbtn small" disabled={s.money < item.price} onClick={() => act((st) => buy(st, item.id, opts))}>
            {left !== null ? "Renew" : "Buy"}
          </button>
        )}
      </span>
    </li>
  );
}

function Businesses({ s }: { s: LifeState }) {
  const e = economyOf(s);
  const [station, setStation] = useState(byFootfall.find((id) => !e.businesses.some((b) => b.station === id)) ?? "oxford");
  const [selling, setSelling] = useState<string | null>(null);
  const yourLines = [...new Set(e.businesses.flatMap((b) => linesAt(b.station)))];
  const [line, setLine] = useState(yourLines[0] ?? "victoria");
  const openCost = tierCost(station, 0);
  const advertLeft = e.advert && s.day < e.advert.expires ? e.advert.expires - s.day : 0;
  return (
    <>
      <p className="muted small">
        Trade where the commuters are. Takings come in every night, more on weekdays. Up to {MAX_BUSINESSES} pitches.
      </p>
      <ul className="plist">
        {e.businesses.map((b) => {
          const t = TIERS[b.tier];
          const nextCost = b.tier < TIERS.length - 1 ? tierCost(b.station, b.tier + 1) : null;
          return (
            <li key={b.station} className="eco-item">
              <span className="prow-main">
                <span className="prow-title">
                  {t.emoji} {t.name} · {stationName(b.station)}
                </span>
                <span className="prow-sub">
                  ≈ £{weeklyTakings(s, b)}/week · earned £{b.earned.toLocaleString()} of £{b.invested.toLocaleString()} invested
                  {boosted(s, b.station) ? " · 📣 boosted" : ""}
                </span>
              </span>
              <span className="prow-meta eco-actions">
                {nextCost !== null && (
                  <button className="pbtn small" disabled={s.money < nextCost} onClick={() => act((st) => upgradeBusiness(st, b.station))}>
                    {TIERS[b.tier + 1].emoji} £{nextCost.toLocaleString()}
                  </button>
                )}
                {selling === b.station ? (
                  <button
                    className="pbtn small ghosty"
                    onClick={() => {
                      act((st) => sellBusiness(st, b.station));
                      setSelling(null);
                    }}
                  >
                    Sell for £{Math.round(b.invested / 2).toLocaleString()}
                  </button>
                ) : (
                  <button className="pbtn small ghosty" onClick={() => setSelling(b.station)}>
                    Sell
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {e.businesses.length < MAX_BUSINESSES && (
        <div className="pcard">
          <strong>☕ Open a coffee cart</strong>
          <select className="eco-select" value={station} onChange={(ev) => setStation(ev.target.value)} aria-label="Station">
            {byFootfall
              .filter((id) => !e.businesses.some((b) => b.station === id))
              .map((id) => (
                <option key={id} value={id}>
                  {stationName(id)} · ≈{FOOTFALL[id]}m a year · £{tierCost(id, 0)}
                </option>
              ))}
          </select>
          <span className="muted small">
            ≈ £{weeklyTakings(s, { station, tier: 0, invested: 0, openedDay: 0, earned: 0 })}/week. Then grow it: {TIERS.map((t) => t.name.toLowerCase()).join(" → ")}.
          </span>
          <button className="pbtn" disabled={s.money < openCost} onClick={() => act((st) => openBusiness(st, station))}>
            Open for £{openCost}
          </button>
          <span className="muted small">Footfall figures are approximate annual entries and exits.</span>
        </div>
      )}
      {e.businesses.length > 0 && (
        <div className="pcard">
          <strong>📣 Line advert · £{ITEM.advert.price} for 7 days</strong>
          <span className="muted small">+35% takings at your pitches on that line.{advertLeft ? ` Running on the ${LINE[e.advert!.line].name}: ${advertLeft} days left.` : ""}</span>
          <select className="eco-select" value={line} onChange={(ev) => setLine(ev.target.value)} aria-label="Line">
            {(yourLines.length ? yourLines : AD_LINES).map((id) => (
              <option key={id} value={id}>
                {LINE[id].name}
              </option>
            ))}
          </select>
          <button className="pbtn" disabled={s.money < ITEM.advert.price} onClick={() => act((st) => buyAdvert(st, line))}>
            Book advert
          </button>
        </div>
      )}
    </>
  );
}

// --- Goals ------------------------------------------------------------------------------------

export function GoalsApp() {
  const { life } = useLife();
  if (!life) return <NoLife title="🎯 Goals" />;
  const season = seasonStatus(life);
  const goals = weeklyGoals(life);
  const e = economyOf(life);
  const daysToMonday = 7 - ((life.day - 1) % 7);
  return (
    <div className="app">
      <AppHeader title="🎯 Goals" right={<span className="muted small">S{season.season} · W{season.week}</span>} />
      <div className="app-body">
        <div className="pcard">
          <strong>This week</strong>
          <span className="muted small">
            New goals in {daysToMonday} day{daysToMonday === 1 ? "" : "s"}. All three: +£{ALL_THREE_BONUS.reward} and {ALL_THREE_BONUS.xp} XP{season.bonus ? " ✅" : ""}.
          </span>
          {goals.map((g) => (
            <GoalBar key={g.goal.id} g={g} />
          ))}
        </div>
        <div className="pcard">
          <strong>
            Season {season.season} · week {season.week}/{SEASON_WEEKS}
          </strong>
          {season.goals.map((g) => (
            <SeasonBar key={g.id} g={g} />
          ))}
          <span className="muted small">
            Grades: {GRADE_STEPS.filter((g) => g.min > 0).map((g) => `${g.grade} ${g.min}+`).join(" · ")}
          </span>
        </div>
        {e.history.length > 0 && (
          <>
            <h4>Report cards</h4>
            <ul className="plist">
              {e.history.map((h, i) => (
                <li key={h.season} className="eco-item">
                  <span className="prow-main">
                    <span className="prow-title">Season {h.season}</span>
                    <span className="prow-sub">{e.titles[i]}</span>
                  </span>
                  <span className={`eco-grade small g-${h.grade}`}>{h.grade}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
