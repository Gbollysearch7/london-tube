import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { fmtTime } from "../game/format";
import { MISSIONS } from "../game/missions";
import { LINE, STATION } from "../game/network";
import { conversationTitle } from "../online/logic";
import { connect, getOnline, onIncomingMessage, postActivity, setStatus, syncScore, totalUnread, useOnline } from "../online/store";
import type { Message } from "../online/types";
import { ChatApp, MessagesApp, NewGroupApp } from "./apps/Messages";
import { ClockApp, FaresApp, GoApp, WalletApp, WeatherApp } from "./apps/Commute";
import { ArrivalsApp, StatusApp } from "./apps/Live";
import { BadgesApp, BankApp, HomesApp, JobsApp, TodayApp } from "./apps/LifeApps";
import { GoalsApp, ShopApp } from "../life/economy/phone";
import { StoryThread, storyUnread } from "../life/story/phone";
import { useLife } from "../life/store";
import { HelpApp, InviteApp, PostcardsApp, TipsApp, TunesApp } from "./apps/Extras";
import { ContactsApp, FeedApp, LeagueApp, PlayerApp, SettingsApp } from "./apps/Social";
import { useGameView, useTicker } from "./gameBridge";
import { closePhone, home, openPhone, push, togglePhone, usePhoneNav, type AppId, type Screen } from "./nav";
import { usePrefs } from "./prefs";
import { buzz, sfx } from "../juice";
import { AppIcon, ICON_BG } from "./icons";
import { JOB } from "../life/data";
import { dayDisruption, dayName, describeDisruption, fmtClock, mood } from "../life/engine";
import { challengeDay } from "../life/daily";
import { weeklyGoals } from "../life/economy/core";
import { TFL_LINE_COLORS, fetchLineStatus, useLive } from "../live/tfl";
import { loadDailyRecords } from "../life/store";

interface HomeApp {
  id: AppId;
  label: string;
}

const APPS: Record<string, HomeApp> = Object.fromEntries(
  (
    [
      ["today", "Today"],
      ["goals", "Goals"],
      ["shop", "Shop"],
      ["bank", "Bank"],
      ["jobs", "Jobs"],
      ["homes", "Homes"],
      ["status", "Line Status"],
      ["arrivals", "Arrivals"],
      ["clock", "Clock"],
      ["weather", "Weather"],
      ["feed", "The Commute"],
      ["league", "League"],
      ["badges", "Badges"],
      ["postcards", "Postcards"],
      ["tunes", "Tunes"],
      ["fares", "Fare Finder"],
      ["tips", "Tips"],
      ["invite", "Invite"],
      ["help", "Help"],
      ["settings", "Settings"],
      ["messages", "Messages"],
      ["contacts", "Contacts"],
      ["go", "Go"],
      ["wallet", "Oyster"],
    ] as [AppId, string][]
  ).map(([id, label]) => [id, { id, label }]),
);

/** Home screen pages (page one sits under a widget, like a real iPhone). */
const PAGES: AppId[][] = [
  ["today", "goals", "shop", "bank", "jobs", "homes", "status", "arrivals", "clock", "weather", "feed", "league"],
  ["badges", "postcards", "tunes", "fares", "tips", "invite", "help", "settings"],
];
const DOCK: AppId[] = ["messages", "contacts", "go", "wallet"];

function renderApp(screen: Screen): ReactElement {
  switch (screen.app) {
    case "messages":
      return <MessagesApp />;
    case "chat":
      return <ChatApp id={screen.id ?? ""} />;
    case "newgroup":
      return <NewGroupApp id={screen.id} />;
    case "contacts":
      return <ContactsApp />;
    case "player":
      return <PlayerApp id={screen.id ?? ""} />;
    case "go":
      return <GoApp />;
    case "status":
      return <StatusApp />;
    case "arrivals":
      return <ArrivalsApp />;
    case "weather":
      return <WeatherApp />;
    case "wallet":
      return <WalletApp />;
    case "clock":
      return <ClockApp />;
    case "fares":
      return <FaresApp />;
    case "feed":
      return <FeedApp />;
    case "league":
      return <LeagueApp />;
    case "postcards":
      return <PostcardsApp />;
    case "tunes":
      return <TunesApp />;
    case "tips":
      return <TipsApp />;
    case "invite":
      return <InviteApp />;
    case "help":
      return <HelpApp />;
    case "settings":
      return <SettingsApp />;
    case "bank":
      return <BankApp />;
    case "jobs":
      return <JobsApp />;
    case "homes":
      return <HomesApp />;
    case "today":
      return <TodayApp />;
    case "badges":
      return <BadgesApp />;
    case "story":
      return <StoryThread id={screen.id ?? ""} />;
    case "shop":
      return <ShopApp />;
    case "goals":
      return <GoalsApp />;
  }
}

