import type { Mission } from "./types";

export interface Outcome {
  arrival: number;
  cost: number;
  stress: number;
  onTime: boolean;
  underBudget: boolean;
  calm: boolean;
  stars: number;
  points: number;
}

export const CALM_THRESHOLD = 50;

export function scoreRun(mission: Mission, arrival: number, cost: number, stress: number): Outcome {
  const onTime = arrival <= mission.deadline + 1e-9;
  const underBudget = cost <= mission.budget + 1e-9;
  const calm = stress <= CALM_THRESHOLD;
  const stars = onTime ? 1 + (underBudget ? 1 : 0) + (calm ? 1 : 0) : 0;
  const early = Math.min(15, Math.max(0, mission.deadline - arrival));
  const late = Math.max(0, arrival - mission.deadline);
  const points = Math.max(
    0,
    Math.round((onTime ? 1000 : 300) + early * 10 - late * 40 + (mission.budget - cost) * 150 + (100 - stress) * 3),
  );
  return { arrival, cost, stress: Math.round(stress), onTime, underBudget, calm, stars, points };
}
