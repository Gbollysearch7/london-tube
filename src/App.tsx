import { useCallback, useEffect, useState } from "react";
import Menu from "./components/Menu";
import Planner from "./components/Planner";
import Ride from "./components/Ride";
import Result from "./components/Result";
import Phone from "./phone/Phone";
import { registerNavigator, setGameView } from "./phone/gameBridge";
import LifeHub from "./life/LifeHub";
import LifeSetup from "./life/LifeSetup";
import { DailyResult, DailyScreen } from "./life/DailyScreens";
import { applyTrip } from "./life/engine";
import { act, emit, getLife, greet, onTextSent } from "./life/store";
import { dailySeed } from "./life/daily";
import { claimDailyAttempt } from "./life/DailyScreens";
import { onMessageSent } from "./online/store";
import type { Journey } from "./game/engine";
import { MISSIONS } from "./game/missions";
import { loadProgress, recordRun, saveProgress, type Progress } from "./game/progress";
import { scoreRun, type Outcome } from "./game/scoring";
import type { Link, Mission } from "./game/types";

/** Which game the planner and ride belong to. */
type Mode = "mission" | "life" | "daily";

type Screen =
  | { name: "menu" }
  | { name: "plan"; mode: Mode; mission: Mission; route?: Link[] }
  | { name: "ride"; mode: Mode; mission: Mission; route: Link[]; attempt: number; quick?: boolean }
  | { name: "result"; mission: Mission; route: Link[]; journey: Journey; outcome: Outcome; best: number }
  | { name: "life" }
  | { name: "life-setup" }
  | { name: "daily" }
  | { name: "daily-result"; mission: Mission; outcome: Outcome; route: Link[] };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "menu" });
  const [progress, setProgress] = useState<Progress>(loadProgress);

  const finish = useCallback(
    (mode: Mode, mission: Mission, route: Link[], journey: Journey) => {
      if (mode === "life") {
        // Phone actions mid-ride (overtime, a call) can move the life clock on; the trip ends that much later.
        const drift = Math.max(0, (getLife()?.clock ?? mission.start) - mission.start);
        const arrival = journey.clock + drift;
        act((s) =>
          applyTrip(s, {
            to: mission.to,
            arrival,
            cost: journey.meter.total,
            stress: journey.stress,
            charges: journey.meter.charges,
            legs: journey.legs.map((l) => ({ mode: l.link.mode, start: l.board + drift })),
          }),
        );
        emit({
          type: "trip",
          from: mission.from,
          to: mission.to,
          start: mission.start + drift,
          arrival,
          cost: journey.meter.total,
          stress: journey.stress,
          route: route.map((l) => l.id),
          charges: journey.meter.charges,
        });
        setScreen({ name: "life" });
        return;
      }
      const outcome = scoreRun(mission, journey.clock, journey.meter.total, journey.stress);
      if (mode === "daily") {
        setScreen({ name: "daily-result", mission, outcome, route });
        return;
      }
      const best = progress[mission.id]?.best ?? 0;
      setProgress(recordRun(progress, mission.id, outcome.stars, outcome.points));
      setScreen({ name: "result", mission, route, journey, outcome, best });
    },
    [progress],
  );

  // Daily streak and rested bonus when the game opens; texting real players feeds Social.
  useEffect(() => {
    greet();
    registerNavigator((to) =>
      setScreen(to === "life" ? (getLife() ? { name: "life" } : { name: "life-setup" }) : to === "daily" ? { name: "daily" } : { name: "menu" }),
    );
    return onMessageSent(() => onTextSent());
  }, []);

  useEffect(() => {
    const hasMission = screen.name === "plan" || screen.name === "ride" || screen.name === "result" || screen.name === "daily-result";
    setGameView({
      screen:
        screen.name === "life" || screen.name === "life-setup"
          ? "life"
          : screen.name === "daily" || screen.name === "daily-result"
            ? "daily"
            : screen.name,
      mission: hasMission ? screen.mission : null,
      route: screen.name === "plan" ? screen.route ?? [] : screen.name === "ride" || screen.name === "result" ? screen.route : [],
      // Ride registers its own live journey, and LifeHub its status (child effects run first, so don't clobber them).
      ...(screen.name === "ride" ? {} : { journey: screen.name === "result" ? screen.journey : null }),
      ...(screen.name === "life" ? {} : { lifeStatus: undefined }),
      outcome: screen.name === "result" || screen.name === "daily-result" ? screen.outcome : null,
      progress,
    });
  }, [screen, progress]);

  return (
    <>
      <Screens screen={screen} setScreen={setScreen} progress={progress} setProgress={setProgress} finish={finish} />
      <Phone />
    </>
  );
}

