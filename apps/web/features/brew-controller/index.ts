import type { BrewControllerProvider } from "./contracts";
import { brewforgeProvider } from "./brewforge-provider";
import { raptCloudProvider } from "./rapt-cloud-provider";

export * from "./contracts";
export { raptCloudProvider } from "./rapt-cloud-provider";
export { brewforgeProvider } from "./brewforge-provider";

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

/** Возвращает включённый провайдер по id либо undefined (нет/выключен). */
export function getProvider(providerId: string): BrewControllerProvider | undefined {
  const provider = registry.get(providerId);
  return provider?.enabled ? provider : undefined;
}

/** Все включённые (enabled) провайдеры. */
export function listProviders(): BrewControllerProvider[] {
  return [...registry.values()].filter((provider) => provider.enabled);
}
