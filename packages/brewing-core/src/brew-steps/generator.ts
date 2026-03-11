import type { RecipeProcessInput } from "../types/recipe";
import type { BrewStep } from "./types";

const toStepId = (prefix: string, index: number): string => `${prefix}-${index + 1}`;

export const generateBrewSteps = (input: RecipeProcessInput): BrewStep[] => {
  const steps: BrewStep[] = [];

  steps.push({
    id: toStepId("preparation", steps.length),
    type: "info",
    stage: "preparation",
    title: "Prepare equipment",
    instruction: `Sanitize and prepare equipment for ${input.name}.`,
    durationSeconds: null,
    requiresConfirmation: true
  });

  steps.push({
    id: toStepId("mash", steps.length),
    type: "transition",
    stage: "mash",
    title: "Mash in",
    instruction: "Heat strike water and mash in grains.",
    durationSeconds: null,
    requiresConfirmation: true
  });

  if (input.mashRests?.length) {
    input.mashRests.forEach((rest, idx) => {
      steps.push({
        id: `mash-rest-${idx + 1}`,
        type: "timer",
        stage: "mash",
        title: `Mash rest: ${rest.name}`,
        instruction: `Hold mash at ${rest.temperatureC}°C for ${rest.durationMinutes} minutes.`,
        durationSeconds: rest.durationMinutes * 60,
        requiresConfirmation: false,
        payload: { temperatureC: rest.temperatureC }
      });
    });
  } else if (input.mashDurationMinutes) {
    steps.push({
      id: toStepId("mash-timer", steps.length),
      type: "timer",
      stage: "mash",
      title: "Main mash rest",
      instruction: `Hold mash for ${input.mashDurationMinutes} minutes.`,
      durationSeconds: input.mashDurationMinutes * 60,
      requiresConfirmation: false
    });
  }

  if (input.hasSparge ?? true) {
    steps.push({
      id: toStepId("sparge", steps.length),
      type: "transition",
      stage: "lauter_sparge",
      title: "Lauter and sparge",
      instruction: "Recirculate until clear, then sparge to collect pre-boil wort.",
      durationSeconds: null,
      requiresConfirmation: true
    });
  }

  steps.push({
    id: toStepId("boil", steps.length),
    type: "timer",
    stage: "boil",
    title: "Boil wort",
    instruction: `Start ${input.boilTimeMinutes}-minute boil timer.`,
    durationSeconds: input.boilTimeMinutes * 60,
    requiresConfirmation: false
  });

  const boilHopAdditions = (input.hopAdditions ?? [])
    .filter((addition) => (addition.use ?? "boil") === "boil")
    .sort((a, b) => b.boilTimeMinutes - a.boilTimeMinutes);

  boilHopAdditions.forEach((addition, idx) => {
    steps.push({
      id: `hop-addition-${idx + 1}`,
      type: "ingredient_addition",
      stage: "boil",
      title: `Hop addition: ${addition.name}`,
      instruction: `Add ${addition.weightG} g at ${addition.boilTimeMinutes} min remaining.`,
      durationSeconds: null,
      requiresConfirmation: true,
      payload: addition
    });
  });

  if (input.whirlpoolMinutes && input.whirlpoolMinutes > 0) {
    steps.push({
      id: toStepId("whirlpool", steps.length),
      type: "timer",
      stage: "boil",
      title: "Whirlpool",
      instruction: `Whirlpool for ${input.whirlpoolMinutes} minutes.`,
      durationSeconds: input.whirlpoolMinutes * 60,
      requiresConfirmation: false
    });
  }

  steps.push({
    id: toStepId("chill", steps.length),
    type: "measurement",
    stage: "chill_transfer",
    title: "Chill and transfer",
    instruction: "Chill wort to pitching temperature and transfer to fermenter.",
    durationSeconds: null,
    requiresConfirmation: true,
    payload: {
      targetTemperatureC: input.fermentationTemperatureC ?? 20
    }
  });

  steps.push({
    id: toStepId("pitch", steps.length),
    type: "confirmation",
    stage: "finish",
    title: "Pitch yeast",
    instruction: "Aerate wort and pitch yeast.",
    durationSeconds: null,
    requiresConfirmation: true
  });

  steps.push({
    id: toStepId("finish", steps.length),
    type: "info",
    stage: "finish",
    title: "Brew day complete",
    instruction: "Seal fermenter, set fermentation temperature, and log brew details.",
    durationSeconds: null,
    requiresConfirmation: false
  });

  return steps;
};
