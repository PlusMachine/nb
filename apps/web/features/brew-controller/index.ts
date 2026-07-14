import type { BrewControllerCapability, BrewControllerProvider } from "./contracts";
import { brewforgeDemoProvider, brewforgeProvider } from "./brewforge-provider";
import { raptCloudProvider } from "./rapt-cloud-provider";
import { streamProvider } from "./stream-provider";

export * from "./contracts";
export { raptCloudProvider } from "./rapt-cloud-provider";
export { brewforgeProvider, brewforgeDemoProvider, deviceChannel } from "./brewforge-provider";
export { streamProvider } from "./stream-provider";
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
// Generic-провайдер стрим-устройств (iSpindel/Tilt/Floaty/BrewPiLess…) — только
// приём телеметрии, без методов управления (см. stream-provider.ts).
registerProvider(streamProvider);

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

/**
 * Провайдер устройства объявляет `capability`? Гейт для мест, что раньше отличали
 * «brewforge или нет» — теперь фильтруем по возможностям, а не по id провайдера
 * (появление новых провайдеров, например stream, не требует правки call site).
 * Выключенный (enabled:false) провайдер всегда даёт false — даже если формально
 * анонсирует capability в дескрипторе: раз провайдер выключен, полагаться на его
 * возможности небезопасно (см. rapt-cloud-provider, пока enabled:false).
 */
export function providerHasCapability(providerId: string, capability: BrewControllerCapability): boolean {
  const provider = registry.get(providerId);
  if (!provider || !provider.enabled) return false;
  return provider.capabilities.includes(capability);
}

/** Шорткат: поддерживает ли устройство пуш рецепта (нужно для «Сварить на устройстве»). */
export function deviceSupportsRecipePush(providerId: string): boolean {
  return providerHasCapability(providerId, "recipe_push");
}
