import type { Result, LifeState } from "./engine";
import type { LifeEvent } from "./events";
import { economyHook } from "./economy/hook";
import { routesHook } from "./routes/hook";
import { storyHook } from "./story/hook";

const HOOKS: ((s: LifeState, ev: LifeEvent) => Result)[] = [routesHook, economyHook, storyHook];

/** Let every system react to a life event, in order, collecting their messages. */
export function runHooks(s: LifeState, ev: LifeEvent): Result {
  const events: string[] = [];
  let state = s;
  for (const hook of HOOKS) {
    const r = hook(state, ev);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}
