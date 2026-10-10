import { useCallback, useState } from "react";
import Menu from "./components/Menu";
import Planner from "./components/Planner";
import Ride from "./components/Ride";
import Result from "./components/Result";
import type { Journey } from "./game/engine";
import { MISSIONS } from "./game/missions";
import { loadProgress, recordRun, saveProgress, type Progress } from "./game/progress";
import { scoreRun, type Outcome } from "./game/scoring";
import type { Link, Mission } from "./game/types";

type Screen =
  | { name: "menu" }
  | { name: "plan"; mission: Mission; route?: Link[] }
  | { name: "ride"; mission: Mission; route: Link[]; attempt: number }
  | { name: "result"; mission: Mission; route: Link[]; journey: Journey; outcome: Outcome; best: number };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "menu" });
  const [progress, setProgress] = useState<Progress>(loadProgress);

  const finish = useCallback(
    (mission: Mission, route: Link[], journey: Journey) => {
      const outcome = scoreRun(mission, journey.clock, journey.meter.total, journey.stress);
      const best = progress[mission.id]?.best ?? 0;
      setProgress(recordRun(progress, mission.id, outcome.stars, outcome.points));
      setScreen({ name: "result", mission, route, journey, outcome, best });
    },
    [progress],
  );

  switch (screen.name) {
    case "menu":
      return (
        <Menu
          progress={progress}
          onPlay={(mission) => setScreen({ name: "plan", mission })}
          onReset={() => {
            saveProgress({});
            setProgress({});
          }}
        />
      );
    case "plan":
      return (
        <Planner
          key={screen.mission.id}
          mission={screen.mission}
          initialRoute={screen.route}
          onBack={() => setScreen({ name: "menu" })}
          onStart={(route) => setScreen({ name: "ride", mission: screen.mission, route, attempt: Date.now() })}
        />
      );
    case "ride":
      return (
        <Ride
          key={screen.attempt}
          mission={screen.mission}
          route={screen.route}
          onFinish={(j) => finish(screen.mission, screen.route, j)}
          onAbandon={() => setScreen({ name: "plan", mission: screen.mission, route: screen.route })}
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
          onRetry={() => setScreen({ name: "plan", mission: screen.mission, route: screen.route })}
          onNext={() => next && setScreen({ name: "plan", mission: next })}
          onMenu={() => setScreen({ name: "menu" })}
        />
      );
    }
  }
}
