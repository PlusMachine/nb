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
  async pushRecipe() {
    throw new Error("RAPT_PROVIDER_DISABLED");
  }
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
