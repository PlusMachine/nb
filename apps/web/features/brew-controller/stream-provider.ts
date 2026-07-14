// =============================================================================
//  features/brew-controller/stream-provider.ts
//  Generic-провайдер стрим-устройств ферментации (iSpindel, Tilt, Floaty,
//  GravityMon, BrewPiLess и совместимые) — устройства, которые ТОЛЬКО пушат нам
//  телеметрию по HTTP (см. docs/specs/third-party-fermentation-devices.md).
//  Управлять ими мы не можем и не пытаемся: методов (pushRecipe/sendCommand/…)
//  провайдер не реализует. Дескриптор нужен, чтобы:
//   - существующие generic-ветки (transportForDevice, getProviderForDevice,
//     onboard-recipes/profiles/log-sync/OTA/command роуты) находили ОПРЕДЕЛЁННЫЙ
//     провайдер вместо undefined и вежливо отваливались по отсутствию метода,
//     а не по «провайдер не найден»;
//   - фильтры «Сварить на устройстве» (providerHasCapability/
//     deviceSupportsRecipePush, см. index.ts) видели этот providerId и прятали
//     стрим-устройства из пикеров запуска варки.
// =============================================================================
import type { BrewControllerProvider } from "./contracts";
import { STREAM_PROVIDER_ID } from "./contracts";

export const streamProvider: BrewControllerProvider = {
  id: STREAM_PROVIDER_ID,
  label: "Цифровые ареометры и датчики",
  enabled: true,
  capabilities: ["fermentation_logging"]
  // Намеренно без методов: устройство ничего не принимает (нет двусторонней
  // связи), поэтому pushRecipe/sendCommand/openSession и т.д. отсутствуют.
};
