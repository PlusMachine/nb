export const BREW_STEP_TYPES = [
  "info",
  "confirmation",
  "timer",
  "measurement",
  "ingredient_addition",
  "transition"
] as const;

export type BrewStepType = (typeof BREW_STEP_TYPES)[number];

export const BREW_STAGES = [
  "preparation",
  "mash",
  "lauter_sparge",
  "boil",
  "chill_transfer",
  "finish"
] as const;

export type BrewStage = (typeof BREW_STAGES)[number];

export interface BrewStep {
  id: string;
  type: BrewStepType;
  stage: BrewStage;
  title: string;
  instruction: string;
  durationSeconds: number | null;
  requiresConfirmation: boolean;
  payload?: unknown;
  meta?: Record<string, unknown>;
}
