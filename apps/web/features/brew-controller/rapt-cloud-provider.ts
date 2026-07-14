import type { BrewControllerProvider } from "./contracts";

/** providerId устройств RAPT (brew_devices.provider_id) — см. features/device-streams/ingest-rapt.ts. */
export const RAPT_PROVIDER_ID = "rapt-cloud";

/**
 * M4 (docs/specs/third-party-fermentation-devices.md §7): включён — вебхук-ingest
 * реализован (features/device-streams/ingest-rapt.ts + user_integrations). Мы
 * НИЧЕГО не пушим в RAPT (нет их API-клиента, нет партнёрского доступа к записи) —
 * поэтому capabilities сужены до приёмных: телеметрия/лог брожения/лог варки.
 * profile_push и recipe_push сознательно убраны (были в заглушке enabled:false) —
 * без них deviceSupportsRecipePush('rapt-cloud') === false, и стрим-гарды
 * (device-picker-list, brew-recipe-flow, пульт) не предложат «Сварить на
 * устройстве» для RAPT-подключений (см. stream-provider.test.ts).
 */
export const raptCloudProvider: BrewControllerProvider = {
  id: RAPT_PROVIDER_ID,
  label: "KegLand RAPT Cloud",
  enabled: true,
  capabilities: ["telemetry", "fermentation_logging", "brew_logging"]
  // Методов не реализует (readTelemetry/pushRecipe/sendCommand/…): RAPT сам
  // пушит нам данные вебхуком (ingest-rapt.ts), обратного канала нет и не будет
  // (§1 «управлять чужим железом мы не пытаемся»).
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
