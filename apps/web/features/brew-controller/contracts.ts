export type BrewControllerCapability =
  | "telemetry"
  | "manual_control"
  | "profile_push"
  | "recipe_push"
  | "live_session_control"
  | "fermentation_logging"
  | "brew_logging";

export type BrewControllerProviderDescriptor = {
  id: string;
  label: string;
  capabilities: BrewControllerCapability[];
  enabled: boolean;
};

export type BrewControllerProvider = BrewControllerProviderDescriptor & {
  pushRecipe?: (input: { userId: string; brewBatchId: string; brewPlanSnapshot: Record<string, unknown> }) => Promise<{ externalId?: string | null }>;
};

export type TelemetryProvider = BrewControllerProviderDescriptor & {
  readTelemetry?: (input: { userId: string; deviceId: string }) => Promise<Record<string, unknown>>;
};

export type RecipeTransferProvider = BrewControllerProviderDescriptor & {
  transferRecipe: (input: { userId: string; recipeId: string; brewPlanSnapshot: Record<string, unknown> }) => Promise<{ externalId?: string | null }>;
};