/** Keeps other players up to date with what you're doing, and posts finishes to the feed. */
function useShareGame() {
  const g = useGameView();
  const s = useOnline();
  const posted = useRef<unknown>(null);
  useTicker(2000);
  const ready = s.status.kind === "ready";

  const leg = g.journey?.link;
  const status =
    g.screen === "life" && g.lifeStatus
      ? g.lifeStatus
      : g.screen === "daily"
        ? "Playing Today in London 📅"
        : g.screen === "ride" && g.mission
      ? g.journey?.done
        ? `Arrived at ${STATION[g.mission.to].name} · ${g.mission.title}`
        : leg
          ? `${leg.mode === "walk" ? "Walking" : leg.mode === "bike" ? "Cycling" : LINE[leg.line].name} → ${STATION[leg.to].name} · ${g.mission.title}`
          : `Riding · ${g.mission.title}`
      : g.screen === "plan" && g.mission
        ? `Planning ${g.mission.title}`
        : g.screen === "result" && g.mission && g.outcome
          ? `Finished ${g.mission.title} ${"★".repeat(g.outcome.stars)}`
          : "Browsing missions";

  useEffect(() => {
    if (ready) setStatus(status);
  }, [ready, status]);

  const stars = MISSIONS.reduce((n, m) => n + (g.progress[m.id]?.stars ?? 0), 0);
  const points = MISSIONS.reduce((n, m) => n + (g.progress[m.id]?.best ?? 0), 0);
  useEffect(() => {
    if (ready) void syncScore(stars, points);
  }, [ready, stars, points]);

  useEffect(() => {
    if (!ready || g.screen !== "result" || !g.outcome || !g.mission || posted.current === g.outcome) return;
    posted.current = g.outcome;
    const me = getOnline().me;
    if (!me) return;
    const o = g.outcome;
    void postActivity(
      o.onTime
        ? `${me.avatar} ${me.name} got ${"★".repeat(o.stars)}${"☆".repeat(3 - o.stars)} on ${g.mission.title} · ${o.points.toLocaleString()} pts`
        : `${me.avatar} ${me.name} arrived late on ${g.mission.title} 😬`,
    );
  }, [ready, g.screen, g.outcome, g.mission]);
}

interface Banner {
  key: number;
  message: Message;
}

