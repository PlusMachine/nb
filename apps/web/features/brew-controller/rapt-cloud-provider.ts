import type { BrewControllerProvider } from "./contracts";

export const raptCloudProvider: BrewControllerProvider = {
  id: "rapt-cloud",
  label: "KegLand RAPT Cloud",
  enabled: false,
  capabilities: [
    "telemetry",
    "profile_push",
    "recipe_push",
    "fermentation_logging",
    "brew_logging"
  ],
  // RAPT — облачный провайдер ферментации; пуш рецепта стандартизирован на
  // pushRecipe({ userId, brewBatchId, brewPlanSnapshot }) (бывший transferRecipe
  // удалён вместе с RecipeTransferProvider). Реализация появится в своей фазе.
  async pushRecipe() {
    throw new Error("RAPT_PROVIDER_DISABLED");
  }
  // readTelemetry / sendCommand / openSession / closeSession не реализованы:
  // методы опциональны на базовом BrewControllerProvider, enabled=false.
};

export const raptTokenStorageDesign = {
  storage: "encrypted_user_secret",
  tokenKinds: ["api_token"],
  retryPolicy: {
    maxAttempts: 3,
    backoff: "exponential",
    isolatesProviderErrors: true
  }
};
