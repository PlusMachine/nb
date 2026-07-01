import type { BrewControllerProvider } from "./contracts";
import { brewforgeDemoProvider, brewforgeProvider } from "./brewforge-provider";
import { raptCloudProvider } from "./rapt-cloud-provider";

export * from "./contracts";
export { raptCloudProvider } from "./rapt-cloud-provider";
export { brewforgeProvider, brewforgeDemoProvider, deviceChannel } from "./brewforge-provider";
export type { DeviceChannel } from "./telemetry-source";

// Реестр провайдеров контроллера. Провайдеры регистрируются по `id`; читатели
// (getProvider/listProviders) видят только включённые (enabled) провайдеры.
const registry = new Map<string, BrewControllerProvider>();

/**
 * Регистрирует провайдер в реестре (последний с тем же id перекрывает прежний).
 * Встроенные провайдеры регистрируются ниже; хук остаётся открытым для поздней
 * (внешней) регистрации дополнительных провайдеров.
 */
export function registerProvider(provider: BrewControllerProvider): void {
  registry.set(provider.id, provider);
}

// Встроенные провайдеры. BrewForge — полноценный контроллер (enabled), RAPT —
// облачная заглушка (enabled:false), её getProvider/listProviders отфильтруют.
registerProvider(raptCloudProvider);
registerProvider(brewforgeProvider);
// Прод-демо провайдер (Phase 4.5): те же методы, транспорт — in-process SimDevice.
registerProvider(brewforgeDemoProvider);

/**
 * Провайдер для конкретного устройства по его providerId (per-device dispatch,
 * Phase 4.5). Тонкая обёртка над getProvider: brewforge → железо/симулятор LAN/
 * облако, brewforge-demo → in-process стаб. Централизует «какой провайдер у этого
 * устройства», чтобы call sites не хардкодили "brewforge".
 */
export function getProviderForDevice(device: { providerId: string }): BrewControllerProvider | undefined {
  return getProvider(device.providerId);
}

/** Возвращает включённый провайдер по id либо undefined (нет/выключен). */
export function getProvider(providerId: string): BrewControllerProvider | undefined {
  const provider = registry.get(providerId);
  return provider?.enabled ? provider : undefined;
}

/** Все включённые (enabled) провайдеры. */
export function listProviders(): BrewControllerProvider[] {
  return [...registry.values()].filter((provider) => provider.enabled);
}
