import { Suspense } from "react";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { FERMENT_HISTORY_LIMIT, FERMENT_HISTORY_WINDOW_DAYS, TELEMETRY_HISTORY_LIMIT } from "@/features/brew-batches/contracts";
import { getProviderForDevice, deviceChannel } from "@/features/brew-controller";
import { mapFermentationPlanToDeviceSteps } from "@/features/brew-controller/ferment-profile";
import { getDeviceById, getDeviceHistory, getLastKnownDeviceMode, isDemoDevice } from "@/features/devices/service";
import { isFermenterModeRow } from "@/features/devices/fermenter-binding-core";
import { findBatchForFermenter } from "@/features/devices/fermenter-binding";
import { listPushableRecipes } from "@/features/devices/onboard-recipes";
import { DeviceConsole, type DeviceConsoleView } from "@/features/devices/components/device-console";
import type { FermenterBatchLink } from "@/features/brew-controller/components/ferment-dashboard-view";

// Пульт устройства L2 (зона B): живой нагрев устройства БЕЗ привязки к партии +
// базовое управление (опасное гейтится на сервере). Серверно: requireUser →
// устройство (ownership) → начальная история телеметрии для графика + (H3, §8)
// ferment{} конфига (best-effort — офлайн не должен ронять страницу) и бродящая
// партия, привязанная к прибору-ферментеру (§8.4), с маппингом её плана в
// ступени прибора (§13) — заранее, для «Из плана рецепта» на пульте ферментации.
export default async function DeviceConsolePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const device = await getDeviceById(user.id, id);
  if (!device) {
    notFound();
  }

  const provider = getProviderForDevice(device);
  // best-effort: прибор офлайн/провайдер недоступен → конфиг null, пульт честно
  // покажет «конфиг недоступен» вместо падения страницы.
  const configPromise = provider?.readConfig
    ? provider.readConfig({ userId: user.id, deviceId: device.id }).catch(() => null)
    : Promise.resolve(null);

  const [lastKnownMode, fermenterBatch, pushableRecipes, configResult] = await Promise.all([
    getLastKnownDeviceMode(user.id, device.id),
    findBatchForFermenter(user.id, device.id),
    listPushableRecipes(user.id),
    configPromise,
  ]);

  const fermentConfigUnavailable = Boolean(provider?.readConfig) && configResult === null;
  const initialFermentConfig = configResult?.ferment ?? null;

  // §14: last-known режим (без живой SSE-подписки на сервере) решает, каким
  // окном грузить историю — ferment живёт неделями и не укладывается в варочный
  // лимит точек (см. banner getDeviceHistory).
  const likelyFermenting = lastKnownMode ? isFermenterModeRow(lastKnownMode.appMode, lastKnownMode.stage) : false;
  const initialHistory = await getDeviceHistory(
    user.id,
    device.id,
    likelyFermenting ? FERMENT_HISTORY_LIMIT : TELEMETRY_HISTORY_LIMIT,
    likelyFermenting ? FERMENT_HISTORY_WINDOW_DAYS : undefined,
  );

  const planMapping = fermenterBatch
    ? mapFermentationPlanToDeviceSteps(fermenterBatch.brewPlanSnapshot.fermentationPlan)
    : null;
  const fermenterBatchLink: FermenterBatchLink | null = fermenterBatch
    ? { id: fermenterBatch.id, name: fermenterBatch.name, href: `/app/brew-batches/${fermenterBatch.id}` }
    : null;

  const view: DeviceConsoleView = {
    id: device.id,
    name: device.name,
    hardwareId: device.hardwareId,
    providerId: device.providerId,
    status: device.status,
    fw: device.fw,
    localUrl: device.localUrl,
    mqttPrefix: device.mqttPrefix,
    capabilities: device.capabilities,
    lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
    createdAt: device.createdAt.toISOString(),
    isDemo: isDemoDevice(device),
    channel: deviceChannel(device),
  };

  return (
    // DeviceConsole читает ?kiosk=1 (useSearchParams требует Suspense-границу).
    <Suspense fallback={null}>
      <DeviceConsole
        device={view}
        initialHistory={initialHistory}
        pushableRecipes={pushableRecipes}
        initialFermentConfig={initialFermentConfig}
        fermentConfigUnavailable={fermentConfigUnavailable}
        fermenterBatch={fermenterBatchLink}
        planMapping={planMapping}
      />
    </Suspense>
  );
}