export default function Phone() {
  const nav = usePhoneNav();
  const prefs = usePrefs();
  const s = useOnline();
  const g = useGameView();
  const [banner, setBanner] = useState<Banner | null>(null);
  const { life } = useLife();
  const unread = totalUnread(s) + storyUnread(life);
  useShareGame();
  useTicker(1000);

  // Connect in the background so players see you online and texts arrive.
  useEffect(() => {
    void connect();
  }, []);

  // P toggles the phone, Escape closes it; never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "p" || e.key === "P") togglePhone();
      else if (e.key === "Escape" && nav.open) closePhone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav.open]);

  // New texts pop a banner unless that chat is already on screen.
  const viewing = nav.open ? nav.stack[nav.stack.length - 1] : undefined;
  const viewingRef = useRef(viewing);
  viewingRef.current = viewing;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  useEffect(() => {
    let timer = 0;
    const off = onIncomingMessage((m) => {
      const v = viewingRef.current;
      if (!prefsRef.current.notifications || (v?.app === "chat" && v.id === m.conversation_id)) return;
      sfx("ping");
      buzz("tap");
      setBanner({ key: m.id, message: m });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setBanner(null), 4500);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, []);

  const top = nav.stack[nav.stack.length - 1];
  const now = new Date();
  const statusTime = g.journey && !g.journey.done ? fmtTime(g.journey.clock) : `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const bannerView = banner && (
    <button
      key={banner.key}
      className="phone-banner"
      onClick={() => {
        setBanner(null);
        openPhone({ app: "chat", id: banner.message.conversation_id });
      }}
    >
      <span className="banner-icon" style={{ background: ICON_BG.messages }}>
        <AppIcon id="messages" now={now} />
      </span>
      <span className="phone-banner-main">
        <span className="banner-top">
          <strong>
            {s.players[banner.message.sender_id]?.avatar} {s.players[banner.message.sender_id]?.name ?? "New message"}
            {s.me && s.conversations[banner.message.conversation_id]?.kind !== "dm" && (
              <span className="muted"> · {conversationTitle(s.conversations[banner.message.conversation_id], s.me.id, s.players)}</span>
            )}
          </strong>
          <span className="banner-when">now</span>
        </span>
        <span className="banner-body">{banner.message.body}</span>
      </span>
    </button>
  );

  // Checked once a minute rather than on every one-second tick.
  const minute = Math.floor(Date.now() / 60_000);
  const dailyDue = useMemo(() => !loadDailyRecords()[challengeDay(minute * 60_000)], [minute]);
  const badgeFor = (id: AppId) => (id === "messages" ? unread : id === "today" && dailyDue ? 1 : 0);

  return (
    <>
      {!nav.open && (
        <button className="phone-fab" onClick={() => openPhone()} aria-label={unread ? `Phone, ${unread} unread messages` : "Phone"} title="Phone (P)">
          <span className="phone-fab-screen">
            <span className="phone-fab-island" />
          </span>
          {unread > 0 && <span className="ios-badge">{unread > 99 ? "99+" : unread}</span>}
        </button>
      )}
      {!nav.open && bannerView && <div className="phone-banner-wrap">{bannerView}</div>}

      {nav.open && (
        <div className="phone-layer" onClick={(e) => e.target === e.currentTarget && closePhone()}>
          <div className="iphone" role="dialog" aria-label="Phone">
            <span className="iphone-btn iphone-btn-action" aria-hidden />
            <span className="iphone-btn iphone-btn-up" aria-hidden />
            <span className="iphone-btn iphone-btn-down" aria-hidden />
            <span className="iphone-btn iphone-btn-power" aria-hidden />
            <div className={`phone wall-${prefs.wallpaper} ${top ? "in-app" : ""}`}>
              <StatusBar time={statusTime} online={s.status.kind === "ready"} />
              <div className="dynamic-island" aria-hidden />
              {bannerView && <div className="phone-banner-in">{bannerView}</div>}
              <div className="phone-screen">
                {top ? (
                  <div className="ios-app-enter" key={`${top.app}:${top.id ?? ""}:${nav.stack.length}`}>
                    {renderApp(top)}
                  </div>
                ) : (
                  <HomeScreen now={now} badgeFor={badgeFor} />
                )}
              </div>
              <button className="phone-homebar" onClick={() => (top ? home() : closePhone())} aria-label={top ? "Home screen" : "Close phone"} />
            </div>
          </div>
          <button className="phone-close" onClick={closePhone} aria-label="Close phone">
            ✕
          </button>
        </div>
      )}
    </>
  );
}

function StatusBar({ time, online }: { time: string; online: boolean }) {
  return (
    <div className="phone-status">
      <span className="sb-time">{time}</span>
      <span className="sb-icons" aria-label={online ? "Online" : "Offline"}>
        <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={i * 4.7} y={8 - i * 2.6} width="3.2" height={4 + i * 2.6} rx="0.9" fill="currentColor" opacity={online || i < 1 ? 1 : 0.35} />
          ))}
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden>
          <path fill="currentColor" d="M8 11.6 5.7 9.2a3.3 3.3 0 0 1 4.6 0zM3.6 7.1a6.3 6.3 0 0 1 8.8 0l1.4-1.5a8.4 8.4 0 0 0-11.6 0zM.8 4.3a10.3 10.3 0 0 1 14.4 0L16.6 2.8a12.4 12.4 0 0 0-17.2 0z" opacity={online ? 1 : 0.35} />
        </svg>
        <span className="sb-battery" aria-hidden>
          <span style={{ width: "78%" }} />
        </span>
      </span>
    </div>
  );
}

function HomeScreen({ now, badgeFor }: { now: Date; badgeFor: (id: AppId) => number }) {
  const [page, setPage] = useState(0);
  const pager = useRef<HTMLDivElement>(null);
  const go = (i: number) => pager.current?.scrollTo({ left: i * pager.current.clientWidth, behavior: "smooth" });

  return (
    <div className="home">
      <div
        className="home-pages"
        ref={pager}
        onScroll={(e) => {
          const el = e.currentTarget;
          setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {PAGES.map((ids, p) => (
          <div key={p} className="home-page">
            {p === 0 && <LifeWidget />}
            <div className="home-grid">
              {ids.map((id) => (
                <AppTile key={id} app={APPS[id]} now={now} badge={badgeFor(id)} />
              ))}
            </div>
            {p === 0 && (
              <div className="widget-row">
                <StatusWidget />
                <GoalsWidget />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="page-dots" role="tablist" aria-label="Home screen pages">
        {PAGES.map((_, i) => (
          <button key={i} className={i === page ? "on" : ""} onClick={() => go(i)} aria-label={`Page ${i + 1}`} aria-selected={i === page} role="tab" />
        ))}
      </div>
      <div className="home-dock">
        {DOCK.map((id) => (
          <AppTile key={id} app={APPS[id]} now={now} badge={badgeFor(id)} bare />
        ))}
      </div>
    </div>
  );
}

/** iOS-style medium widget: your day at a glance. */
function LifeWidget() {
  const g = useGameView();
  const { life } = useLife();
  const open = (app: AppId) => push({ app });
  if (life) {
    const job = JOB[life.job];
    const next =
      life.work === "pending" && life.clock < 11 * 60
        ? `Shift 09:00 · ${STATION[job.station].name}`
        : life.location === life.home
          ? `Home in ${STATION[life.home].name}`
          : `Out at ${STATION[life.location].name}`;
    const m = mood(life.needs);
    return (
      <button className="widget widget-life" onClick={() => open("go")}>
        <span className="widget-left">
          <span className="widget-kicker">TUBE LIFE · {dayName(life.day).toUpperCase()}</span>
          <span className="widget-big">{fmtClock(life.clock)}</span>
          <span className="widget-line">{next}</span>
          {dayDisruption(life).kind !== "none" && <span className="widget-warn">⚠︎ {describeDisruption(dayDisruption(life))}</span>}
        </span>
        <span className="widget-right">
          <span className="widget-ring" style={{ ["--p" as string]: `${m}%` }}>
            <span>{m}</span>
          </span>
          <span className="widget-small">Mood</span>
          <span className="widget-money">£{life.money.toFixed(0)}</span>
        </span>
      </button>
    );
  }
  return (
    <button className="widget widget-life" onClick={() => open("today")}>
      <span className="widget-left">
        <span className="widget-kicker">TUBE LIFE</span>
        <span className="widget-big">{g.mission ? fmtTime(g.journey?.clock ?? g.mission.start) : "Mind the Gap"}</span>
        <span className="widget-line">{g.mission ? `${g.mission.title} · due ${fmtTime(g.mission.deadline)}` : "Today's challenge is waiting"}</span>
      </span>
      <span className="widget-right">
        <span className="widget-roundel">
          <AppIcon id="status" now={new Date()} />
        </span>
      </span>
    </button>
  );
}

/** Small widget: live TfL line status (cached for a minute by the TfL client). */
function StatusWidget() {
  const { data, error } = useLive((force) => fetchLineStatus(force), 120_000, []);
  const bad = data?.filter((l) => l.level !== "good") ?? [];
  return (
    <button className="widget widget-small-tile" onClick={() => push({ app: "status" })}>
      <span className="widget-kicker">LINE STATUS</span>
      {data ? (
        <>
          <span className="widget-mid">{bad.length ? `${bad.length} ${bad.length === 1 ? "line" : "lines"} disrupted` : "Good service"}</span>
          <span className="widget-lines">
            {bad.slice(0, 2).map((l) => (
              <span key={l.id}>
                <i style={{ background: TFL_LINE_COLORS[l.id] ?? "#888" }} />
                {l.name}
              </span>
            ))}
          </span>
        </>
      ) : (
        <span className="widget-small">{error ? "TfL unavailable" : "Checking TfL…"}</span>
      )}
    </button>
  );
}

/** Small widget: this week's goals. */
function GoalsWidget() {
  const { life } = useLife();
  const goals = life ? weeklyGoals(life) : [];
  const done = goals.filter((g) => g.done).length;
  return (
    <button className="widget widget-small-tile" onClick={() => push({ app: life ? "goals" : "today" })}>
      <span className="widget-kicker">THIS WEEK</span>
      {life ? (
        <>
          <span className="widget-mid">
            {done}/{goals.length} goals
          </span>
          <span className="widget-goals">
            {goals.map((g) => (
              <span key={g.goal.id} className={g.done ? "done" : ""}>
                {g.done ? "✓" : g.goal.emoji} {g.goal.label}
              </span>
            ))}
          </span>
        </>
      ) : (
        <span className="widget-small">Start your Tube Life to get weekly goals</span>
      )}
    </button>
  );
}

function AppTile({ app, now, badge = 0, bare = false }: { app: HomeApp; now: Date; badge?: number; bare?: boolean }) {
  return (
    <button className="app-tile" onClick={() => push({ app: app.id })} aria-label={badge ? `${app.label}, ${badge} new` : app.label}>
      <span className="app-icon" style={{ background: ICON_BG[app.id] ?? "#333" }}>
        <AppIcon id={app.id} now={now} />
        {badge > 0 && <span className="ios-badge">{badge > 99 ? "99+" : badge}</span>}
      </span>
      {!bare && <span className="app-label">{app.label}</span>}
    </button>
  );
}