function Screens({
  screen,
  setScreen,
  progress,
  setProgress,
  finish,
}: {
  screen: Screen;
  setScreen: (s: Screen) => void;
  progress: Progress;
  setProgress: (p: Progress) => void;
  finish: (mode: Mode, mission: Mission, route: Link[], journey: Journey) => void;
}) {
  switch (screen.name) {
    case "menu":
      return (
        <Menu
          progress={progress}
          onLife={() => setScreen(getLife() ? { name: "life" } : { name: "life-setup" })}
          onDaily={() => setScreen({ name: "daily" })}
          onPlay={(mission) => setScreen({ name: "plan", mode: "mission", mission })}
          onReset={() => {
            saveProgress({});
            setProgress({});
          }}
        />
      );
    case "plan":
      return (
        <Planner
          key={`${screen.mode}:${screen.mission.id}:${screen.mission.start}`}
          mission={screen.mission}
          initialRoute={screen.route}
          backLabel={screen.mode === "life" ? "← Back to your day" : screen.mode === "daily" ? "← Today" : "← Missions"}
          onBack={() => setScreen(screen.mode === "life" ? { name: "life" } : screen.mode === "daily" ? { name: "daily" } : { name: "menu" })}
          onStart={(route) => {
            if (screen.mode === "daily") claimDailyAttempt(screen.mission);
            setScreen({ name: "ride", mode: screen.mode, mission: screen.mission, route, attempt: Date.now() });
          }}
        />
      );
    case "ride":
      return (
        <Ride
          key={screen.attempt}
          mission={screen.mission}
          route={screen.route}
          onFinish={(j) => finish(screen.mode, screen.mission, screen.route, j)}
          onAbandon={() => setScreen({ name: "plan", mode: screen.mode, mission: screen.mission, route: screen.route })}
          seed={screen.mode === "daily" ? dailySeed(screen.mission.id.replace("daily-", "")) : undefined}
          initialSpeed={screen.quick ? 4 : 1}
        />
      );
    case "result": {
      const idx = MISSIONS.findIndex((m) => m.id === screen.mission.id);
      const next = MISSIONS[idx + 1];
      return (
        <Result
          mission={screen.mission}
          journey={screen.journey}
          outcome={screen.outcome}
          best={screen.best}
          hasNext={!!next}
          onRetry={() => setScreen({ name: "plan", mode: "mission", mission: screen.mission, route: screen.route })}
          onNext={() => next && setScreen({ name: "plan", mode: "mission", mission: next })}
          onMenu={() => setScreen({ name: "menu" })}
        />
      );
    }
    case "life-setup":
      return <LifeSetup onDone={() => setScreen({ name: "life" })} onBack={() => setScreen({ name: "menu" })} />;
    case "life":
      return getLife() ? (
        <LifeHub
          onTravel={(mission) => setScreen({ name: "plan", mode: "life", mission })}
          onRide={(mission, route) => setScreen({ name: "ride", mode: "life", mission, route, attempt: Date.now(), quick: true })}
          onMenu={() => setScreen({ name: "menu" })}
        />
      ) : (
        <LifeSetup onDone={() => setScreen({ name: "life" })} onBack={() => setScreen({ name: "menu" })} />
      );
    case "daily":
      return <DailyScreen onPlay={(mission) => setScreen({ name: "plan", mode: "daily", mission })} onBack={() => setScreen({ name: "menu" })} />;
    case "daily-result":
      return (
        <DailyResult
          day={screen.mission.id.replace("daily-", "")}
          outcome={screen.outcome}
          route={screen.route}
          onAgain={() => setScreen({ name: "plan", mode: "daily", mission: { ...screen.mission, title: "Today in London · Practice" } })}
          onMenu={() => setScreen({ name: "menu" })}
        />
      );
  }
}
